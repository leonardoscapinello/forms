import { BRAND, normalizeBrandSettings, type BrandSettings } from '@/lib/brand';
import { serializeJsonLdForHtml, stripMarkup, truncateSeoText } from '@/lib/formSeo';

export const PLATFORM_ORIGIN = 'https://pulse.leonardoscapinello.com';
export const PLATFORM_OG_IMAGE = `${PLATFORM_ORIGIN}/images/platform-og.png`;
export const PRIVATE_ROUTE_ROBOTS = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

const PLATFORM_LOCALE = 'pt_BR';
const PLATFORM_LANGUAGE = 'pt-BR';
const PLATFORM_THEME_COLOR = '#050505';

type RouteDescriptor = {
  title: string;
  description: string;
  keywords: string;
  canonicalPath: string;
};

export type PlatformRouteSeo = {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  robots: string;
  author: string;
  siteName: string;
  locale: string;
  language: string;
  themeColor: string;
  faviconUrl: string;
  logoUrl: string;
  imageUrl: string;
  imageWidth: 1200;
  imageHeight: 630;
  imageType: 'image/png';
  imageAlt: string;
  jsonLd: Record<string, unknown>;
};

const EDITOR_SECTIONS: Record<string, Omit<RouteDescriptor, 'canonicalPath'>> = {
  pages: {
    title: 'Editor · Páginas',
    description: 'Organize páginas, perguntas, campos e etapas do formulário.',
    keywords: 'editor de formulários, páginas, perguntas, campos',
  },
  workflow: {
    title: 'Editor · Workflow',
    description: 'Configure lógica, condições, variáveis, integrações e caminhos do formulário.',
    keywords: 'workflow de formulário, lógica condicional, variáveis, automação',
  },
  design: {
    title: 'Editor · Aparência',
    description: 'Personalize cores, tipografia, fundos e identidade visual do formulário.',
    keywords: 'design de formulário, aparência, identidade visual, personalização',
  },
  responses: {
    title: 'Editor · Respostas',
    description: 'Consulte respostas, envios completos, parciais e dados capturados pelo formulário.',
    keywords: 'respostas de formulário, leads, envios, dados',
  },
  share: {
    title: 'Editor · Compartilhar',
    description: 'Publique, compartilhe e conecte o formulário aos canais de distribuição.',
    keywords: 'compartilhar formulário, publicar formulário, integrações',
  },
  analytics: {
    title: 'Editor · Análises',
    description: 'Acompanhe conversão, abandono, desempenho e eventos do formulário.',
    keywords: 'analytics de formulário, conversão, drop-off, desempenho',
  },
  settings: {
    title: 'Editor · Configurações',
    description: 'Defina comportamento, coleta, redirecionamentos e regras do formulário.',
    keywords: 'configurações de formulário, redirecionamento, coleta de respostas',
  },
  seo: {
    title: 'Editor · SEO e compartilhamento',
    description: 'Configure título, descrição, palavras-chave, imagem social e dados estruturados do formulário.',
    keywords: 'SEO de formulário, Open Graph, imagem social, metadados',
  },
};

