/**
 * Shared, side-effect-free helpers for public form SEO.
 *
 * This module is consumed by the browser, the Vercel SSR route and tests. Keep
 * it free of DOM and Node-only APIs so the defaults stay identical everywhere.
 */

export const FORM_SEO_DEFAULTS = {
  author: 'Leonardo Scapinello',
  siteName: 'Forms — Leonardo Scapinello',
  locale: 'pt_BR',
  language: 'pt-BR',
  title: 'Formulário online',
  description: 'Preencha este formulário online de forma simples, rápida e segura.',
  keywords: 'formulário online, formulário, Leonardo Scapinello',
  themeColor: '#0A0A0A',
  robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  faviconPath: '/images/brand-favicon.svg',
  logoPath: '/images/brand-icon.svg',
} as const;

export interface PublicFormSeoOverrides {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  ogType?: string;
  canonicalUrl?: string;
  robots?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  structuredData?: string;
  favicon?: string;
  themeColor?: string;
}

export interface PublicFormMetadata {
  id: string;
  title?: string;
  description?: string;
  status?: 'published' | 'closed' | string;
  updatedAt?: string;
  brand?: {
    productName?: string;
    ownerName?: string;
    description?: string;
    logoUrl?: string;
    faviconUrl?: string;
  };
  seo?: PublicFormSeoOverrides;
  preview?: {
    pageTitle?: string;
    fields?: string[];
    buttonLabel?: string;
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  };
}

export interface ResolvedFormSeo {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  robots: string;
  author: string;
  productName: string;
  ownerName: string;
  siteName: string;
  locale: string;
  language: string;
  themeColor: string;
  faviconUrl: string;
  logoUrl: string;
  imageUrl: string;
  imageWidth: 1200;
  imageHeight: 630;
  imageType: 'image/png' | 'image/jpeg' | 'image/webp';
  imageAlt: string;
  ogType: 'website' | 'article' | 'product';
  twitterCard: 'summary' | 'summary_large_image';
  jsonLd: Record<string, unknown> | unknown[];
}

function normalizeWhitespace(value: unknown): string {
  return typeof value === 'string'
    ? Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    }).join('').replace(/\s+/g, ' ').trim()
    : '';
}

export function stripMarkup(value: unknown): string {
  return normalizeWhitespace(
    typeof value === 'string'
      ? value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
      : '',
  );
}

export function truncateSeoText(value: string, maximum: number): string {
  const clean = normalizeWhitespace(value);
  if (clean.length <= maximum) return clean;
  const shortened = clean.slice(0, Math.max(1, maximum - 1));
  const lastSpace = shortened.lastIndexOf(' ');
  const boundary = lastSpace > maximum * 0.6 ? lastSpace : shortened.length;
  return `${shortened.slice(0, boundary).trimEnd()}…`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeOrigin(origin: string): string {
  try {
    const parsed = new URL(origin);
    const localHttp = parsed.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password) throw new Error('invalid');
    return parsed.origin;
  } catch {
    return 'https://pulse.leonardoscapinello.com';
  }
}

function safePublicUrl(value: unknown, origin: string, fallback: string): string {
  const raw = normalizeWhitespace(value);
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw, origin);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return fallback;
    const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function safeThemeColor(value: unknown, fallback: string): string {
  const color = normalizeWhitespace(value);
  return /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9.,%\s+-]+\))$/i.test(color) ? color : fallback;
}

function inferImageType(url: string): ResolvedFormSeo['imageType'] {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (/\.jpe?g$/.test(pathname)) return 'image/jpeg';
    if (/\.webp$/.test(pathname)) return 'image/webp';
  } catch {
    // The URL was already normalized; retain the safest default if parsing ever fails.
  }
  return 'image/png';
}

function parseCustomJsonLd(value: unknown): Record<string, unknown> | unknown[] | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // Invalid custom data falls back to the complete generated schema below.
  }
  return null;
}

