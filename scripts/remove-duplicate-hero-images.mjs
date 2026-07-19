import fs from 'node:fs';
import path from 'node:path';

const EPISODES_DIR = path.resolve('src/content/episodes');
const IMAGE_SRC_RE = /!\[[^\]]*\]\(([^)]+)\)/;

function walkDir(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizeImagePath(value) {
  const raw = value.trim().split('?')[0];
  try {
    return decodeURIComponent(raw.replace(/^\//, ''));
  } catch {
    return raw.replace(/^\//, '');
  }
}

function imagePathsMatch(metaImage, bodySrc) {
  const meta = normalizeImagePath(metaImage);
  const src = normalizeImagePath(bodySrc);
  return meta === src || src.endsWith(meta) || meta.endsWith(src);
}

function parseEpisode(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const imageMatch = match[1].match(/^image:\s*(.+)$/m);
  return {
    frontmatter: match[1],
    body: match[2],
    image: imageMatch?.[1]?.trim(),
  };
}

function removeDuplicateHeroImage(body, metaImage) {
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const imageMatch = lines[i].match(IMAGE_SRC_RE);
    if (!imageMatch) continue;
    if (!imagePathsMatch(metaImage, imageMatch[1])) continue;

    lines[i] = '---';
    return lines.join('\n');
  }

  return body;
}

let updated = 0;

for (const file of walkDir(EPISODES_DIR)) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = parseEpisode(raw);
  if (!parsed?.image) continue;

  const newBody = removeDuplicateHeroImage(parsed.body, parsed.image);
  if (newBody === parsed.body) continue;

  const output = `---\n${parsed.frontmatter}\n---\n${newBody}`;
  fs.writeFileSync(file, output, 'utf8');
  updated += 1;
}

console.log(`Updated ${updated} episode files`);
