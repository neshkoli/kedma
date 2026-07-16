# Kedma (קֶדְמָא)

Static website for the [Kedma](https://www.kedma.xyz) Hebrew podcast on Jewish history. Built with Astro as a fast, Markdown-driven site with RTL support.

**Live site:** [www.kedma.xyz](https://www.kedma.xyz)

## Stack

- [Astro](https://astro.build/) — static site generation
- [Tailwind CSS](https://tailwindcss.com/) — styling with RTL support
- [MDX](https://mdxjs.com/) — episode content with embedded media
- [Fuse.js](https://fusejs.io/) — client-side episode search
- [Cusdis](https://cusdis.com/) — lightweight comments on episode pages
- [Cloudflare R2](https://developers.cloudflare.com/r2/) — podcast audio hosting (outside this repo)

## Development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # generates search index + static output in dist/
npm run preview  # preview production build
```

### Environment variables

Copy `.env.example` to `.env` and set:

| Variable | Description |
|---|---|
| `PUBLIC_CUSDIS_APP_ID` | Cusdis Cloud app ID for episode comments |

## Project structure

```
src/
  content/episodes/   # Episode MDX files (77 episodes)
  components/         # Astro UI components
  layouts/            # Page layouts
  lib/                # Episode helpers and utilities
  pages/              # Routes (home, search, periods, episode pages)
public/
  images/episodes/    # Episode images
  fonts/              # Hebrew display font (EFT Tamar)
migration/            # Blogger → MDX migration scripts and data
scripts/              # Build-time scripts (search index generation)
```

Episode URLs follow the Blogger slug pattern: `/{year}/{month}/{episode-slug}.html`

## Content workflow

1. Add or edit an episode MDX file under `src/content/episodes/{year}/{month}/`
2. Place images in `public/images/episodes/{year}/{month}/{slug}/`
3. Host audio on R2 and reference it via `audioUrl` in frontmatter
4. Run `npm run build` — the search index is regenerated automatically

## Migration

The site was migrated from Google Blogger. See [`plan.md`](plan.md) for the full architecture spec, R2/Cusdis setup, and migration details. Local migration inputs (`Takeout/`, `mp3/`) are gitignored.

## License

Podcast content © Noam Eshkoli. Site source code is maintained in this repository.