function automaticDescription(title: string, description?: string): string {
  const explicit = stripMarkup(description);
  if (explicit) return truncateSeoText(explicit, 220);
  if (title === FORM_SEO_DEFAULTS.title) return FORM_SEO_DEFAULTS.description;
  return truncateSeoText(`Preencha ${title} online de forma simples, rápida e segura.`, 220);
}

export function resolveFormSeo(metadata: PublicFormMetadata, options: { origin: string }): ResolvedFormSeo {
  const origin = normalizeOrigin(options.origin);
  const seo = metadata.seo || {};
  const productName = truncateSeoText(stripMarkup(metadata.brand?.productName) || 'Forms', 80);
  const ownerName = truncateSeoText(stripMarkup(metadata.brand?.ownerName) || FORM_SEO_DEFAULTS.author, 120);
  const siteName = `${productName} — ${ownerName}`;
  const formTitle = stripMarkup(metadata.title);
  const title = truncateSeoText(stripMarkup(seo.title) || formTitle || FORM_SEO_DEFAULTS.title, 120);
  const description = automaticDescription(title, stripMarkup(seo.description) || metadata.description);
  const keywords = truncateSeoText(
    stripMarkup(seo.keywords) || [formTitle || title, 'formulário online', ownerName].join(', '),
    300,
  ) || FORM_SEO_DEFAULTS.keywords;
  const defaultCanonical = `${origin}/f/${encodeURIComponent(metadata.id)}`;
  const canonicalUrl = safePublicUrl(seo.canonicalUrl, origin, defaultCanonical);
  const automaticImageUrl = `${origin}/api/form-og?id=${encodeURIComponent(metadata.id)}`;
  const imageUrl = safePublicUrl(seo.ogImage, origin, automaticImageUrl);
  const brandFavicon = safePublicUrl(metadata.brand?.faviconUrl, origin, `${origin}${FORM_SEO_DEFAULTS.faviconPath}`);
  const faviconUrl = safePublicUrl(seo.favicon, origin, brandFavicon);
  const logoUrl = safePublicUrl(metadata.brand?.logoUrl, origin, `${origin}${FORM_SEO_DEFAULTS.logoPath}`);
  const ogType = ['website', 'article', 'product'].includes(seo.ogType || '')
    ? seo.ogType as ResolvedFormSeo['ogType']
    : 'website';
  const twitterCard = seo.twitterCard === 'summary' ? 'summary' : 'summary_large_image';
  const robots = metadata.status === 'closed'
    ? 'noindex, nofollow, noarchive'
    : normalizeWhitespace(seo.robots) || FORM_SEO_DEFAULTS.robots;
  const themeColor = safeThemeColor(seo.themeColor || metadata.preview?.primaryColor, FORM_SEO_DEFAULTS.themeColor);
  const imageAlt = truncateSeoText(`${title} — prévia do formulário`, 180);

  const generatedJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ogType === 'article' ? 'Article' : 'WebPage',
    name: title,
    headline: title,
    description,
    url: canonicalUrl,
    image: {
      '@type': 'ImageObject',
      url: imageUrl,
      width: 1200,
      height: 630,
      caption: imageAlt,
    },
    inLanguage: FORM_SEO_DEFAULTS.language,
    keywords,
    author: { '@type': 'Person', name: ownerName },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      logo: { '@type': 'ImageObject', url: logoUrl },
    },
    isPartOf: {
      '@type': 'WebSite',
      name: siteName,
      url: origin,
    },
    potentialAction: {
      '@type': 'InteractAction',
      target: canonicalUrl,
      name: 'Preencher formulário',
    },
  };
  if (metadata.updatedAt && !Number.isNaN(Date.parse(metadata.updatedAt))) {
    generatedJsonLd.dateModified = new Date(metadata.updatedAt).toISOString();
  }

  return {
    title,
    description,
    keywords,
    canonicalUrl,
    robots,
    author: ownerName,
    productName,
    ownerName,
    siteName,
    locale: FORM_SEO_DEFAULTS.locale,
    language: FORM_SEO_DEFAULTS.language,
    themeColor,
    faviconUrl,
    logoUrl,
    imageUrl,
    imageWidth: 1200,
    imageHeight: 630,
    imageType: inferImageType(imageUrl),
    imageAlt,
    ogType,
    twitterCard,
    jsonLd: parseCustomJsonLd(seo.structuredData) || generatedJsonLd,
  };
}

