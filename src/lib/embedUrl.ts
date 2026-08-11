const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,}$/;
const VIMEO_ID = /^\d+$/;

/** Converts supported public video URLs to a safe HTTPS embed URL. */
export function normalizeVideoEmbedUrl(rawUrl?: string): string {
  if (!rawUrl) return '';

  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== 'https:') return '';

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : '';
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const pathParts = url.pathname.split('/').filter(Boolean);
      const id = pathParts[0] === 'embed'
        ? pathParts[1] || ''
        : url.searchParams.get('v') || '';
      return YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : '';
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const pathParts = url.pathname.split('/').filter(Boolean);
      const id = pathParts[pathParts.length - 1] || '';
      return VIMEO_ID.test(id) ? `https://player.vimeo.com/video/${id}` : '';
    }
  } catch {
    return '';
  }

  return '';
}
