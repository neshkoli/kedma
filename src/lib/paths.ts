export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL;

  if (!path || path === '/') {
    return base;
  }

  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${normalized}`;
}
