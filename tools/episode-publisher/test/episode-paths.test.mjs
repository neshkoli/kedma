import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildEpisodePaths,
  episodeImageSrc,
  findNextEpisodeNumber,
  suggestDefaults,
} from '../lib/episode-paths.mjs';

describe('suggestDefaults', () => {
  it('formats year month and ISO date from a fixed day', () => {
    const d = new Date(2026, 7, 11); // Aug 11, 2026 local
    assert.deepEqual(suggestDefaults(d), {
      year: '2026',
      month: '08',
      date: '2026-08-11',
    });
  });
});

describe('findNextEpisodeNumber', () => {
  it('returns 1 for empty tree', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kedma-ep-'));
    assert.equal(await findNextEpisodeNumber(root), 1);
  });

  it('returns max numeric basename + 1', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kedma-ep-'));
    await mkdir(path.join(root, '2026', '05'), { recursive: true });
    await writeFile(path.join(root, '2026', '05', '77.md'), '---\ntitle: x\n---\n');
    await mkdir(path.join(root, '2025', '12'), { recursive: true });
    await writeFile(path.join(root, '2025', '12', '75.md'), '---\ntitle: y\n---\n');
    assert.equal(await findNextEpisodeNumber(root), 78);
  });
});

describe('buildEpisodePaths', () => {
  it('builds md, image, slug, and R2 paths', () => {
    const paths = buildEpisodePaths({
      repoRoot: '/repo',
      year: 2026,
      month: 8,
      number: 78,
      audioExt: 'mp3',
    });
    assert.equal(paths.slug, '2026/08/78.html');
    assert.equal(paths.r2Key, 'episodes/2026/08/78.mp3');
    assert.equal(paths.audioUrl, 'https://audio.kedma.xyz/episodes/2026/08/78.mp3');
    assert.equal(paths.publicImageBase, '/images/episodes/2026/08/78');
    assert.equal(paths.mdPath, path.join('/repo', 'src/content/episodes/2026/08/78.md'));
    assert.equal(paths.imagesDir, path.join('/repo', 'public/images/episodes/2026/08/78'));
  });
});

describe('episodeImageSrc', () => {
  it('joins base and basename', () => {
    assert.equal(
      episodeImageSrc('/images/episodes/2026/08/78', 'cover.png'),
      '/images/episodes/2026/08/78/cover.png',
    );
  });
});
