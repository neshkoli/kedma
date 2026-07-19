import fs from 'node:fs';
import path from 'node:path';

const EPISODES_DIR = path.resolve('src/content/episodes');

function isMediaLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('<iframe') ||
    /^\[?!\[.*\]\(.*\)\]?\(.*\)/.test(trimmed) ||
    /^!\[.*\]\(.*\)/.test(trimmed) ||
    trimmed.startsWith('###') ||
    trimmed.startsWith('##')
  );
}

function findCaptionAfter(lines, startIndex) {
  let captionIndex = -1;
  let caption = '';

  for (let i = startIndex; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed === '---') continue;
    if (isMediaLine(lines[i])) break;

    caption = trimmed;
    captionIndex = i;
    break;
  }

  return { caption, captionIndex };
}

function captionToAlt(caption) {
  return caption.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}

function cleanupOrphanSeparators(content) {
  const match = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!match) return content;
  const body = match[2].replace(/^\s*---\s*$/gm, '');
  return match[1] + body;
}

function processContent(content) {
  const lines = content.split('\n');
  const result = [];
  const consumed = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;

    const line = lines[i];
    const trimmed = line.trim();

    const iframeMatch = trimmed.match(
      /<iframe[^>]*\ssrc="(https:\/\/www\.youtube\.com\/embed\/[^"]+)"[^>]*><\/iframe>/
    );
    if (iframeMatch) {
      const url = iframeMatch[1];
      const { caption, captionIndex } = findCaptionAfter(lines, i + 1);
      const alt = caption ? captionToAlt(caption) : '';
      result.push(`![${alt}](${url})`);
      if (captionIndex >= 0) consumed.add(captionIndex);
      continue;
    }

    const linkedImageMatch = line.match(
      /^\[!\[\]\(([^)]+)\)\]\(([^)]+)\)\s*$/
    );
    if (linkedImageMatch) {
      const [, src, href] = linkedImageMatch;
      const { caption, captionIndex } = findCaptionAfter(lines, i + 1);
      const alt = caption ? captionToAlt(caption) : '';
      result.push(`[![${alt}](${src})](${href})`);
      if (captionIndex >= 0) consumed.add(captionIndex);
      continue;
    }

    const imageMatch = line.match(/^!\[\]\(([^)]+)\)\s*$/);
    if (imageMatch) {
      const [, src] = imageMatch;
      const { caption, captionIndex } = findCaptionAfter(lines, i + 1);
      const alt = caption ? captionToAlt(caption) : '';
      result.push(`![${alt}](${src})`);
      if (captionIndex >= 0) consumed.add(captionIndex);
      continue;
    }

    result.push(line);
  }

  return cleanupOrphanSeparators(result.join('\n'));
}

function walkDir(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (entry.name.endsWith('.mdx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walkDir(EPISODES_DIR);
let iframeCount = 0;
let imageCaptionCount = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const processed = processContent(original);

  const iframesBefore = (original.match(/<iframe/g) || []).length;
  const iframesAfter = (processed.match(/<iframe/g) || []).length;
  iframeCount += iframesBefore - iframesAfter;

  const emptyImagesBefore = (original.match(/!\[\]\(/g) || []).length;
  const emptyImagesAfter = (processed.match(/!\[\]\(/g) || []).length;
  imageCaptionCount += emptyImagesBefore - emptyImagesAfter;

  const mdPath = file.replace(/\.mdx$/, '.md');
  fs.writeFileSync(mdPath, processed, 'utf8');
  fs.unlinkSync(file);
}

console.log(`Processed ${files.length} files`);
console.log(`Converted ${iframeCount} iframes`);
console.log(`Added captions to ${imageCaptionCount} images`);
