/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BRAND } from './brand';
import {
  applyPlatformRouteSeo,
  PLATFORM_OG_IMAGE,
  PLATFORM_ORIGIN,
  PRIVATE_ROUTE_ROBOTS,
  resolvePlatformRouteSeo,
} from './platformSeo';

const FORM_ID = '92dbb7a6-270f-4a29-8b9b-e90cec5aaea1';

const APPLICATION_ROUTES = [
  '/',
  '/login',
  '/reset-password',
  '/dashboard',
  '/gallery',
  '/settings',
  `/editor/${FORM_ID}`,
  `/editor/${FORM_ID}/pages`,
  `/editor/${FORM_ID}/workflow`,
  `/editor/${FORM_ID}/design`,
  `/editor/${FORM_ID}/responses`,
  `/editor/${FORM_ID}/share`,
  `/editor/${FORM_ID}/analytics`,
  `/editor/${FORM_ID}/settings`,
  `/editor/${FORM_ID}/seo`,
  `/preview/${FORM_ID}`,
  `/forms/${FORM_ID}`,
  '/rota-inexistente',
] as const;

describe('platform route SEO', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.documentElement.removeAttribute('data-seo-route');
  });

  it.each(APPLICATION_ROUTES)('resolves complete, intentional private metadata for %s', (path) => {
    const seo = resolvePlatformRouteSeo(path, BRAND);

    expect(seo).not.toBeNull();
    expect(seo?.title).toBeTruthy();
    expect(seo?.description).toBeTruthy();
    expect(seo?.keywords).toBeTruthy();
    expect(seo?.canonicalUrl).toMatch(/^https:\/\/pulse\.leonardoscapinello\.com\//);
    expect(seo?.robots).toBe(PRIVATE_ROUTE_ROBOTS);
    expect(seo?.imageUrl).toBe(PLATFORM_OG_IMAGE);
    expect([seo?.imageWidth, seo?.imageHeight, seo?.imageType]).toEqual([1200, 630, 'image/png']);
    expect(seo?.imageAlt).toBeTruthy();
    expect(JSON.stringify(seo?.jsonLd)).toContain(seo?.canonicalUrl);
  });

  it('keeps every canonical on the production domain and normalizes legacy editor routes', () => {
    expect(resolvePlatformRouteSeo('/dashboard?source=test')?.canonicalUrl)
      .toBe(`${PLATFORM_ORIGIN}/dashboard`);
    expect(resolvePlatformRouteSeo(`/preview/${FORM_ID}`)?.canonicalUrl)
      .toBe(`${PLATFORM_ORIGIN}/editor/${FORM_ID}/pages`);
    expect(resolvePlatformRouteSeo(`//editor//${FORM_ID}//workflow/`)?.canonicalUrl)
      .toBe(`${PLATFORM_ORIGIN}/editor/${FORM_ID}/workflow`);
  });

  it('never overrides public form SEO', () => {
    expect(resolvePlatformRouteSeo(`/f/${FORM_ID}`)).toBeNull();
  });

  it('uses the editable identity without accepting unsafe brand assets', () => {
    const seo = resolvePlatformRouteSeo('/login', {
      ...BRAND,
      productName: 'Leads Pro',
      ownerName: 'Leonardo Scapinello',
      faviconUrl: 'javascript:alert(1)',
    });

    expect(seo?.title).toContain('Leads Pro — Leonardo Scapinello');
    expect(seo?.faviconUrl).toBe(`${PLATFORM_ORIGIN}/images/brand-favicon.svg`);
  });

  it('writes every social family, canonical and JSON-LD while removing duplicates', () => {
    document.head.innerHTML = [
      '<title>Antigo</title>',
      '<meta name="description" content="antiga">',
      '<meta name="description" content="duplicada">',
      '<meta property="og:title" content="antigo">',
      '<link rel="canonical" href="https://example.com/antiga">',
      '<link rel="canonical" href="https://example.com/duplicada">',
    ].join('');
    const seo = resolvePlatformRouteSeo(`/editor/${FORM_ID}/seo`);
    if (!seo) throw new Error('expected platform SEO');

    applyPlatformRouteSeo(document, seo);

    expect(document.title).toBe(seo.title);
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.querySelector('meta[name="keywords"]')?.getAttribute('content')).toBe(seo.keywords);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(PRIVATE_ROUTE_ROBOTS);
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(PLATFORM_OG_IMAGE);
    expect(document.querySelector('meta[property="og:image:width"]')?.getAttribute('content')).toBe('1200');
    expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image');
    expect(document.querySelector('meta[name="pinterest:image"]')?.getAttribute('content')).toBe(PLATFORM_OG_IMAGE);
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect((document.querySelector('link[rel="canonical"]') as HTMLLinkElement).href).toBe(seo.canonicalUrl);
    expect(document.getElementById('platform-seo-jsonld')?.textContent).toContain('schema.org');
    expect(document.documentElement.dataset.seoRoute).toBe(seo.canonicalUrl);
  });

  it('ships a complete noindex shell and a real 1200x630 social thumbnail', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const image = readFileSync(join(process.cwd(), 'public/images/platform-og.png'));

    expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex"');
    expect(html).toContain(`<link rel="canonical" href="${PLATFORM_ORIGIN}/"`);
    expect(html).toContain(`<meta property="og:image" content="${PLATFORM_OG_IMAGE}"`);
    expect(html).toContain('<meta property="og:image:width" content="1200"');
    expect(html).toContain('<meta property="og:image:height" content="630"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toContain('id="platform-seo-jsonld"');
    expect(image.subarray(1, 4).toString()).toBe('PNG');
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);
  });
});