/** JSON safe for embedding inside an HTML script element. */
export function serializeJsonLdForHtml(value: Record<string, unknown> | unknown[]): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildFormSeoTags(seo: ResolvedFormSeo): string {
  const tag = (name: string, content: string, property = false) =>
    `<meta ${property ? 'property' : 'name'}="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;
  const tags = [
    `<title>${escapeHtml(seo.title)}</title>`,
    tag('description', seo.description),
    tag('keywords', seo.keywords),
    tag('author', seo.author),
    tag('creator', seo.author),
    tag('publisher', seo.siteName),
    tag('application-name', seo.siteName),
    tag('robots', seo.robots),
    tag('googlebot', seo.robots),
    tag('bingbot', seo.robots),
    tag('theme-color', seo.themeColor),
    `<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" />`,
    `<link rel="icon" href="${escapeHtml(seo.faviconUrl)}" />`,
    `<link rel="apple-touch-icon" href="${escapeHtml(seo.faviconUrl)}" />`,
    tag('og:title', seo.title, true),
    tag('og:description', seo.description, true),
    tag('og:type', seo.ogType, true),
    tag('og:url', seo.canonicalUrl, true),
    tag('og:site_name', seo.siteName, true),
    tag('og:locale', seo.locale, true),
    tag('og:image', seo.imageUrl, true),
    tag('og:image:secure_url', seo.imageUrl, true),
    tag('og:image:type', seo.imageType, true),
    tag('og:image:width', String(seo.imageWidth), true),
    tag('og:image:height', String(seo.imageHeight), true),
    tag('og:image:alt', seo.imageAlt, true),
    tag('twitter:card', seo.twitterCard),
    tag('twitter:title', seo.title),
    tag('twitter:description', seo.description),
    tag('twitter:image', seo.imageUrl),
    tag('twitter:image:alt', seo.imageAlt),
    tag('pinterest-rich-pin', 'true'),
    tag('pinterest:title', seo.title),
    tag('pinterest:description', seo.description),
    tag('pinterest:image', seo.imageUrl),
    `<script id="form-seo-jsonld" type="application/ld+json">${serializeJsonLdForHtml(seo.jsonLd)}</script>`,
  ];
  return tags.join('\n    ');
}

const MANAGED_META_NAMES = [
  'description', 'keywords', 'author', 'creator', 'publisher', 'application-name', 'robots', 'googlebot',
  'bingbot', 'theme-color', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image',
  'twitter:image:alt', 'pinterest-rich-pin', 'pinterest:title', 'pinterest:description', 'pinterest:image',
].join('|');
const MANAGED_META_PROPERTIES = [
  'og:title', 'og:description', 'og:type', 'og:url', 'og:site_name', 'og:locale', 'og:image',
  'og:image:secure_url', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt',
].map((value) => value.replace(':', '\\:')).join('|');