function normalizePathname(pathname: string): string {
  const rawPath = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  const safePath = `/${rawPath.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
  return safePath.length > 1 ? safePath.replace(/\/+$/, '') : '/';
}

function routeDescriptor(pathname: string): RouteDescriptor | null {
  const path = normalizePathname(pathname);

  // Public forms have their own server-injected, form-specific metadata. The
  // platform resolver must never replace it with generic application SEO.
  if (/^\/f\/[^/]+$/i.test(path)) return null;

  if (path === '/') {
    return {
      title: 'Meus formulários',
      description: 'Crie, organize, publique e acompanhe seus formulários em um só lugar.',
      keywords: 'formularios, criação de formulários, gestão de formulários, leads',
      canonicalPath: '/',
    };
  }
  if (path === '/login') {
    return {
      title: 'Acessar sua conta',
      description: 'Entre com segurança para criar, editar e analisar seus formulários.',
      keywords: 'login, acesso seguro, conta de formulários',
      canonicalPath: '/login',
    };
  }
  if (path === '/reset-password') {
    return {
      title: 'Redefinir senha',
      description: 'Defina uma nova senha segura para recuperar o acesso à plataforma.',
      keywords: 'redefinir senha, recuperar acesso, segurança da conta',
      canonicalPath: '/reset-password',
    };
  }
  if (path === '/dashboard') {
    return {
      title: 'Visão geral e desempenho',
      description: 'Acompanhe conversão, respostas, abandono e desempenho geral dos formulários.',
      keywords: 'dashboard de formulários, analytics, conversão, drop-off',
      canonicalPath: '/dashboard',
    };
  }
  if (path === '/gallery') {
    return {
      title: 'Galeria de arquivos',
      description: 'Organize imagens, documentos e arquivos utilizados nos seus formulários.',
      keywords: 'galeria de arquivos, imagens de formulário, documentos, mídia',
      canonicalPath: '/gallery',
    };
  }
  if (path === '/settings') {
    return {
      title: 'Configurações e integrações',
      description: 'Gerencie identidade, usuários, segurança, integrações e serviços conectados.',
      keywords: 'configurações, integrações, segurança, identidade da plataforma',
      canonicalPath: '/settings',
    };
  }

  const editorMatch = path.match(/^\/editor\/([^/]+)(?:\/([^/]+))?$/i);
  if (editorMatch) {
    const formId = editorMatch[1];
    const section = (editorMatch[2] || 'pages').toLowerCase();
    const descriptor = EDITOR_SECTIONS[section];
    if (descriptor) {
      return {
        ...descriptor,
        canonicalPath: `/editor/${formId}/${section}`,
      };
    }
  }

  const legacyMatch = path.match(/^\/(?:preview|forms)\/([^/]+)$/i);
  if (legacyMatch) {
    return {
      title: 'Abrindo o editor',
      description: 'Redirecionamento seguro para a página de edição do formulário.',
      keywords: 'editor de formulário, redirecionamento',
      canonicalPath: `/editor/${legacyMatch[1]}/pages`,
    };
  }

  return {
    title: 'Página não encontrada',
    description: 'A página solicitada não existe ou não está disponível nesta plataforma.',
    keywords: 'página não encontrada, formulário, plataforma',
    canonicalPath: path,
  };
}

function absoluteBrandAsset(value: string, fallbackPath: string): string {
  try {
    const resolved = new URL(value || fallbackPath, PLATFORM_ORIGIN);
    return resolved.protocol === 'https:'
      ? resolved.toString()
      : new URL(fallbackPath, PLATFORM_ORIGIN).toString();
  } catch {
    return new URL(fallbackPath, PLATFORM_ORIGIN).toString();
  }
}

export function resolvePlatformRouteSeo(
  pathname: string,
  brandSettings: BrandSettings = BRAND,
): PlatformRouteSeo | null {
  const descriptor = routeDescriptor(pathname);
  if (!descriptor) return null;

  const brand = normalizeBrandSettings(brandSettings);
  const routeTitle = truncateSeoText(stripMarkup(descriptor.title), 80);
  const siteName = truncateSeoText(`${brand.productName} — ${brand.ownerName}`, 180);
  const title = truncateSeoText(`${routeTitle} | ${siteName}`, 120);
  const description = truncateSeoText(stripMarkup(descriptor.description), 220);
  const keywords = truncateSeoText(
    `${stripMarkup(descriptor.keywords)}, ${brand.productName}, ${brand.ownerName}`,
    300,
  );
  const canonicalUrl = new URL(descriptor.canonicalPath, PLATFORM_ORIGIN).toString();
  const imageAlt = truncateSeoText(`${routeTitle} — ${siteName}`, 180);
  const faviconUrl = absoluteBrandAsset(brand.faviconUrl, '/images/brand-favicon.svg');
  const logoUrl = absoluteBrandAsset(brand.logoUrl, '/images/brand-icon.svg');

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: routeTitle,
    headline: routeTitle,
    description,
    url: canonicalUrl,
    inLanguage: PLATFORM_LANGUAGE,
    image: {
      '@type': 'ImageObject',
      url: PLATFORM_OG_IMAGE,
      width: 1200,
      height: 630,
      caption: imageAlt,
    },
    author: { '@type': 'Person', name: brand.ownerName },
    isPartOf: {
      '@type': 'WebApplication',
      name: siteName,
      url: PLATFORM_ORIGIN,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
    },
    publisher: {
      '@type': 'Person',
      name: brand.ownerName,
      image: logoUrl,
    },
  };

  return {
    title,
    description,
    keywords,
    canonicalUrl,
    robots: PRIVATE_ROUTE_ROBOTS,
    author: brand.ownerName,
    siteName,
    locale: PLATFORM_LOCALE,
    language: PLATFORM_LANGUAGE,
    themeColor: PLATFORM_THEME_COLOR,
    faviconUrl,
    logoUrl,
    imageUrl: PLATFORM_OG_IMAGE,
    imageWidth: 1200,
    imageHeight: 630,
    imageType: 'image/png',
    imageAlt,
    jsonLd,
  };
}

function setMeta(document: Document, attribute: 'name' | 'property', key: string, content: string): void {
  const matching = Array.from(document.head.querySelectorAll<HTMLMetaElement>(`meta[${attribute}="${key}"]`));
  const element = matching.shift() || document.createElement('meta');
  element.setAttribute(attribute, key);
  element.content = content;
  if (!element.parentNode) document.head.appendChild(element);
  matching.forEach((duplicate) => duplicate.remove());
}

function setLink(document: Document, rel: string, href: string): void {
  const matching = Array.from(document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`));
  const element = matching.shift() || document.createElement('link');
  element.rel = rel;
  element.href = href;
  if (!element.parentNode) document.head.appendChild(element);
  matching.forEach((duplicate) => duplicate.remove());
}

