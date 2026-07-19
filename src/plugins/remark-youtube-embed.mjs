import { visit } from 'unist-util-visit';

const YOUTUBE_EMBED_RE = /(?:https?:)?\/\/(?:www\.)?youtube\.com\/embed\/([^/?&#]+)/i;

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function captionSub(alt) {
  if (!alt?.trim()) return '';
  return `<sub>${escapeHtml(alt.trim())}</sub>`;
}

function mediaBlock(mediaHtml, alt) {
  const caption = captionSub(alt);
  if (!caption) return mediaHtml;
  return `<div class="kedma-media">${mediaHtml}${caption}</div>`;
}

function youtubeIframe(videoId) {
  const src = `https://www.youtube.com/embed/${videoId}`;
  return `<iframe allowfullscreen="" class="BLOG_video_class" height="266" src="${src}" width="320" youtube-src-id="${videoId}"></iframe>`;
}

/** @returns {import('unified').Plugin} */
export function remarkYoutubeEmbed() {
  return (tree) => {
    visit(tree, 'link', (node, index, parent) => {
      if (!parent || index == null) return;
      if (node.children?.length !== 1 || node.children[0].type !== 'image') return;

      const image = node.children[0];
      if (!image.alt?.trim()) return;

      const href = escapeHtml(node.url);
      const src = escapeHtml(image.url);
      const html = mediaBlock(
        `<a href="${href}"><img src="${src}" alt=""></a>`,
        image.alt,
      );

      parent.children[index] = { type: 'html', value: html };
    });

    visit(tree, 'image', (node, index, parent) => {
      if (!parent || index == null || parent.type === 'link') return;

      const youtubeMatch = node.url.match(YOUTUBE_EMBED_RE);
      if (youtubeMatch) {
        parent.children[index] = {
          type: 'html',
          value: mediaBlock(youtubeIframe(youtubeMatch[1]), node.alt),
        };
        return;
      }

      if (!node.alt?.trim()) return;

      const src = escapeHtml(node.url);
      parent.children[index] = {
        type: 'html',
        value: mediaBlock(`<img src="${src}" alt="">`, node.alt),
      };
    });
  };
}