export function injectFormSeoIntoHtml(html: string, seo: ResolvedFormSeo): string {
  const withoutManagedTags = html
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(new RegExp(`<meta\\b(?=[^>]*\\bname=["'](?:${MANAGED_META_NAMES})["'])[^>]*>`, 'gi'), '')
    .replace(new RegExp(`<meta\\b(?=[^>]*\\bproperty=["'](?:${MANAGED_META_PROPERTIES})["'])[^>]*>`, 'gi'), '')
    .replace(/<link\b(?=[^>]*\brel=["'](?:canonical|icon|apple-touch-icon)["'])[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bid=["'](?:form-seo-jsonld|platform-seo-jsonld|seo-jsonld)["'][^>]*>[\s\S]*?<\/script>/gi, '');
  const tags = buildFormSeoTags(seo);
  if (/<\/head>/i.test(withoutManagedTags)) {
    return withoutManagedTags.replace(/<\/head>/i, `    ${tags}\n  </head>`);
  }
  return `<!doctype html><html lang="${escapeHtml(seo.language)}"><head>${tags}</head><body>${withoutManagedTags}</body></html>`;
}

/**
 * Server-rendered first paint for public links. It intentionally contains only
 * the brand loader: no form title, fake field, CTA, submission token or workflow
 * configuration can flash before the real first screen is ready.
 */
export function buildFormFirstPaintShell(metadata: PublicFormMetadata, seo: ResolvedFormSeo): string {
  const preview = metadata.preview || {};
  const background = safeThemeColor(preview.backgroundColor, '#f8fafc');
  const foreground = safeThemeColor(preview.textColor, seo.themeColor);

  return `<style id="form-boot-loader-inline-styles">
    @keyframes form-boot-loader-spin{to{transform:rotate(360deg)}}
    @keyframes form-boot-loader-breathe{0%,100%{transform:scale(.94)}50%{transform:scale(1)}}
    #form-ssr-shell .form-boot-loader-orbit{position:absolute;inset:0;border:5px solid rgb(127 127 127/.24);border-top-color:${escapeHtml(foreground)};border-right-color:${escapeHtml(foreground)};border-radius:9999px;animation:form-boot-loader-spin .9s linear infinite;will-change:transform}
    #form-ssr-shell .form-boot-loader-mark{width:52px;height:52px;overflow:hidden;box-shadow:0 10px 30px rgb(0 0 0/.16),0 0 0 1px rgb(255 255 255/.18);animation:form-boot-loader-breathe 1.8s cubic-bezier(.4,0,.2,1) infinite;will-change:transform}
    #form-ssr-shell .form-boot-loader-mark svg{display:block;width:100%;height:100%}
    @media(prefers-reduced-motion:reduce){#form-ssr-shell .form-boot-loader-orbit,#form-ssr-shell .form-boot-loader-mark{animation:none!important;transform:none!important}}
  </style>
  <div id="form-ssr-shell" data-form-boot-loader="true" aria-hidden="true" style="position:fixed;inset:0;z-index:2147483000;display:grid;min-height:100vh;min-height:100svh;place-items:center;overflow:hidden;background:${escapeHtml(background)};transition:opacity .18s ease;pointer-events:none">
    <div style="position:relative;display:grid;width:92px;height:92px;place-items:center">
      <div class="form-boot-loader-orbit"></div>
      <div class="form-boot-loader-mark">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="100" height="100" fill="black"/>
          <path d="M46.7682 29.0001V32.9752H31.5534L26.9751 37.5535V61.8008L31.5534 66.3791H46.7682V70.3542H29.9075L23 63.4467V35.9076L29.9075 29.0001H46.7682Z" fill="white"/>
          <path d="M53.1283 70.354V66.3789H68.3431L72.9214 61.8006L72.9214 37.5534L68.3431 32.9751L53.1283 32.9751V29L69.989 29L76.8965 35.9075V63.4466L69.989 70.354H53.1283Z" fill="white"/>
        </svg>
      </div>
    </div>
  </div>`;
}

export function injectFormFirstPaintShell(
  html: string,
  metadata: PublicFormMetadata,
  seo: ResolvedFormSeo,
): string {
  if (/\bid=["']form-ssr-shell["']/i.test(html)) return html;
  const shell = buildFormFirstPaintShell(metadata, seo);
  const root = /<div\b([^>]*\bid=["']root["'][^>]*)>\s*<\/div>/i;
  if (root.test(html)) return html.replace(root, `${shell}\n    <div$1></div>`);
  return html.replace(/<body\b[^>]*>/i, (body) => `${body}\n    ${shell}`);
}
