// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';

const base = process.env.ASTRO_BASE ?? '/';

export default defineConfig({
  site: 'https://www.kedma.xyz',
  base,
  output: 'static',
  build: {
    format: 'file',
  },
  integrations: [
    mdx(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
});
