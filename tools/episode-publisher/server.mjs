import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import Busboy from 'busboy';
import { marked } from 'marked';
import dotenv from 'dotenv';

import {
  buildEpisodePaths,
  episodeImageSrc,
  findNextEpisodeNumber,
  suggestDefaults,
} from './lib/episode-paths.mjs';
import { probeDuration } from './lib/duration.mjs';
import { publishEpisode } from './lib/publish.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = __dirname;
const REPO_ROOT = path.resolve(TOOL_ROOT, '../..');
const PUBLIC_DIR = path.join(TOOL_ROOT, 'public');
const EPISODES_ROOT = path.join(REPO_ROOT, 'src/content/episodes');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PUBLISH_PORT || 8787);

dotenv.config({ path: path.join(REPO_ROOT, '.env') });

marked.setOptions({ gfm: true });

function previewTokenFor(payload) {
  const canonical = JSON.stringify(payload);
  return createHash('sha256').update(canonical).digest('hex');
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    }[ext] || 'application/octet-stream'
  );
}

async function serveStatic(req, res, urlPath) {
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe === '/' ? 'index.html' : safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

/**
 * @returns {Promise<{ fields: Record<string, string>, files: Record<string, { filename: string, mimeType: string, path: string, buffer: Buffer }> }>}
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    /** @type {Record<string, { filename: string, mimeType: string, path: string, buffer: Buffer }>} */
    const files = {};
    const pending = [];

    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 600 * 1024 * 1024 } });
    busboy.on('field', (name, value) => {
      fields[name] = value;
    });
    busboy.on('file', (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      const task = new Promise((res, rej) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', rej);
        stream.on('limit', () => rej(new Error(`file too large: ${filename}`)));
        stream.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            const tmpPath = path.join(tmpdir(), `kedma-pub-${randomUUID()}${path.extname(filename) || ''}`);
            await writeFile(tmpPath, buffer);
            files[name] = { filename, mimeType, path: tmpPath, buffer };
            res();
          } catch (err) {
            rej(err);
          }
        });
      });
      pending.push(task);
    });
    busboy.on('error', reject);
    busboy.on('finish', async () => {
      try {
        await Promise.all(pending);
        resolve({ fields, files });
      } catch (err) {
        reject(err);
      }
    });
    req.pipe(busboy);
  });
}

