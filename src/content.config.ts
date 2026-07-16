import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const episodes = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/episodes' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    slug: z.string(),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    audioUrl: z.string().optional(),
    audioFile: z.string().optional(),
    period: z.number().optional(),
    periodName: z.string().optional(),
  }),
});

export const collections = { episodes };
