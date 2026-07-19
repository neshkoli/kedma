import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RSS_PATH = path.join(ROOT, 'Takeout/spotify.rss');
const EPISODES_DIR = path.join(ROOT, 'src/content/episodes');
const IMAGES_DIR = path.join(ROOT, 'public/images/episodes');

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const episodeMatch = block.match(/<itunes:episode>(\d+)<\/itunes:episode>/);
    const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
    const linkMatch = block.match(/<link>(.*?)<\/link>/);
    const durationMatch = block.match(/<itunes:duration>(.*?)<\/itunes:duration>/);
    const imageMatch = block.match(/<itunes:image href="(.*?)"/);

    const title = titleMatch?.[1] ?? '';
    const titleEpisodeMatch = title.match(/פרק\s+(\d+)/);
    const episodeNumber = Number(titleEpisodeMatch?.[1] ?? episodeMatch?.[1] ?? NaN);

    if (!Number.isFinite(episodeNumber)) continue;

    items.push({
      episodeNumber,
      title,
      spotify: linkMatch?.[1]?.trim() ?? '',
      duration: durationMatch?.[1]?.trim() ?? '',
      imageUrl: imageMatch?.[1]?.trim() ?? '',
    });
  }

  return items;
}

function episodeNumberFromTitle(title) {
  const match = title.match(/פרק\s+(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  return { frontmatter: match[1], body: match[2] };
}

function getField(frontmatter, field) {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? null;
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

function imagePathFromSlug(slug, filename) {
  const cleanSlug = slug.replace(/\.html$/i, '');
  return `/images/episodes/${cleanSlug}/${filename}`;
}

async function downloadImage(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
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

async function main() {
  if (!fs.existsSync(RSS_PATH) || fs.statSync(RSS_PATH).size === 0) {
    throw new Error(`RSS file is missing or empty: ${RSS_PATH}`);
  }

  const xml = fs.readFileSync(RSS_PATH, 'utf8');
  const rssItems = parseRssItems(xml);
  const rssByEpisode = new Map(rssItems.map((item) => [item.episodeNumber, item]));

  const markdownFiles = walkMarkdownFiles(EPISODES_DIR);
  let updated = 0;
  const missing = [];

  for (const filePath of markdownFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseFrontmatter(content);
    if (!parsed) continue;

    const title = getField(parsed.frontmatter, 'title')?.replace(/^['"]|['"]$/g, '');
    const episodeNumber = episodeNumberFromTitle(title ?? '');
    if (!episodeNumber) continue;

    const rss = rssByEpisode.get(episodeNumber);
    if (!rss) {
      missing.push({ filePath, episodeNumber, title });
      continue;
    }

    let frontmatter = parsed.frontmatter;
    frontmatter = setOrReplaceField(frontmatter, 'duration', `'${rss.duration}'`);
    frontmatter = setOrReplaceField(frontmatter, 'spotify', rss.spotify);

    if (episodeNumber === 1 && rss.imageUrl) {
      const slug = getField(parsed.frontmatter, 'slug')?.replace(/^['"]|['"]$/g, '');
      const filename = path.basename(new URL(rss.imageUrl).pathname);
      const relativeImagePath = imagePathFromSlug(slug, filename);
      const absoluteImagePath = path.join(ROOT, 'public', relativeImagePath.slice(1));

      if (!fs.existsSync(absoluteImagePath)) {
        await downloadImage(rss.imageUrl, absoluteImagePath);
        console.log(`Downloaded episode 1 image to ${relativeImagePath}`);
      }

      if (!getField(frontmatter, 'image')) {
        frontmatter = insertAfterField(frontmatter, 'slug', `image: ${relativeImagePath}`);
      }
    }

    const nextContent = `---\n${frontmatter}\n---\n${parsed.body}`;
    if (nextContent !== content) {
      fs.writeFileSync(filePath, nextContent);
      updated += 1;
    }
  }

  console.log(`Updated ${updated} episode files from RSS (${rssItems.length} RSS items).`);
  if (missing.length > 0) {
    console.warn('Episodes without RSS match:');
    for (const item of missing) {
      console.warn(`  #${item.episodeNumber} ${item.title} (${path.relative(ROOT, item.filePath)})`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
