import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Walk episodes root and return the next numeric episode id (max basename + 1).
 * @param {string} episodesRoot Absolute path to src/content/episodes
 */
export async function findNextEpisodeNumber(episodesRoot) {
  let max = 0;
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const base = entry.name.replace(/\.md$/i, '');
      if (/^\d+$/.test(base)) {
        max = Math.max(max, Number(base));
      }
    }
  }
  await walk(episodesRoot);
  return max + 1;
}

/**
 * @param {Date} [now]
 * @returns {{ year: string, month: string, date: string }}
 */
export function suggestDefaults(now = new Date()) {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return {
    year,
    month,
    date: `${year}-${month}-${day}`,
  };
}

/**
 * @param {{
 *   repoRoot: string,
 *   year: string|number,
 *   month: string|number,
 *   number: string|number,
 *   audioExt?: string,
 *   publicBaseUrl?: string,
 * }} input
 */
export function buildEpisodePaths(input) {
  const year = String(input.year);
  const month = String(input.month).padStart(2, '0');
  const number = String(input.number);
  const audioExt = (input.audioExt || '.mp3').replace(/^\./, '');
  const publicBaseUrl = (input.publicBaseUrl || 'https://audio.kedma.xyz').replace(/\/$/, '');

  const relMd = path.join('src', 'content', 'episodes', year, month, `${number}.md`);
  const relImagesDir = path.join('public', 'images', 'episodes', year, month, number);
  const r2Key = `episodes/${year}/${month}/${number}.${audioExt}`;
  const slug = `${year}/${month}/${number}.html`;
  const publicImageBase = `/images/episodes/${year}/${month}/${number}`;

  return {
    year,
    month,
    number,
    slug,
    r2Key,
    audioUrl: `${publicBaseUrl}/${r2Key}`,
    publicImageBase,
    mdPath: path.join(input.repoRoot, relMd),
    imagesDir: path.join(input.repoRoot, relImagesDir),
    relMd,
    relImagesDir,
  };
}

/**
 * Site-absolute path for an image filename under the episode folder.
 * @param {string} publicImageBase e.g. /images/episodes/2026/08/78
 * @param {string} filename
 */
export function episodeImageSrc(publicImageBase, filename) {
  const base = publicImageBase.replace(/\/$/, '');
  const name = path.basename(filename);
  return `${base}/${name}`;
}
