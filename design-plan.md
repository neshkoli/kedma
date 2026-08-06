# Kedma — Design Improvement Plan

**Last updated:** 2026-08-06  
**Status:** Phases 1–5 complete.

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
- [x] Prose: comfortable line-height (~1.67)
- [x] Episode H1: `.episode-title` — body font, 28px mobile / 40px desktop
- [x] Episode header: date only; duration lives in player bar

---

## Phase 2 — Episode page ✅

- [x] Square hero at 50% content width, floated
- [x] Header play CTA (`EpisodePlayButton`) synced with sticky player
- [x] Tighter header rhythm; fix hero `alt` when caption present
- [x] Full `page-container` width aligned with nav

---

## Phase 3 — Color token cleanup ✅

- [x] Document token roles in `tailwind.config.mjs`
- [x] CSS custom properties on `:root` for theme sync
- [x] Replace `secondary-fixed` surface fills with `aged-gold/10` on badges and play button

---

## Phase 4 — Player polish ✅

- [x] Resume toast (“המשך מהמקום שבו הפסקת”)
- [x] Seek thumb always visible on touch devices (`hover: none` + `pointer: coarse`)
- [x] Thicker seek track on touch for easier scrubbing

---

## Phase 5 — Site-wide consistency ✅

- [x] Legacy `Header.astro` aligned with nav typography and contrast
- [x] Cusdis wrapper + iframe theme injection matching parchment / ink-blue
- [x] Nav vertical padding reduced (`py-3`)

---

## Out of scope

- Full-width hero image
- Frank Ruhl Libre or global font swap
- Dark mode, waveform, chapters, PWA
