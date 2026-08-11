import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { serializeEpisodeMarkdown } from './frontmatter.mjs';
import { episodeImageSrc } from './episode-paths.mjs';

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
 *   paths: { mdPath: string, imagesDir: string, publicImageBase: string },
 *   fields: {
 *     title: string,
 *     date: string,
 *     slug: string,
 *     tags?: string[],
 *     imageCaption?: string,
 *     audioUrl: string,
 *     audioFile: string,
 *     duration: string,
 *     period?: number,
 *     periodName?: string,
 *     body: string,
 *   },
 *   cover: { buffer: Buffer, filename: string },
 *   images?: Array<{ buffer: Buffer, filename: string }>,
 *   overwrite?: boolean,
 * }} options
 */
export async function writeEpisodeFiles(options) {
  const { paths, fields, cover, images = [], overwrite = false } = options;

  if (!overwrite && (await pathExists(paths.mdPath))) {
    throw new Error(`episode markdown already exists: ${paths.mdPath}`);
  }

  await mkdir(paths.imagesDir, { recursive: true });

  const coverName = path.basename(cover.filename);
  const coverDest = path.join(paths.imagesDir, coverName);
  await writeFile(coverDest, cover.buffer);

  const written = [coverDest];
  for (const image of images) {
    const name = path.basename(image.filename);
    const dest = path.join(paths.imagesDir, name);
    await writeFile(dest, image.buffer);
    written.push(dest);
  }

  const coverSrc = episodeImageSrc(paths.publicImageBase, coverName);
  const markdown = serializeEpisodeMarkdown({
    title: fields.title,
    date: fields.date,
    slug: fields.slug,
    tags: fields.tags,
    image: coverSrc,
    imageCaption: fields.imageCaption,
    audioUrl: fields.audioUrl,
    audioFile: fields.audioFile,
    duration: fields.duration,
    period: fields.period,
    periodName: fields.periodName,
    body: fields.body,
  });

  await mkdir(path.dirname(paths.mdPath), { recursive: true });
  await writeFile(paths.mdPath, markdown, 'utf8');
  written.push(paths.mdPath);

  return { written, coverSrc };
}
