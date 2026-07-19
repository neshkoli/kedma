// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';
import { remarkYoutubeEmbed } from './src/plugins/remark-youtube-embed.mjs';

const base = process.env.ASTRO_BASE ?? '/';

export default defineConfig({
  site: 'https://www.kedma.xyz',
  base,
  output: 'static',
  build: {
    format: 'file',
  },
  markdown: {
    remarkPlugins: [remarkYoutubeEmbed],
  },
  integrations: [
    mdx(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
});
