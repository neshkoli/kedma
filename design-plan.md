# Kedma — Design Improvement Plan

**Last updated:** 2026-08-06  
**Status:** Phase 1–2 in progress; custom player complete.

## Locked decisions

| Topic | Decision |
|-------|----------|
| Body font | Keep **Hanken Grotesk + Noto Sans Hebrew** — no change |
| Episode title | **Sans (body family)**, larger weight — clean, matches body; **not** Frank Ruhl Libre |
| Site headings (nav, index pages) | **Noto Sans Hebrew (body family)** via `.section-title` / `.card-title` — cleaner sans, matches episode titles |
| Hero image | **1:1 square**, **50%** of content width, floated at inline-end |
| Gold on light text | Use `text-secondary` (`#775a19`); reserve `text-aged-gold` for borders/accents on dark |

---

## Phase 1 — Quick wins ✅

- [x] Fix contrast: `text-aged-gold` → `text-secondary` on parchment (nav, spotlight, cards)
- [x] Remove `uppercase` / `tracking-widest` from Hebrew UI (nav, buttons, labels, badges, tables)
- [x] Prose: tighter measure (`max-w-2xl`), comfortable line-height (~1.67)
- [x] Episode H1: `.episode-title` — body font, 28px mobile / 40px desktop
- [x] Episode header: date only; duration lives in player bar

**Files:** `global.css`, `HomeNav.astro`, `LatestEpisodeSpotlight.astro`, `EpisodeArchiveCard.astro`, `EpisodeDateDuration.astro`, `episodes.astro`, `periods.astro`, `tailwind.config.mjs`

---

## Phase 2 — Episode page ✅

- [x] Smaller square hero (`max-w-36` mobile, `max-w-40` float desktop) — keep float layout
- [x] Header play CTA (`EpisodePlayButton`) synced with sticky player
- [x] Tighter header rhythm; fix hero `alt` when caption present

**Files:** `global.css`, `[episode].astro`, `EpisodePlayButton.astro` (new)

---

## Phase 3 — Color token cleanup (later)

- Document token roles in `tailwind.config.mjs`
- Audit large `secondary-fixed` / `secondary-container` fills
- Deprecate amber as surface color

---

## Phase 4 — Player polish (later)

- Cross-browser QA (Safari, Firefox, mobile)
- Resume toast (“המשך מהמקום שבו הפסקת”)
- Seek thumb always visible on touch devices

---

## Phase 5 — Site-wide consistency (later)

- Apply contrast + letterspacing fixes to any remaining components
- Cusdis theme vars to match parchment / ink-blue
- Nav vertical padding reduction (optional)

---

## Out of scope

- Full-width hero image
- Frank Ruhl Libre or global font swap
- Dark mode, waveform, chapters, PWA
