import React from 'react';
import { ImageResponse } from '@vercel/og';
import { resolveFormSeo, truncateSeoText } from '../src/lib/formSeo.js';
import {
  fetchPublicFormMetadata,
  MetadataFetchError,
  requestOrigin,
  validFormId,
} from './_lib/publicFormMetadata.js';

// Exact vector from public/images/brand-icon.svg, embedded to keep image
// generation independent from an extra network request back to the deployment.
const BRAND_ICON_DATA_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="black"/><path d="M46.7682 29.0001V32.9752H31.5534L26.9751 37.5535V61.8008L31.5534 66.3791H46.7682V70.3542H29.9075L23 63.4467V35.9076L29.9075 29.0001H46.7682Z" fill="white"/><path d="M53.1283 70.354V66.3789H68.3431L72.9214 61.8006L72.9214 37.5534L68.3431 32.9751L53.1283 32.9751V29L69.989 29L76.8965 35.9075V63.4466L69.989 70.354H53.1283Z" fill="white"/></svg>',
)}`;

function safeHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

async function handleRequest(request: Request): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const formId = new URL(request.url).searchParams.get('id');
  if (!validFormId(formId)) return new Response('Invalid form ID', { status: 400 });

  try {
    const metadata = await fetchPublicFormMetadata(request, formId);
    const origin = requestOrigin(request);
    const seo = resolveFormSeo({ ...metadata, seo: { ...metadata.seo, ogImage: undefined } }, { origin });
    const preview = metadata.preview || {};
    const primary = safeHex(preview.primaryColor, '#635BFF');
    const formBackground = safeHex(preview.backgroundColor, '#F8FAFC');
    const formText = safeHex(preview.textColor, '#111827');
    const titleSize = seo.title.length > 72 ? 45 : seo.title.length > 46 ? 53 : 62;
    const fields = (preview.fields || ['Sua resposta']).slice(0, 4);
    // ImageResponse's defaults use lowercase keys and are merged with a plain
    // object spread. Keep these keys lowercase too so our policy replaces the
    // defaults instead of Headers combining case variants into duplicate values.
    const imageHeaders = {
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
      'content-disposition': `inline; filename="form-${formId}.png"`,
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
    };

    // Social crawlers frequently probe with HEAD first. Avoid paying the image
    // rendering cost while preserving the exact cache and content contract.
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers: imageHeaders });
    }

    return new ImageResponse(
      <div style={{
        width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden',
        color: '#FFFFFF', background: 'linear-gradient(135deg, #070B1A 0%, #111735 52%, #28245C 100%)',
        fontFamily: 'Arial, sans-serif',
      }}>
        <div style={{
          display: 'flex', position: 'absolute', width: 560, height: 560, borderRadius: 280,
          background: `${primary}2B`, filter: 'blur(2px)', right: -180, top: -250,
        }} />
        <div style={{
          display: 'flex', position: 'absolute', width: 300, height: 300, borderRadius: 150,
          border: `2px solid ${primary}55`, left: -120, bottom: -160,
        }} />

        <div style={{ width: '57%', height: '100%', display: 'flex', flexDirection: 'column', padding: '64px 30px 58px 68px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{
              width: 66, height: 66, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 18, background: primary, boxShadow: `0 16px 40px ${primary}55`,
            }}>
              <img src={BRAND_ICON_DATA_URL} width={48} height={48} alt="" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: 0.2 }}>{truncateSeoText(seo.productName, 34)}</span>
              <span style={{ fontSize: 16, color: '#B8C0DC' }}>{truncateSeoText(seo.ownerName, 48)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', paddingBottom: 8 }}>
            <div style={{ display: 'flex', width: 78, height: 7, borderRadius: 999, background: primary, marginBottom: 24 }} />
            <div style={{
              display: 'flex', fontSize: titleSize, lineHeight: 1.05, fontWeight: 800,
              letterSpacing: -1.8, maxWidth: 590,
            }}>
              {truncateSeoText(seo.title, 92)}
            </div>
            <div style={{
              display: 'flex', color: '#C8CEE3', fontSize: 24, lineHeight: 1.35,
              maxWidth: 560, marginTop: 24,
            }}>
              {truncateSeoText(seo.description, 145)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#AEB7D3', fontSize: 17 }}>
            <span style={{ display: 'flex', width: 9, height: 9, borderRadius: 9, background: '#46D39A' }} />
            Formulário online
          </div>
        </div>

        <div style={{ width: '43%', height: '100%', display: 'flex', alignItems: 'center', padding: '46px 64px 46px 16px' }}>
          <div style={{
            width: '100%', minHeight: 500, display: 'flex', flexDirection: 'column',
            background: formBackground, color: formText, borderRadius: 30, padding: '34px 34px 30px',
            boxShadow: '0 30px 80px rgba(0,0,0,.38)', transform: 'rotate(1.6deg)',
            border: '1px solid rgba(255,255,255,.45)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ display: 'flex', width: 10, height: 10, borderRadius: 10, background: '#FF6B6B' }} />
                <span style={{ display: 'flex', width: 10, height: 10, borderRadius: 10, background: '#FFD166' }} />
                <span style={{ display: 'flex', width: 10, height: 10, borderRadius: 10, background: '#46D39A' }} />
              </div>
              <span style={{ display: 'flex', color: '#8490A8', fontSize: 14 }}>Prévia</span>
            </div>
            <div style={{ display: 'flex', fontSize: 25, lineHeight: 1.2, fontWeight: 750, marginBottom: 24 }}>
              {truncateSeoText(preview.pageTitle || metadata.title || seo.title, 58)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {fields.map((field, index) => (
                <div key={`${field}-${index}`} style={{
                  height: 60, display: 'flex', alignItems: 'center', padding: '0 20px',
                  borderRadius: 13, border: '2px solid #E4E7EF', background: '#FFFFFF',
                  color: '#7B8499', fontSize: 17,
                }}>
                  {truncateSeoText(field, 38)}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flex: 1 }} />
            <div style={{
              height: 62, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 14, color: '#FFFFFF', background: primary, fontSize: 18, fontWeight: 700,
              boxShadow: `0 12px 24px ${primary}45`,
            }}>
              {truncateSeoText(preview.buttonLabel || 'Continuar', 28)} →
            </div>
          </div>
        </div>
      </div>,
      {
        width: 1200,
        height: 630,
        headers: imageHeaders,
      },
    );
  } catch (error) {
    const status = error instanceof MetadataFetchError ? error.status : 503;
    return new Response(status === 404 ? 'Form not found' : 'Image temporarily unavailable', {
      status,
      headers: status === 503 ? { 'Retry-After': '10' } : undefined,
    });
  }
}

export default { fetch: handleRequest };
