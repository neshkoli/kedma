# Google Analytics 4 — Setup Guide

This site is wired for GA4. Complete the steps below **after** the site is live at `https://www.kedma.xyz` (not the temporary GitHub Pages URL).

**Measurement ID:** `G-14BQQ9TGBK`

---

## 1. Create or configure the GA4 property

1. Open [Google Analytics](https://analytics.google.com/).
2. Create a new **GA4** property (or use an existing one) for **קדמא / Kedma**.
3. Add a **Web** data stream:
   - **Website URL:** `https://www.kedma.xyz`
   - **Stream name:** `kedma.xyz` (or similar)
4. Confirm the **Measurement ID** is `G-14BQQ9TGBK`.  
   If Google generated a different ID, update `PUBLIC_GA_MEASUREMENT_ID` everywhere (see step 3).

> The old Blogger property used Universal Analytics (`UA-131806290-1`). UA is retired — use GA4 only.

---

## 2. Enable the measurement ID in production

The site reads the ID from an environment variable at build time. Until it is set, **no analytics script is loaded**.

### GitHub Actions (production)

1. Go to the repo on GitHub → **Settings** → **Secrets and variables** → **Actions** → **Variables**.
2. Add a repository variable:
   - **Name:** `PUBLIC_GA_MEASUREMENT_ID`
   - **Value:** `G-14BQQ9TGBK`
3. Push to `main` (or re-run the **Deploy to GitHub Pages** workflow) so the next build includes analytics.

### Local development (optional)

Copy `.env.example` to `.env` and set:

```env
PUBLIC_GA_MEASUREMENT_ID=G-14BQQ9TGBK
```

Run `npm run dev` or `npm run build` — the gtag snippet will appear in the page `<head>`.

---

## 3. Register custom dimensions (episode breakdown)

Listen and download events send episode metadata. Register these as **custom dimensions** so reports can be filtered by episode.

In GA4: **Admin** → **Data display** → **Custom definitions** → **Create custom dimension**

| Dimension name   | Scope | Event parameter  |
|------------------|-------|------------------|
| Episode slug     | Event | `episode_slug`   |
| Episode title    | Event | `episode_title`  |
| Audio URL        | Event | `audio_url`      |
| Percent listened | Event | `percent_listened` |
| Listen seconds   | Event | `listen_seconds` |

Create all five before relying on historical breakdowns (GA4 does not backfill dimensions on old events).

### Mark key events (recommended)

In GA4: **Admin** → **Data display** → **Events** → toggle **Mark as key event** for:

- `audio_play` — unique listeners (first play per page visit)
- `file_download` — episode downloads
- `audio_complete` — finished episodes (optional)

---

## 4. What the site tracks

Audio is hosted on Cloudflare R2 at `audio.kedma.xyz`. Playback and download are tracked **from the site player** via client-side GA4 events (direct CDN requests are not counted).

| Metric            | GA4 event          | When it fires                                      |
|-------------------|--------------------|----------------------------------------------------|
| Site visitors     | `page_view`        | Every page load (automatic)                        |
| Listeners         | `audio_play`       | First play per episode page visit                  |
| Listen depth      | `audio_progress`   | 25%, 50%, 75%, and 100% of episode duration        |
| Listen time       | `audio_listen_time`| Pause or finish — includes `listen_seconds`        |
| Downloads         | `file_download`    | Signed-in user clicks download in the player       |
| Finished          | `audio_complete`   | Episode plays to the end                           |
| Engagement (extra)| `audio_pause`      | User pauses playback                               |

Every audio event includes per-episode parameters:

- `episode_slug` — e.g. `2025/12/75.html`
- `episode_title` — full Hebrew title
- `audio_url` — full R2 URL, e.g. `https://audio.kedma.xyz/episodes/2025/12/75.mp3`
- `audio_host` — `audio.kedma.xyz`
- `file_name` / `file_extension` — derived from the audio URL

Implementation: `src/components/Analytics.astro` listens for player events from `src/components/AudioPlayer.astro`.

---

## 5. Viewing reports

After traffic flows (allow 24–48 hours for full reporting):

### Visitors

**Reports** → **Engagement** → **Pages and screens**

### Listeners (plays per episode)

**Reports** → **Engagement** → **Events** → select `audio_play`

- **Event count** — unique listen starts (one per page visit, not per resume)
- **Total users** — unique listeners (approximate)

Add breakdown: **Episode slug** or **Episode title** (custom dimensions from step 3).

### Listen depth (how far people listen)

**Reports** → **Engagement** → **Events** → select `audio_progress`

Break down by **Episode slug** and **Percent listened** to see 25/50/75/100% completion per episode.

### Downloads per episode

**Reports** → **Engagement** → **Events** → select `file_download`

Break down by **Episode slug** or **Episode title**.

### Explorations (optional)

**Explore** → blank → add `audio_play` and `file_download` with dimensions `episode_slug`, `episode_title` for a podcast dashboard.

---

## 6. Verify tracking works

1. Deploy with `PUBLIC_GA_MEASUREMENT_ID` set.
2. Open an episode on `www.kedma.xyz`.
3. In GA4: **Admin** → **Data display** → **DebugView** (or install [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna) for real-time event inspection).
4. Play audio and click download — confirm `audio_play` and `file_download` with episode parameters.

---

## 7. When moving off GitHub Pages

Update the deploy workflow (`/.github/workflows/deploy.yml`) environment variables when the canonical site URL changes:

```yaml
ASTRO_SITE: https://www.kedma.xyz
ASTRO_BASE: /
```

Re-deploy after DNS points `www.kedma.xyz` to the new host. GA4 stream URL should already match `https://www.kedma.xyz`.

---

## Files reference

| File | Purpose |
|------|---------|
| `src/components/Analytics.astro` | Loads gtag, forwards player events to GA4 |
| `src/components/AudioPlayer.astro` | Emits `kedma:audio_*` and `kedma:file_download` with episode data |
| `src/layouts/BaseLayout.astro` | Includes `<Analytics />` on every page |
| `.env.example` | Documents `PUBLIC_GA_MEASUREMENT_ID` |
| `.github/workflows/deploy.yml` | Passes the variable into the build |
