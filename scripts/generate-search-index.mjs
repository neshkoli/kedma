import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { episodeSnippetFromBody } from '../src/lib/episodeSnippet.mjs';

const EPISODES_DIR = 'src/content/episodes';
const OUTPUT = 'public/search-index.json';
const base = process.env.ASTRO_BASE ?? '/';

function withBase(path) {
  const root = base.endsWith('/') ? base : `${base}/`;
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `${root}${normalized}`;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.name.endsWith('.mdx')) {
      files.push(fullPath);
    }
  }

  return files;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const frontmatter = match[1];
  const body = match[2];
  const data = {};

  for (const line of frontmatter.split('\n')) {
    if (line.startsWith('title:')) data.title = line.slice(6).trim().replace(/^['"]|['"]$/g, '');
    if (line.startsWith('date:')) data.date = line.slice(5).trim().replace(/^['"]|['"]$/g, '');
    if (line.startsWith('slug:')) data.slug = line.slice(5).trim();
    if (line.startsWith('tags:')) data.tags = [];
    if (line.startsWith('- ')) data.tags?.push(line.slice(2).trim());
  }

  return { data, body };
}

const files = await walk(EPISODES_DIR);
const index = [];

for (const file of files) {
  const raw = await readFile(file, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  if (!data.slug || !data.title) continue;

  const snippet = episodeSnippetFromBody(body);

  index.push({
    title: data.title,
    slug: data.slug,
    date: data.date,
    tags: data.tags ?? [],
    snippet,
    url: withBase(data.slug),
  });
}

index.sort((a, b) => String(b.date).localeCompare(String(a.date)));
await writeFile(OUTPUT, JSON.stringify(index, null, 2), 'utf8');
console.log(`Wrote ${index.length} entries to ${OUTPUT}`);
