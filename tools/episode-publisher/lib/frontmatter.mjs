/**
 * Serialize episode markdown matching existing Kedma frontmatter style.
 * Omits Spotify (future phase). Omits undefined/empty optional fields.
 *
 * @param {{
 *   title: string,
 *   date: string,
 *   slug: string,
 *   tags?: string[],
 *   image: string,
 *   imageCaption?: string,
 *   audioUrl: string,
 *   audioFile: string,
 *   duration: string,
 *   period?: number,
 *   periodName?: string,
 *   body: string,
 * }} fields
 */
export function serializeEpisodeMarkdown(fields) {
  if (!fields.title?.trim()) throw new Error('title is required');
  if (!fields.date) throw new Error('date is required');
  if (!fields.slug) throw new Error('slug is required');
  if (!fields.image) throw new Error('image is required');
  if (!fields.audioUrl) throw new Error('audioUrl is required');
  if (!fields.audioFile) throw new Error('audioFile is required');
  if (!fields.duration) throw new Error('duration is required');

  const tags = Array.isArray(fields.tags) ? fields.tags : [];
  const lines = [
    '---',
    `title: ${yamlScalar(fields.title)}`,
    `date: '${fields.date}'`,
    `slug: ${fields.slug}`,
    `tags: ${JSON.stringify(tags)}`,
    `image: ${fields.image}`,
  ];

  if (fields.imageCaption?.trim()) {
    lines.push(`imageCaption: ${yamlScalar(fields.imageCaption.trim())}`);
  }

  lines.push(`audioUrl: ${fields.audioUrl}`);
  lines.push(`audioFile: ${yamlScalar(fields.audioFile)}`);
  lines.push(`duration: '${fields.duration}'`);

  if (fields.period !== undefined && fields.period !== null && fields.period !== '') {
    const n = Number(fields.period);
    if (!Number.isFinite(n)) throw new Error('period must be a number');
    lines.push(`period: ${n}`);
  }

  if (fields.periodName?.trim()) {
    lines.push(`periodName: ${yamlScalar(fields.periodName.trim())}`);
  }

  lines.push('---');
  const body = (fields.body ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const normalizedBody = body.replace(/^\n+/, '');
  const withTrailing =
    normalizedBody === '' || normalizedBody.endsWith('\n') ? normalizedBody : `${normalizedBody}\n`;
  return `${lines.join('\n')}\n\n${withTrailing}`;
}

/** Quote when needed for YAML scalar safety. */
function yamlScalar(value) {
  const s = String(value);
  if (s === '') return "''";
  if (/[:#{}[\],&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s) || s.includes('\n')) {
    return JSON.stringify(s);
  }
  // Hebrew / plain titles without special YAML tokens stay unquoted like existing files
  return s;
}
