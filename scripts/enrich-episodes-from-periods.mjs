import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERIODS_PATH = path.join(ROOT, 'Takeout/periods.json');
const EPISODES_DIR = path.join(ROOT, 'src/content/episodes');

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  return { frontmatter: match[1], body: match[2] };
}

function getField(frontmatter, field) {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null;
}

function yamlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function setOrReplaceField(frontmatter, field, value) {
  const line = `${field}: ${value}`;
  const regex = new RegExp(`^${field}:.*$`, 'm');
  if (regex.test(frontmatter)) {
    return frontmatter.replace(regex, line);
  }
  return `${frontmatter}\n${line}`;
}

function insertAfterField(frontmatter, afterField, newLine) {
  const lines = frontmatter.split('\n');
  const index = lines.findIndex((line) => line.startsWith(`${afterField}:`));
  if (index === -1) {
    return `${frontmatter}\n${newLine}`;
  }
  lines.splice(index + 1, 0, newLine);
  return lines.join('\n');
}

function episodeNumberFromTitle(title) {
  const match = title.match(/פרק\s+(\d+)/);
  return match ? match[1] : null;
}

function walkMarkdownFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  const periods = JSON.parse(fs.readFileSync(PERIODS_PATH, 'utf8'));
  const periodByNum = new Map(periods.map((entry) => [entry.num, entry]));

  const markdownFiles = walkMarkdownFiles(EPISODES_DIR);
  let updated = 0;
  const missing = [];

  for (const filePath of markdownFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseFrontmatter(content);
    if (!parsed) continue;

    const title = getField(parsed.frontmatter, 'title');
    const episodeNumber = episodeNumberFromTitle(title ?? '');
    if (!episodeNumber) {
      missing.push({ filePath, title, reason: 'no episode number in title' });
      continue;
    }

    const period = periodByNum.get(episodeNumber);
    if (!period) {
      missing.push({ filePath, title, episodeNumber, reason: 'no period match' });
      continue;
    }

    let frontmatter = parsed.frontmatter;
    frontmatter = setOrReplaceField(frontmatter, 'period', period.year);
    frontmatter = setOrReplaceField(frontmatter, 'periodName', yamlQuote(period.century));

    const nextContent = `---\n${frontmatter}\n---\n${parsed.body}`;
    if (nextContent !== content) {
      fs.writeFileSync(filePath, nextContent);
      updated += 1;
    }
  }

  console.log(`Updated ${updated} episode files from periods (${periods.length} period entries).`);
  if (missing.length > 0) {
    console.warn('Episodes without period match:');
    for (const item of missing) {
      console.warn(`  ${item.title ?? '(no title)'} (${path.relative(ROOT, item.filePath)}): ${item.reason}`);
    }
  }
}

main();