/** Applies the resolved metadata without a third-party head-management runtime. */
export function applyPlatformRouteSeo(document: Document, seo: PlatformRouteSeo): void {
  document.documentElement.lang = seo.language;
  document.documentElement.dataset.seoRoute = seo.canonicalUrl;
  document.title = seo.title;

  const namedMeta: Record<string, string> = {
    description: seo.description,
    keywords: seo.keywords,
    author: seo.author,
    creator: seo.author,
    publisher: seo.siteName,
    'application-name': seo.siteName,
    robots: seo.robots,
    googlebot: seo.robots,
    bingbot: seo.robots,
    'theme-color': seo.themeColor,
    'twitter:card': 'summary_large_image',
    'twitter:title': seo.title,
    'twitter:description': seo.description,
    'twitter:image': seo.imageUrl,
    'twitter:image:alt': seo.imageAlt,
    'pinterest-rich-pin': 'true',
    'pinterest:title': seo.title,
    'pinterest:description': seo.description,
    'pinterest:image': seo.imageUrl,
  };
  Object.entries(namedMeta).forEach(([name, content]) => setMeta(document, 'name', name, content));

  const propertyMeta: Record<string, string> = {
    'og:title': seo.title,
    'og:description': seo.description,
    'og:type': 'website',
    'og:url': seo.canonicalUrl,
    'og:site_name': seo.siteName,
    'og:locale': seo.locale,
    'og:image': seo.imageUrl,
    'og:image:secure_url': seo.imageUrl,
    'og:image:type': seo.imageType,
    'og:image:width': String(seo.imageWidth),
    'og:image:height': String(seo.imageHeight),
    'og:image:alt': seo.imageAlt,
  };
  Object.entries(propertyMeta).forEach(([property, content]) => setMeta(document, 'property', property, content));

  setLink(document, 'canonical', seo.canonicalUrl);
  setLink(document, 'icon', seo.faviconUrl);
  setLink(document, 'apple-touch-icon', seo.faviconUrl);

  let jsonLd = document.getElementById('platform-seo-jsonld') as HTMLScriptElement | null;
  if (!jsonLd) {
    jsonLd = document.createElement('script');
    jsonLd.id = 'platform-seo-jsonld';
    jsonLd.type = 'application/ld+json';
    document.head.appendChild(jsonLd);
  }
  jsonLd.textContent = serializeJsonLdForHtml(seo.jsonLd);
}