function parseTags(raw) {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function buildPreviewPayload(fields) {
  return {
    number: String(fields.number || ''),
    year: String(fields.year || ''),
    month: String(fields.month || '').padStart(2, '0'),
    date: String(fields.date || ''),
    title: String(fields.title || ''),
    imageCaption: String(fields.imageCaption || ''),
    period: String(fields.period || ''),
    periodName: String(fields.periodName || ''),
    tags: parseTags(Array.isArray(fields.tags) ? fields.tags.join(',') : fields.tags || ''),
    duration: String(fields.duration || ''),
    body: String(fields.body || ''),
    coverName: String(fields.coverName || ''),
    audioName: String(fields.audioName || ''),
  };
}

async function handleDefaults(_req, res) {
  const next = await findNextEpisodeNumber(EPISODES_ROOT);
  const suggested = suggestDefaults();
  sendJson(res, 200, {
    number: next,
    ...suggested,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL || 'https://audio.kedma.xyz',
    dryRun: process.env.PUBLISH_DRY_RUN === '1',
  });
}

async function handleDuration(req, res) {
  const { files } = await parseMultipart(req);
  const audio = files.audio;
  if (!audio) {
    sendJson(res, 400, { error: 'audio file required' });
    return;
  }
  try {
    const duration = await probeDuration(audio.path);
    sendJson(res, 200, { duration, filename: audio.filename });
  } finally {
    await unlink(audio.path).catch(() => {});
  }
}

async function handlePreview(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  const payload = buildPreviewPayload(body);
  if (!payload.title.trim() || !payload.body.trim()) {
    sendJson(res, 400, { error: 'title and body are required for preview' });
    return;
  }
  const bodyHtml = marked.parse(payload.body);
  const token = previewTokenFor(payload);
  sendJson(res, 200, { bodyHtml, previewToken: token, payload });
}

async function handleImageInsert(req, res) {
  const { fields, files } = await parseMultipart(req);
  const image = files.image;
  if (!image) {
    sendJson(res, 400, { error: 'image required' });
    return;
  }
  const year = fields.year;
  const month = String(fields.month || '').padStart(2, '0');
  const number = fields.number;
  if (!year || !month || !number) {
    await unlink(image.path).catch(() => {});
    sendJson(res, 400, { error: 'year, month, number required' });
    return;
  }
  const paths = buildEpisodePaths({
    repoRoot: REPO_ROOT,
    year,
    month,
    number,
  });
  // Stage under tool temp preview dir (not repo) so publish remains the write gate
  const stagingDir = path.join(tmpdir(), 'kedma-episode-staging', `${year}-${month}-${number}`);
  await mkdir(stagingDir, { recursive: true });
  const safeName = path.basename(image.filename).replace(/[^\w.\u0590-\u05FFa-zA-Z0-9_-]+/g, '_');
  const dest = path.join(stagingDir, safeName);
  await writeFile(dest, image.buffer);
  await unlink(image.path).catch(() => {});
  const markdownSrc = episodeImageSrc(paths.publicImageBase, safeName);
  sendJson(res, 200, {
    filename: safeName,
    markdown: `![](${markdownSrc})`,
    src: markdownSrc,
    stagingPath: dest,
  });
}

async function handlePublish(req, res) {
  const { fields, files } = await parseMultipart(req);
  const payload = buildPreviewPayload({
    ...fields,
    coverName: files.cover?.filename || fields.coverName || '',
    audioName: files.audio?.filename || fields.audioName || '',
  });
  const expected = previewTokenFor(payload);
  if (!fields.previewToken || fields.previewToken !== expected) {
    for (const f of Object.values(files)) await unlink(f.path).catch(() => {});
    sendJson(res, 400, {
      error: 'Preview required before publish (form changed since last preview).',
    });
    return;
  }

  const cover = files.cover;
  const audio = files.audio;
  if (!cover || !audio) {
    for (const f of Object.values(files)) await unlink(f.path).catch(() => {});
    sendJson(res, 400, { error: 'cover and audio are required' });
    return;
  }

  /** @type {Array<{ buffer: Buffer, filename: string }>} */
  const images = [];
  for (const [name, file] of Object.entries(files)) {
    if (name.startsWith('image_')) {
      images.push({ buffer: file.buffer, filename: file.filename });
    }
  }

  // Include staged body images referenced by filename list
  if (fields.stagedImages) {
    try {
      const staged = JSON.parse(fields.stagedImages);
      for (const item of staged) {
        if (!item?.path || !item?.filename) continue;
        const buf = await readFile(item.path);
        images.push({ buffer: buf, filename: item.filename });
      }
    } catch {
      // ignore bad stagedImages JSON
    }
  }

  try {
    const result = await publishEpisode({
      repoRoot: REPO_ROOT,
      env: process.env,
      year: fields.year,
      month: fields.month,
      number: fields.number,
      title: fields.title,
      date: fields.date,
      tags: parseTags(fields.tags || ''),
      imageCaption: fields.imageCaption,
      period: fields.period,
      periodName: fields.periodName,
      duration: fields.duration,
      body: fields.body,
      audio: {
        path: audio.path,
        filename: audio.filename,
        contentType: audio.mimeType || 'audio/mpeg',
      },
      cover: { buffer: cover.buffer, filename: cover.filename },
      images,
      overwrite: fields.overwrite === '1',
      dryRun: process.env.PUBLISH_DRY_RUN === '1' || fields.dryRun === '1',
    });
    sendJson(res, 200, result);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    sendJson(res, 500, {
      error: error.message,
      completedSteps: /** @type {any} */ (error).completedSteps || [],
      paths: /** @type {any} */ (error).paths || null,
    });
  } finally {
    for (const f of Object.values(files)) await unlink(f.path).catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    if (req.method === 'GET' && url.pathname === '/api/defaults') {
      await handleDefaults(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/duration') {
      await handleDuration(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/preview') {
      await handlePreview(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/image') {
      await handleImageInsert(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/publish') {
      await handlePublish(req, res);
      return;
    }
    if (req.method === 'GET') {
      await serveStatic(req, res, url.pathname);
      return;
    }
    sendJson(res, 405, { error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Episode publisher listening on http://${HOST}:${PORT}`);
  console.log(`Repo root: ${REPO_ROOT}`);
  if (process.env.PUBLISH_DRY_RUN === '1') {
    console.log('PUBLISH_DRY_RUN=1 — R2 upload and git commit/push are skipped (files still written).');
  }
});
