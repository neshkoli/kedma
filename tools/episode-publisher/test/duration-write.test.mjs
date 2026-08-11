import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { formatDuration } from '../lib/duration.mjs';
import { writeEpisodeFiles } from '../lib/write-files.mjs';
import { buildEpisodePaths } from '../lib/episode-paths.mjs';

describe('formatDuration', () => {
  it('formats hours minutes seconds', () => {
    assert.equal(formatDuration(0), '00:00:00');
    assert.equal(formatDuration(65), '00:01:05');
    assert.equal(formatDuration(3661), '01:01:01');
  });
});

describe('writeEpisodeFiles', () => {
  it('writes cover, body images, and markdown', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'kedma-write-'));
    const paths = buildEpisodePaths({
      repoRoot,
      year: '2026',
      month: '08',
      number: '78',
    });

    const result = await writeEpisodeFiles({
      paths,
      cover: { buffer: Buffer.from('cover'), filename: 'cover.png' },
      images: [{ buffer: Buffer.from('img'), filename: 'slide.png' }],
      fields: {
        title: 'פרק 78',
        date: '2026-08-11',
        slug: paths.slug,
        tags: [],
        audioUrl: paths.audioUrl,
        audioFile: '78.mp3',
        duration: '00:10:00',
        body: '![x](/images/episodes/2026/08/78/slide.png)\n',
        coverFileName: 'cover.png',
      },
    });

    assert.equal(result.coverSrc, '/images/episodes/2026/08/78/cover.png');
    const md = await readFile(paths.mdPath, 'utf8');
    assert.match(md, /image: \/images\/episodes\/2026\/08\/78\/cover\.png/);
    assert.match(md, /slide\.png/);
    const cover = await readFile(path.join(paths.imagesDir, 'cover.png'));
    assert.equal(cover.toString(), 'cover');
  });
});
