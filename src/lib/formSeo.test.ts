import {
  buildFormSeoTags,
  injectFormFirstPaintShell,
  injectFormSeoIntoHtml,
  resolveFormSeo,
  serializeJsonLdForHtml,
} from './formSeo';

const ID = '92dbb7a6-270f-4a29-8b9b-e90cec5aaea1';

describe('form SEO', () => {
  it('always resolves complete, non-empty defaults and an automatic 1200x630 image', () => {
    const seo = resolveFormSeo({ id: ID }, { origin: 'https://forms.example.com' });

    expect(seo.title).toBeTruthy();
    expect(seo.description).toBeTruthy();
    expect(seo.keywords).toBeTruthy();
    expect(seo.canonicalUrl).toBe(`https://forms.example.com/f/${ID}`);
    expect(seo.imageUrl).toBe(`https://forms.example.com/api/form-og?id=${ID}`);
    expect([seo.imageWidth, seo.imageHeight, seo.imageType]).toEqual([1200, 630, 'image/png']);
    expect(seo.robots).toContain('max-image-preview:large');
    expect(JSON.stringify(seo.jsonLd)).toContain('Leonardo Scapinello');
  });

  it('never emits an insecure production origin while preserving local development', () => {
    const insecure = resolveFormSeo({ id: ID }, { origin: 'http://forms.example.com' });
    const local = resolveFormSeo({ id: ID }, { origin: 'http://127.0.0.1:8080' });

    expect(insecure.canonicalUrl).toBe(`https://forms-olive-three.vercel.app/f/${ID}`);
    expect(insecure.imageUrl).toMatch(/^https:\/\//);
    expect(local.canonicalUrl).toBe(`http://127.0.0.1:8080/f/${ID}`);
  });

  it('uses safe custom overrides and rejects executable URLs and colors', () => {
    const seo = resolveFormSeo({
      id: ID,
      title: 'Título original',
      seo: {
        title: 'Título social',
        description: 'Descrição social',
        ogImage: 'https://cdn.example.com/capa.webp',
        canonicalUrl: 'javascript:alert(1)',
        favicon: 'http://insecure.example.com/favicon.png',
        themeColor: 'red; background:url(javascript:1)',
      },
    }, { origin: 'https://forms.example.com' });

    expect(seo.title).toBe('Título social');
    expect(seo.imageUrl).toBe('https://cdn.example.com/capa.webp');
    expect(seo.imageType).toBe('image/webp');
    expect(seo.canonicalUrl).toBe(`https://forms.example.com/f/${ID}`);
    expect(seo.faviconUrl).toBe('https://forms.example.com/images/brand-favicon.svg');
    expect(seo.themeColor).toBe('#0A0A0A');
  });

  it('uses the editable personal identity everywhere and prevents indexing closed forms', () => {
    const seo = resolveFormSeo({
      id: ID,
      status: 'closed',
      brand: {
        productName: 'Leads Pro',
        ownerName: 'Leonardo Scapinello',
        logoUrl: '/images/custom-logo.svg',
        faviconUrl: '/images/custom-favicon.svg',
      },
      seo: { robots: 'index, follow' },
    }, { origin: 'https://forms.example.com' });

    expect(seo.productName).toBe('Leads Pro');
    expect(seo.siteName).toBe('Leads Pro — Leonardo Scapinello');
    expect(seo.logoUrl).toBe('https://forms.example.com/images/custom-logo.svg');
    expect(seo.faviconUrl).toBe('https://forms.example.com/images/custom-favicon.svg');
    expect(seo.robots).toBe('noindex, nofollow, noarchive');
    expect(JSON.stringify(seo.jsonLd)).toContain('Leads Pro — Leonardo Scapinello');
  });

  it('escapes HTML attributes and neutralizes script-breaking JSON-LD', () => {
    const seo = resolveFormSeo({
      id: ID,
      title: '"><img src=x onerror=alert(1)>',
      seo: {
        description: '" onload="alert(1)',
        structuredData: JSON.stringify({ '@context': 'https://schema.org', name: '</script><script>alert(1)</script>' }),
      },
    }, { origin: 'https://forms.example.com' });
    const tags = buildFormSeoTags(seo);

    expect(tags).not.toContain('<img src=x');
    expect(tags).not.toContain('</script><script>');
    expect(tags).toContain('&quot; onload=&quot;alert(1)');
    expect(serializeJsonLdForHtml(seo.jsonLd)).toContain('\\u003c/script\\u003e');
  });

  it('replaces stale SPA tags instead of creating duplicate titles or descriptions', () => {
    const seo = resolveFormSeo({ id: ID, title: 'Pesquisa anual' }, { origin: 'https://forms.example.com' });
    const result = injectFormSeoIntoHtml(
      '<!doctype html><html><head><title>Forms</title><meta name="description" content="antiga"><link rel="icon" href="/old.ico"></head><body><div id="root"></div></body></html>',
      seo,
    );

    expect(result.match(/<title>/g)).toHaveLength(1);
    expect(result.match(/name="description"/g)).toHaveLength(1);
    expect(result).not.toContain('content="antiga"');
    expect(result).toContain('property="og:image:width" content="1200"');
    expect(result).toContain('name="pinterest-rich-pin" content="true"');
    expect(result).toContain('<div id="root"></div>');
  });

  it('renders a cache-safe first paint beside the React root and escapes form content', () => {
    const metadata = {
      id: ID,
      title: '<img src=x onerror=alert(1)> Pesquisa',
      preview: {
        pageTitle: 'Contato <script>alert(1)</script>',
        fields: ['Nome', 'E-mail" onmouseover="alert(1)'],
        buttonLabel: 'Começar',
        primaryColor: 'red; background:url(javascript:1)',
      },
    };
    const seo = resolveFormSeo(metadata, { origin: 'https://forms.example.com' });
    const result = injectFormFirstPaintShell(
      '<html><body><div id="root"></div></body></html>',
      metadata,
      seo,
    );

    expect(result).toContain('id="form-ssr-shell"');
    expect(result).toContain('<div id="root"></div>');
    expect(result).not.toContain('<script>alert(1)</script>');
    expect(result).not.toContain('background:url');
    expect(result).toContain('E-mail&quot; onmouseover=&quot;alert(1)');
    expect(result).not.toContain('submissionToken');
  });

  it('never renders fake inputs or a continue action for a closed form', () => {
    const metadata = {
      id: ID,
      status: 'closed',
      title: 'Inscrições encerradas',
      preview: { fields: ['E-mail'], buttonLabel: 'Enviar' },
    };
    const seo = resolveFormSeo(metadata, { origin: 'https://forms.example.com' });
    const result = injectFormFirstPaintShell(
      '<html><body><div id="root"></div></body></html>',
      metadata,
      seo,
    );

    expect(result).toContain('encerrado ou indisponível');
    expect(result).not.toContain('E-mail');
    expect(result).not.toContain('Enviar →');
  });
});
