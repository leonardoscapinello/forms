export type BrandSettings = {
  productName: string;
  ownerName: string;
  description: string;
  logoUrl: string;
  faviconUrl: string;
};

export const BRAND: BrandSettings = {
  productName: 'Forms',
  ownerName: 'Leonardo Scapinello',
  description: 'Projeto pessoal para criar, publicar e analisar formulários e quizzes interativos.',
  logoUrl: '/images/brand-icon.svg',
  faviconUrl: '/images/brand-favicon.svg',
};

function cleanText(value: unknown, fallback: string, maximumLength: number): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, maximumLength);
  return normalized || fallback;
}

function safeBrandAsset(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate.slice(0, 2_048);
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString().slice(0, 2_048) : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeBrandSettings(value: unknown): BrandSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    productName: cleanText(source.productName, BRAND.productName, 80),
    ownerName: cleanText(source.ownerName, BRAND.ownerName, 120),
    description: cleanText(source.description, BRAND.description, 320),
    logoUrl: safeBrandAsset(source.logoUrl, BRAND.logoUrl),
    faviconUrl: safeBrandAsset(source.faviconUrl, BRAND.faviconUrl),
  };
}

export function getCopyright(year = new Date().getFullYear(), brand: BrandSettings = BRAND) {
  return `© ${year} ${brand.ownerName} — ${brand.productName}`;
}
