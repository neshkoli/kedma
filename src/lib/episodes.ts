import { getCollection, type CollectionEntry } from 'astro:content';
import { withBase } from '@/lib/paths';

export type Episode = CollectionEntry<'episodes'>;

export async function getEpisodes(): Promise<Episode[]> {
  const episodes = await getCollection('episodes');
  return episodes.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function episodeUrl(episode: Episode): string {
  return withBase(episode.data.slug);
}

export function formatHebrewDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function slugParts(slug: string): { year: string; month: string; file: string } | null {
  const match = slug.match(/^(\d{4})\/(\d{2})\/(.+)$/);
  if (!match) return null;
  return { year: match[1], month: match[2], file: match[3] };
}

export function uniqueTags(episodes: Episode[]): string[] {
  const tags = new Set<string>();
  for (const episode of episodes) {
    for (const tag of episode.data.tags) {
      tags.add(tag);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b, 'he'));
}

import { episodePlainTextPrefix } from './episodeSnippet.mjs';

export function episodeSnippet(
  episode: Episode,
  maxLength = 500,
): { text: string; truncated: boolean } {
  const fullText = episodePlainTextPrefix(episode.body);

  if (fullText.length <= maxLength) return { text: fullText, truncated: false };
  return { text: `${fullText.slice(0, maxLength).trim()}…`, truncated: true };
}

export function episodesByPeriod(episodes: Episode[]): Map<string, Episode[]> {
  const grouped = new Map<string, Episode[]>();

  for (const episode of episodes) {
    const key = episode.data.periodName ?? 'ללא תקופה';
    const list = grouped.get(key) ?? [];
    list.push(episode);
    grouped.set(key, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => {
      const periodDiff = (a.data.period ?? 999) - (b.data.period ?? 999);
      if (periodDiff !== 0) return periodDiff;
      return a.data.date.getTime() - b.data.date.getTime();
    });
  }

  return new Map(
    [...grouped.entries()].sort(([aName, aEps], [bName, bEps]) => {
      const aPeriod = aEps[0]?.data.period ?? 999;
      const bPeriod = bEps[0]?.data.period ?? 999;
      return aPeriod - bPeriod || aName.localeCompare(bName, 'he');
    }),
  );
}
