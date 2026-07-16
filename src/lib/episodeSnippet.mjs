const markdownPatterns = [
  /\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/, // linked image: [![](...)])](url)
  /!\[[^\]]*\]\([^)]*\)/, // image: ![](...)
  /\[[^\]]*\]\([^)]*\)/, // link: [text](url) or [](url)
  /<iframe\b/i,
];

export function episodePlainTextPrefix(body) {
  let end = body.length;
  for (const pattern of markdownPatterns) {
    const match = body.match(pattern);
    if (match?.index !== undefined) {
      end = Math.min(end, match.index);
    }
  }

  return body
    .slice(0, end)
    .replace(/[#>*_`~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function episodeSnippetFromBody(body, maxLength = 500) {
  const fullText = episodePlainTextPrefix(body);
  if (fullText.length <= maxLength) return fullText;
  return `${fullText.slice(0, maxLength).trim()}…`;
}
