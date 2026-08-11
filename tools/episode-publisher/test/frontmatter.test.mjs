import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { serializeEpisodeMarkdown } from '../lib/frontmatter.mjs';

describe('serializeEpisodeMarkdown', () => {
  it('matches episode shape without spotify', () => {
    const md = serializeEpisodeMarkdown({
      title: 'פרק 78 • בדיקה',
      date: '2026-08-11',
      slug: '2026/08/78.html',
      tags: ['היסטוריה'],
      image: '/images/episodes/2026/08/78/cover.png',
      imageCaption: 'כיתוב',
      audioUrl: 'https://audio.kedma.xyz/episodes/2026/08/78.mp3',
      audioFile: '78 test.mp3',
      duration: '00:12:34',
      period: 1800,
      periodName: 'המאה ה-19',
      body: 'שורה ראשונה\n\nשורה שנייה\n',
    });

    assert.match(md, /^---\n/);
    assert.doesNotMatch(md, /spotify/);
    assert.match(md, /title: פרק 78 • בדיקה\n/);
    assert.match(md, /date: '2026-08-11'\n/);
    assert.match(md, /slug: 2026\/08\/78\.html\n/);
    assert.match(md, /tags: \["היסטוריה"\]\n/);
    assert.match(md, /image: \/images\/episodes\/2026\/08\/78\/cover\.png\n/);
    assert.match(md, /imageCaption: כיתוב\n/);
    assert.match(md, /audioUrl: https:\/\/audio\.kedma\.xyz\/episodes\/2026\/08\/78\.mp3\n/);
    assert.match(md, /audioFile: 78 test\.mp3\n/);
    assert.match(md, /duration: '00:12:34'\n/);
    assert.match(md, /period: 1800\n/);
    assert.match(md, /periodName: המאה ה-19\n/);
    assert.match(md, /---\n\nשורה ראשונה\n\nשורה שנייה\n$/);
  });

  it('omits empty optionals', () => {
    const md = serializeEpisodeMarkdown({
      title: 'T',
      date: '2026-08-11',
      slug: '2026/08/78.html',
      tags: [],
      image: '/images/episodes/2026/08/78/c.png',
      audioUrl: 'https://audio.kedma.xyz/episodes/2026/08/78.mp3',
      audioFile: 'a.mp3',
      duration: '00:01:00',
      body: 'hi',
    });
    assert.doesNotMatch(md, /imageCaption/);
    assert.doesNotMatch(md, /period/);
    assert.match(md, /tags: \[\]\n/);
  });
});
