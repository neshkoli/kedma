import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { buildEpisodePaths } from './episode-paths.mjs';
import { writeEpisodeFiles } from './write-files.mjs';
import { uploadAudio } from './r2.mjs';
import { gitPublish } from './git.mjs';

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   repoRoot: string,
 *   env: NodeJS.ProcessEnv,
 *   year: string|number,
 *   month: string|number,
 *   number: string|number,
 *   title: string,
 *   date: string,
 *   tags?: string[],
 *   imageCaption?: string,
 *   period?: number|string,
 *   periodName?: string,
 *   duration: string,
 *   body: string,
 *   audio: { path: string, filename: string, contentType?: string },
 *   cover: { buffer: Buffer, filename: string },
 *   images?: Array<{ buffer: Buffer, filename: string }>,
 *   overwrite?: boolean,
 *   dryRun?: boolean,
 * }} input
 */
export async function publishEpisode(input) {
  /** @type {string[]} */
  const completedSteps = [];
  const dryRun = Boolean(input.dryRun ?? input.env.PUBLISH_DRY_RUN === '1');
  const publicBaseUrl = input.env.R2_PUBLIC_BASE_URL || 'https://audio.kedma.xyz';
  const audioExt = path.extname(input.audio.filename || input.audio.path) || '.mp3';

  const paths = buildEpisodePaths({
    repoRoot: input.repoRoot,
    year: input.year,
    month: input.month,
    number: input.number,
    audioExt,
    publicBaseUrl,
  });

  try {
    if (!input.overwrite && (await pathExists(paths.mdPath))) {
      throw new Error(`Episode already exists at ${paths.relMd}. Refuse to overwrite.`);
    }
    completedSteps.push('validate');

    await uploadAudio({
      env: input.env,
      key: paths.r2Key,
      filePath: input.audio.path,
      contentType: input.audio.contentType || 'audio/mpeg',
      dryRun,
    });
    completedSteps.push(dryRun ? 'r2-skipped' : 'r2');

    const periodRaw = input.period;
    const period =
      periodRaw === '' || periodRaw === undefined || periodRaw === null
        ? undefined
        : Number(periodRaw);

    const { written, coverSrc } = await writeEpisodeFiles({
      paths,
      overwrite: input.overwrite,
      cover: input.cover,
      images: input.images || [],
      fields: {
        title: input.title,
        date: input.date,
        slug: paths.slug,
        tags: input.tags || [],
        imageCaption: input.imageCaption,
        audioUrl: paths.audioUrl,
        audioFile: input.audio.filename,
        duration: input.duration,
        period,
        periodName: input.periodName,
        body: input.body,
      },
    });
    completedSteps.push('write-files');

    const gitResult = await gitPublish({
      repoRoot: input.repoRoot,
      paths: [paths.relMd, paths.relImagesDir],
      message: `Add episode ${paths.number}: ${input.title}`,
      dryRun,
    });
    completedSteps.push(dryRun ? 'git-skipped' : 'git-push');

    return {
      ok: true,
      dryRun,
      completedSteps,
      paths,
      coverSrc,
      written,
      git: gitResult,
      sitePath: `/${paths.slug}`,
      audioUrl: paths.audioUrl,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    /** @type {any} */ (error).completedSteps = completedSteps;
    /** @type {any} */ (error).paths = paths;
    throw error;
  }
}
