# Local Episode Publisher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a localhost-only Node tool that creates a Kedma episode (form + preview + R2 upload + repo files + git push to `main`).

**Architecture:** Separate app under `tools/episode-publisher/` with a `127.0.0.1` HTTP server, static UI, and lib modules for paths, frontmatter, duration, R2, filesystem writes, and git. Not part of the Astro build.

**Tech Stack:** Node.js (built-in `http`, `node:test`), `busboy` (multipart), `marked`, `music-metadata`, `@aws-sdk/client-s3` (R2), `dotenv`, git CLI via `child_process`.

## Global Constraints

- Bind server to `127.0.0.1` only.
- Never include publisher routes in Astro/Vercel production.
- No Spotify fields in this phase.
- Duration comes from MP3 probe (`HH:MM:SS`).
- Publish enabled only after preview of current form state.
- Stage/commit only episode output paths; push to `main`.
- `PUBLISH_DRY_RUN=1` skips R2 upload and git push (still can write files to a dry-run directory or skip remote steps as documented in server).
- Secrets only via `.env` / `.env.example` keys from the design spec.
- Tool-local `package.json` under `tools/episode-publisher/` to keep Astro deps clean.

## File map

| Path | Responsibility |
|------|----------------|
| `tools/episode-publisher/package.json` | Tool deps + `test` script |
| `tools/episode-publisher/lib/episode-paths.mjs` | Next episode #, paths, R2 key, slug |
| `tools/episode-publisher/lib/frontmatter.mjs` | Serialize YAML frontmatter + body |
| `tools/episode-publisher/lib/duration.mjs` | MP3 → `HH:MM:SS` |
| `tools/episode-publisher/lib/write-files.mjs` | Write md + images into repo |
| `tools/episode-publisher/lib/r2.mjs` | Upload audio to R2 |
| `tools/episode-publisher/lib/git.mjs` | add / commit / push |
| `tools/episode-publisher/lib/publish.mjs` | Orchestrate validate → R2 → write → git |
| `tools/episode-publisher/server.mjs` | HTTP API + static files |
| `tools/episode-publisher/public/*` | Form UI + preview |
| `tools/episode-publisher/test/*.test.mjs` | Unit tests |
| Root `package.json` | `publish-episode` script |
| `.env.example` | R2 env keys |
| `docs/architecture.md` | Mention local publisher |

---

### Task 1: Scaffold + episode-paths

**Files:**
- Create: `tools/episode-publisher/package.json`
- Create: `tools/episode-publisher/lib/episode-paths.mjs`
- Create: `tools/episode-publisher/test/episode-paths.test.mjs`
- Modify: root `package.json` (add `publish-episode` script)

**Produces:**
- `findNextEpisodeNumber(episodesRoot: string): Promise<number>`
- `buildEpisodePaths({ repoRoot, year, month, number, audioExt }): { mdPath, imagesDir, publicImageBase, slug, r2Key, audioUrlPath }`
- `suggestDefaults(now?: Date): { year, month, date }`

- [ ] **Step 1:** Create tool `package.json` with `"type":"module"`, scripts `"test":"node --test test/*.test.mjs"`, deps later.
- [ ] **Step 2:** Write failing tests for next number (scan `**/*.md` basenames that are numeric), path builders, date suggest.
- [ ] **Step 3:** Implement `episode-paths.mjs`.
- [ ] **Step 4:** Run tests — expect PASS.
- [ ] **Step 5:** Add root script `"publish-episode": "npm --prefix tools/episode-publisher start"`.
- [ ] **Step 6:** Commit.

### Task 2: Frontmatter serialization

**Files:**
- Create: `tools/episode-publisher/lib/frontmatter.mjs`
- Create: `tools/episode-publisher/test/frontmatter.test.mjs`

**Produces:**
- `serializeEpisodeMarkdown(fields): string` — matches existing episode shape (quoted date, slug, tags array, omit empty optional Spotify; omit undefined optionals).

- [ ] **Step 1:** Failing test comparing output shape to fixture based on episode 77 (without spotify).
- [ ] **Step 2:** Implement serializer (hand-roll YAML-ish frontmatter; no gray-matter required).
- [ ] **Step 3:** Tests PASS. Commit.

### Task 3: Duration + write-files + git + r2 + publish orchestrator

**Files:**
- Create: `lib/duration.mjs`, `lib/write-files.mjs`, `lib/git.mjs`, `lib/r2.mjs`, `lib/publish.mjs`
- Create: tests for duration format helper + write-files (tmpdir) + publish dry-run

**Produces:**
- `formatDuration(seconds: number): string` → `HH:MM:SS`
- `probeDuration(filePath: string): Promise<string>`
- `writeEpisodeFiles({ repoRoot, paths, markdown, files: { cover, images[] } })`
- `uploadAudio({ env, key, filePath, contentType })`
- `gitPublish({ repoRoot, paths, message, dryRun })`
- `publishEpisode(options)` — full pipeline with `completedSteps[]` on error

- [ ] Install deps: `music-metadata`, `@aws-sdk/client-s3`, `dotenv`, `busboy`, `marked`.
- [ ] Implement modules; dry-run skips R2+push.
- [ ] Tests for formatDuration + writeEpisodeFiles. Commit.

### Task 4: HTTP server + UI

**Files:**
- Create: `server.mjs`, `public/index.html`, `public/app.js`, `public/styles.css`

**API:**
- `GET /api/defaults` → next number + date parts
- `POST /api/duration` multipart audio → `{ duration }`
- `POST /api/preview` JSON → `{ html, previewToken }` (hash of payload)
- `POST /api/publish` multipart full form + `previewToken` → pipeline result

- [ ] Bind `127.0.0.1:8787` (or next free); open message in console.
- [ ] UI: RTL Hebrew form, preview pane, publish disabled until preview token matches.
- [ ] Manual smoke with `PUBLISH_DRY_RUN=1`.
- [ ] Update `.env.example` + short note in `docs/architecture.md` + README content workflow.
- [ ] Commit.

### Task 5: Verification

- [ ] `npm --prefix tools/episode-publisher test` PASS
- [ ] `npm run publish-episode` serves UI on localhost
- [ ] Confirm Astro `npm run build` unaffected
- [ ] Final commit if docs tweaks remain

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Separate local tool | 1, 4 |
| Markdown editor + image insert | 4 |
| Full frontmatter except Spotify | 2, 4 |
| Auto next # / date | 1, 4 |
| Duration from MP3 | 3, 4 |
| Preview then publish | 4 |
| R2 + files + git push main | 3, 4 |
| localhost only | 4 |
| Dry-run | 3 |
| .env.example keys | 4 |
