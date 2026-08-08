// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { remarkYoutubeEmbed } from './src/plugins/remark-youtube-embed.mjs';

const base = process.env.ASTRO_BASE ?? '/';
const site = process.env.ASTRO_SITE ?? 'https://www.kedma.xyz';

export default defineConfig({
  site,
  base,
  output: 'static',
  devToolbar: {
    enabled: false,
  },
  build: {
    format: 'file',
  },
  markdown: {
    processor: unified({
      remarkPlugins: [[remarkYoutubeEmbed, { base }]],
    }),
  },
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
