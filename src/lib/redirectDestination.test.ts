import { afterEach, describe, expect, it } from 'vitest';
import {
  prepareRedirectDestination,
  redirectTemplateHasRuntimeValues,
  resolveRedirectDestination,
} from './redirectDestination';

const variables = [
  { id: 'city', name: 'cidade', type: 'text' as const },
  { id: 'lead', name: 'lead', type: 'response' as const, sourceElementId: 'name' },
];

afterEach(() => {
  document.head.querySelectorAll('[data-forms-redirect-preload]').forEach(element => element.remove());
});
describe('redirect destination resolution', () => {
  it('interpolates fields, variables, context, webhook data and query params as encoded URL components', () => {
    const destination = resolveRedirectDestination(
      'https://example.com/{{cidade}}?name={{field:name}}&device={{ctx.device}}&utm={{param.utm_source}}&id={{webhook:hook:data.id}}',
      variables,
      {
        __var_cidade: 'São Paulo/centro',
        name: 'Ana & Leo',
        __ctx_device: 'mobile',
        __param_utm_source: 'meta ads',
        __webhook_hook: { data: { id: 'abc/123' } },
      },
      'https://forms.example/f/123',
    );

    expect(destination?.url).toBe(
      'https://example.com/S%C3%A3o%20Paulo%2Fcentro?name=Ana%20%26%20Leo&device=mobile&utm=meta%20ads&id=abc%2F123',
    );
    expect(destination?.isExternal).toBe(true);
    expect(destination?.hasRuntimeValues).toBe(true);
  });

  it('allows safe same-origin root paths and blocks executable, insecure and host-dynamic targets', () => {
    expect(resolveRedirectDestination('/obrigado/{{lead}}', variables, { name: 'Leonardo' }, 'https://forms.example/f/1')?.url)
      .toBe('https://forms.example/obrigado/Leonardo');

    for (const unsafe of [
      'javascript:alert(1)',
      'data:text/html,boom',
      'http://example.com',
      '//evil.example/path',
      'https://{{cidade}}.example/path',
      '{{param.destination}}',
      '/\\evil.example/path',
      'https://user:password@example.com/path',
    ]) {
      expect(resolveRedirectDestination(unsafe, variables, { __var_cidade: 'safe' }, 'https://forms.example/f/1')).toBeNull();
    }
  });

  it('does not prepare dynamic destinations early, then preconnects and prefetches them at completion', () => {
    const template = 'https://checkout.example/order/{{field:order}}';
    expect(redirectTemplateHasRuntimeValues(template)).toBe(true);
    expect(prepareRedirectDestination({
      template,
      answers: { order: 'secret lead value' },
      variables,
      phase: 'early',
      baseUrl: 'https://forms.example/f/1',
    })).toBeNull();
    expect(document.head.querySelectorAll('[data-forms-redirect-preload]')).toHaveLength(0);

    const destination = prepareRedirectDestination({
      template,
      answers: { order: 'secret lead value' },
      variables,
      phase: 'final',
      baseUrl: 'https://forms.example/f/1',
    });

    expect(destination?.url).toBe('https://checkout.example/order/secret%20lead%20value');
    expect(document.head.querySelector('link[rel="dns-prefetch"]')).toHaveAttribute('href', '//checkout.example');
    expect(document.head.querySelector('link[rel="preconnect"]')).toHaveAttribute('href', 'https://checkout.example');
    expect(document.head.querySelector('link[rel="prefetch"]')).toHaveAttribute('href', destination?.url);
  });

  it('deduplicates preload hints for a static destination', () => {
    const options = {
      template: '/obrigado',
      phase: 'early' as const,
      baseUrl: 'https://forms.example/f/1',
    };
    prepareRedirectDestination(options);
    prepareRedirectDestination(options);
    expect(document.head.querySelectorAll('link[rel="prefetch"][data-forms-redirect-preload]')).toHaveLength(1);
  });
});
