# Project Specification: "Kedma" Podcast Static Website

## 1. Project Overview
**Name**: Kedma (קֶדְמָא)
**Domain**: www.kedma.xyz
**Language**: Hebrew (RTL)
**Niche**: Jewish History
**Current State**: Hosted on Google Blogger (~77 episodes).
**Goal**: Migrate to a modern, blazing-fast Static Site Generator (SSG) hosted on GitHub Pages. The workflow should be entirely Markdown-driven, triggering automated deployments via GitHub Actions upon commit.

## 2. Architecture & Tech Stack (Recommended)
* **Framework**: Astro  (configured for Static HTML Export). *Astro is highly recommended for content-heavy, Markdown-first static sites with zero client-side JavaScript by default.*
* **Styling**: Tailwind CSS (with `rtl` support enabled).
* **Content Management**: Markdown / MDX (allowing embedded YouTube players and images within the text).
* **Search**: Client-side search using `Fuse.js` (indexing a generated JSON file of all episodes at build time).
* **Hosting & CI/CD**: GitHub Pages with GitHub Actions.
* **Audio Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) (free tier) — MP3 files served via a public R2 bucket (custom domain preferred, e.g. `audio.kedma.xyz`, or R2.dev public URL as fallback). Keeping audio out of the GitHub repo avoids bloating the static site build and GitHub Pages limits; ~77 podcast episodes fit comfortably within R2's free tier (10 GB storage, no egress fees when served through Cloudflare).
* **Comments**: [Cusdis](https://cusdis.com/) Cloud (free tier) — lightweight, privacy-first comment widget embedded on episode pages. Free tier includes 1 site, 100 approved comments/month, and email notifications with Quick Approve.
* **Analytics**: Google Analytics 4 (GA4) with custom event tracking for media. *(Existing Blogger property: `UA-131806290-1` per Takeout settings — migrate to GA4 during build.)*

## 3. Audio Hosting — Cloudflare R2

### R2 Bucket Configuration
* Create one R2 bucket (e.g. `kedma-audio`).
* Enable **public access** via [R2 custom domain](https://developers.cloudflare.com/r2/buckets/public-buckets/#custom-domains) (`audio.kedma.xyz`) — DNS managed in Cloudflare since `kedma.xyz` is already there.
* Set **CORS** to allow `GET` from `https://www.kedma.xyz` (required for HTML5 `<audio>` playback and download links from the episode pages).

### Free Tier Constraints
* 10 GB storage — sufficient for ~77 MP3 podcast episodes.
* No egress fees when served through Cloudflare (unlike S3).
* No automated lifecycle needed for a static archive podcast.

### Object Naming Convention
Use a predictable key structure so manual uploads stay organized:

```
episodes/{YYYY}/{MM}/{episode-slug}.mp3
```

This mirrors the Blogger URL slug pattern already preserved in frontmatter.

## 4. Comments — Cusdis

### Setup
* Register at [cusdis.com](https://cusdis.com/) on the **Cloud** free plan (1 site).
* Add `www.kedma.xyz` as the allowed domain in the Cusdis dashboard.
* Store the `app-id` in an environment variable or Astro config (not committed to git if sensitive).

### Episode Page Integration
* Embed the Cusdis JS SDK (~5 KB gzipped) at the bottom of each episode page.
* Pass per-episode attributes so comments are scoped correctly:
    * `page-id` — episode slug without leading slash (e.g. `2021/05/episode-name.html`), matching the Blogger `blogger:filename` value.
    * `page-url` — full canonical URL (e.g. `https://www.kedma.xyz/2021/05/episode-name.html`).
    * `page-title` — episode title from frontmatter.
* Enable dark mode and locale (`he`) per Cusdis i18n support.
* New comments trigger email notification with Quick Approve link (no dashboard login required on mobile).

### Historical Blogger Comments
* The Takeout export contains ~340 comments interleaved in `feed.atom` (plus author replies in `Comments/קדמא Kedma/feed.atom`).
* **These are NOT migrated to Cusdis** — Cusdis has no bulk-import API, and the free tier caps at 100 approved comments/month.
* The Takeout comment data remains available locally for reference; only new comments go through Cusdis going forward.

## 5. Phase 1: Migration & Data Import
**Goal**: Move 77 episodes from Google Takeout to Markdown format.

### Data Source
Google Takeout export located at `Takeout/Blogger/`:

| Path | Purpose |
|---|---|
| `Blogs/קדמא Kedma/feed.atom` | **Primary source** — all posts and comments in one Atom feed |
| `Blogs/קדמא Kedma/settings.csv` | Blog metadata (locale `iw`, timezone `Asia/Jerusalem`, GA property ID) |
| `Comments/קדמא Kedma/feed.atom` | Author replies subset (נעם אשכולי) — reference only |
| `Albums/Kedma/` | Image metadata JSON only (actual image bytes not included in Takeout) |
| `Profile/profile.csv` | Author profile |

### Feed Format
The Takeout `feed.atom` uses the Atom namespace plus `xmlns:blogger="http://schemas.google.com/blogger/2018"`. Entries are interleaved — posts and comments share the same feed.

**Filter for posts**: `blogger:type == POST` and `blogger:status == LIVE` (77 entries).

**Per-post fields to extract**:

| Atom element | Maps to |
|---|---|
| `title` | `title` frontmatter |
| `published` | `date` frontmatter |
| `content` (HTML) | MDX body (HTML → Markdown conversion) |
| `blogger:filename` | `slug` (e.g. `/2019/06/16.html` — matches live URL structure) |
| `id` | Internal post ID (for cross-referencing comments during export) |
| `category[@term]` | `tags` array |
| `content` HTML — first `<img src>` | `image` (cover); download from `blogger.googleusercontent.com` |
| `content` HTML — `anchor.fm` / Apple Podcasts / Spotify iframe | Audio metadata reference only (see below) |

**Comments in feed** (`blogger:type == COMMENT`): linked to posts via `blogger:parent` (post ID). Parsed for reference/export only — not imported into Cusdis.

### Audio Notes
* `<enclosure/>` elements are empty in every post — no direct MP3 URLs in the feed.
* Early episodes embed audio via `anchor.fm` iframes; later episodes use Apple Podcasts or Spotify embeds.
* `migrate.py` should extract embed URLs/IDs as metadata to help build `migration/audio-map.csv`, but actual MP3 files come from manual provision (see below).

### Image Notes
* Albums in Takeout contain metadata JSON only (`hasOriginalBytes: MAYBE`) — no local image files.
* All episode images must be **downloaded from URLs** embedded in post HTML (`blogger.googleusercontent.com/...`) and saved to `public/images/episodes/`.

### `period` / `periodName`
* Not present in the Takeout feed. Maintain a separate mapping file (e.g. `migration/period-map.csv` with columns `slug,period,periodName`) to be merged during migration.

### Responsibility Split

| Responsibility | Owner |
|---|---|
| Parse Takeout `feed.atom` → MDX frontmatter | `migrate.py` |
| Download / host images (covers) | `migrate.py` (from HTML img URLs → `public/images/`) |
| **Provide MP3 files** | **Manual** |
| **Upload MP3s to R2** | **Manual** |
| **Set `audioUrl` in frontmatter** | `migrate.py` (from `migration/audio-map.csv`) |
| **Set `period` / `periodName`** | **Manual** (`migration/period-map.csv`) |

### Migration Tasks
* **Task**: Write a Python script (`migrate.py`) to parse `Takeout/Blogger/Blogs/קדמא Kedma/feed.atom`.
* **Extraction**: For each LIVE post, extract title, publish date, content (HTML to Markdown), cover image URL, tags, slug, and audio embed metadata.
* **Audio extraction (metadata only)**: `migrate.py` extracts anchor.fm / podcast embed references — it does **not** download or upload audio files.
* **Manual upload workflow**:
    1. Provide the MP3 files (e.g. a local folder matching episode names or Blogger filenames).
    2. Upload them to the R2 bucket manually (Cloudflare dashboard, `rclone`, or `wrangler r2 object put`).
    3. Maintain a simple mapping file (e.g. `migration/audio-map.csv` with columns `slug,filename` or `blogger_url,r2_key`) that `migrate.py` reads to write the correct `audioUrl` into each episode's frontmatter.
* **Out of scope for Phase 1**: Automated R2 upload in CI, wrangler-based bulk upload scripts, Cusdis comment import (can be added later if desired).
* **URL Preservation (Critical)**: Use `blogger:filename` directly as `slug` (e.g. `2019/06/16.html`). The Astro router must generate the exact same URL path (`/2019/06/16.html`) so Wikipedia and external links do not break.
* **Frontmatter Generation**: The Python script should output `.mdx` files with YAML frontmatter:
    ```yaml
    ---
    title: "Episode Title in Hebrew"
    date: "YYYY-MM-DD"
    image: "/images/episodes/cover.jpg"
    audioUrl: "https://audio.kedma.xyz/episodes/2019/06/16.mp3"
    slug: "2019/06/16.html" # From blogger:filename, matches Blogger URL exactly
    tags: ["tag1", "tag2"]
    period: 3 # From period-map.csv (not in Takeout feed)
    periodName: "ימי בית שני"
    ---
    ```

## 6. Phase 2: Design & UI/UX Requirements
**Goal**: A beautiful, clean interface with historical Jewish design motifs.
* **Typography**: Use classic, highly readable Hebrew web fonts. Suggest `Frank Ruhl Libre` for headings (gives a historical, book-like feel) and `Assistant` or `Heebo` for body text (clean and modern).
* **Layout & Direction**: Entire site must be wrapped in `<html lang="he" dir="rtl">`. Ensure all flexbox/grid layouts respect RTL.
* **Theme**: Clean minimal background (off-white, parchment, or subtle stone textures) with deep, elegant accent colors (navy, dark red, or gold) referencing historical aesthetics.
* **Responsive**: Mobile-first design, as podcast listeners frequently browse on phones.

## 7. Phase 3: Core Site Structure & Pages
### 7.1 Main Page (Home)
* **Hero Section**: Highlights the *latest* episode with a large image, title, summary, and immediate play button.
* **Feed**: Below the hero, list all previous episodes in reverse-chronological order (newest to oldest). Display as clean cards (Thumbnail, Date, Title, Period badge).

### 7.2 Episode Page (Dynamic Routing)
* **Header**: Main episode image (cover) prominently displayed.
* **Metadata**: Title (H1), Date, Tags (clickable), Period (clickable).
* **Audio Player**: A sticky or prominent HTML5 `<audio>` player at the top/bottom of the screen. The `audioUrl` frontmatter field points to the public R2 URL; no changes needed to the player or download button beyond using that URL.
* **Actions**: Explicit "Download Episode" button (`<a href="..." download>`).
* **Content Body**: Rendered MDX content. Must support inline images and embedded `<iframe src="...youtube...">` players seamlessly.
* **Comments**: Cusdis widget embedded below the content body. Scoped per episode via `page-id` (slug). Styled to match site theme; RTL layout respected.

### 7.3 "Periods" Timeline Page
* **Sorting**: Read all Markdown files and sort them strictly by the `period` frontmatter variable (oldest historical period to newest).
* **Layout**: Present as a visual timeline or grouped sections (e.g., "תקופת המקרא", "ימי בית שני", "ימי הביניים") allowing listeners to consume the podcast in chronological historical order rather than release order.

## 8. Phase 4: Search & Discovery
* **Mechanism**: At build time, generate a `search-index.json` containing titles, content snippets, tags, and periods.
* **Search Page/Modal**: Implement a search bar using `Fuse.js` (supports fuzzy matching in Hebrew).
* **Filters**: Allow users to filter the episode list by clicking on a specific `tag` or `period`.

## 9. Phase 5: Analytics & Tracking
**Goal**: Measure engagement beyond simple page views.
* **Integration**: Add the GA4 snippet to the document head.
* **Custom Audio Tracking**: Attach event listeners to the `<audio>` element on the episode page. Fire GA4 custom events for:
    * `audio_play`
    * `audio_pause`
    * `audio_complete` (when progress reaches 100%)
* **Download Tracking**: Fire a `file_download` event when the direct download link is clicked.
* *(Alternative Note)*: If avoiding Google Analytics is preferred for privacy, suggest integrating **Plausible** or **Umami**, which have lightweight, privacy-focused event tracking APIs.

## 10. Phase 6: CI/CD & Deployment
* **GitHub Actions**: Create a `.github/workflows/deploy.yml` file.
* **Workflow Steps**:
    1. Trigger on `push` to the `main` branch.
    2. Checkout the repository.
    3. Install dependencies (`npm install` or `pnpm install`).
    4. Build the static site (`npm run build`).
    5. Deploy the `out`/`dist` folder directly to GitHub Pages.
* **Custom Domain**: Ensure the workflow includes the `CNAME` file containing `www.kedma.xyz` so GitHub Pages routes the domain correctly after every build.
* **Audio is separate from CI/CD**: The GitHub Actions deploy workflow covers only the static site — not audio files. Audio is hosted independently on Cloudflare R2. For migration, MP3s are uploaded manually; future episodes can be uploaded manually or via a separate workflow.
* **Comments are separate from CI/CD**: Cusdis is a hosted SaaS widget — no comment data in the repo or build pipeline. Moderation happens via the Cusdis dashboard or email Quick Approve links.
