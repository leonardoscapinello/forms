import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Element → HTML converter ──

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function inlineStyle(obj: Record<string, string | number | undefined>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => {
      const prop = k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
      return `${prop}:${typeof v === 'number' ? v + 'px' : v}`;
    })
    .join(';');
}

function elementToHtml(el: any, formStyle: any, stepNumber: number): string {
  const style = el.style || {};

  switch (el.type) {
    case 'heading': {
      const level = el.level || 2;
      const tag = `h${level}`;
      const css = inlineStyle({
        color: style.color || formStyle?.questionTitleColor || formStyle?.textColor,
        fontFamily: style.fontFamily || formStyle?.headingFontFamily || formStyle?.fontFamily || 'Borna',
        fontWeight: style.fontWeight || formStyle?.questionTitleWeight || 'bold',
        fontSize: style.fontSize || (level === 1 ? '28px' : level === 2 ? '22px' : '18px'),
        textAlign: style.textAlign || 'left',
        margin: '0',
      });
      return `<${tag} style="${css}">${escapeHtml(el.content || 'Título')}</${tag}>`;
    }

    case 'text': {
      const css = inlineStyle({
        color: style.color || formStyle?.textColor,
        fontFamily: style.fontFamily || formStyle?.bodyFontFamily || formStyle?.fontFamily || 'Borna',
        fontWeight: style.fontWeight,
        fontSize: style.fontSize || '16px',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        margin: '0',
      });
      return `<p style="${css}">${escapeHtml(el.content || '')}</p>`;
    }

    case 'image':
      if (!el.src) return '';
      return `<img src="${escapeHtml(el.src)}" alt="${escapeHtml(el.alt || '')}" style="max-width:100%;border-radius:8px;max-height:${el.imageMaxHeight || 400}px;width:100%;object-fit:${el.imageObjectFit || 'cover'}" loading="lazy" />`;

    case 'divider':
      return `<hr style="border:none;border-top:${el.height || 1}px solid rgba(0,0,0,0.1);margin:0" />`;

    case 'spacer':
      return `<div style="height:${el.height || 40}px"></div>`;

    case 'button': {
      const btnBg = style.backgroundColor || formStyle?.buttonBgColor || formStyle?.primaryColor || '#333';
      const btnColor = style.color || formStyle?.buttonTextColor || '#fff';
      const btnRadius = style.borderRadius ?? formStyle?.buttonBorderRadius ?? 8;
      const css = inlineStyle({
        backgroundColor: btnBg,
        color: btnColor,
        borderRadius: btnRadius,
        padding: '10px 24px',
        border: 'none',
        cursor: 'pointer',
        fontFamily: style.fontFamily || formStyle?.bodyFontFamily || formStyle?.fontFamily || 'Borna',
        fontWeight: style.fontWeight || '600',
        fontSize: '15px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
      });
      return `<button type="button" style="${css}" data-action="${el.buttonAction || 'next'}" data-target="${el.buttonTargetPageId || ''}">${escapeHtml(el.content || 'Botão')}</button>`;
    }

    case 'video':
      if (!el.src) return '';
      return `<div style="aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#f0f0f0"><iframe src="${escapeHtml(el.src)}" style="width:100%;height:100%;border:0" allowfullscreen title="Video"></iframe></div>`;

    case 'alert': {
      const v = el.alertVariant || 'info';
      const colors: Record<string, { bg: string; border: string; text: string }> = {
        info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
        success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
        warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
        error: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
      };
      const c = colors[v] || colors.info;
      return `<div style="padding:12px 16px;border-radius:12px;border:1px solid ${c.border};background:${c.bg};color:${c.text};font-size:14px;line-height:1.5">${escapeHtml(el.content || 'Mensagem')}</div>`;
    }

    // Input fields — render with field header
    case 'input_text':
    case 'input_email':
    case 'input_number':
    case 'input_textarea': {
      const label = el.label || el.type.replace('input_', '').replace(/_/g, ' ');
      const placeholder = el.placeholder || 'Digite aqui...';
      const numColor = formStyle?.questionNumberColor || formStyle?.primaryColor || '#333';
      const titleColor = formStyle?.questionTitleColor || formStyle?.textColor || '#333';
      const inputType = el.type === 'input_email' ? 'email' : el.type === 'input_number' ? 'number' : 'text';

      const headerHtml = `
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
          <span style="font-weight:700;color:${numColor};font-size:${formStyle?.questionNumberSize || 15}px">${stepNumber} →</span>
          <span style="font-weight:${formStyle?.questionTitleWeight || '600'};color:${titleColor};font-size:${formStyle?.questionTitleSize || 18}px">${escapeHtml(label)}</span>
          ${el.required ? '<span style="color:#ef4444">*</span>' : ''}
        </div>`;

      if (el.type === 'input_textarea') {
        return `${headerHtml}<textarea placeholder="${escapeHtml(placeholder)}" style="width:100%;background:transparent;border:0;border-bottom:2px solid rgba(0,0,0,0.15);outline:none;font-size:18px;padding:8px 0;resize:vertical;min-height:80px;font-family:inherit;color:${formStyle?.fieldTextColor || formStyle?.textColor || '#333'}" data-field-id="${el.id}" ${el.required ? 'required' : ''}></textarea>`;
      }

      return `${headerHtml}<input type="${inputType}" placeholder="${escapeHtml(placeholder)}" style="width:100%;background:transparent;border:0;border-bottom:2px solid rgba(0,0,0,0.15);outline:none;font-size:18px;padding:8px 0;font-family:inherit;color:${formStyle?.fieldTextColor || formStyle?.textColor || '#333'}" data-field-id="${el.id}" ${el.required ? 'required' : ''} />`;
    }

    case 'input_select':
    case 'input_radio':
    case 'input_multi_select': {
      const label = el.label || 'Selecione';
      const numColor = formStyle?.questionNumberColor || formStyle?.primaryColor || '#333';
      const titleColor = formStyle?.questionTitleColor || formStyle?.textColor || '#333';
      const options = el.options || [];
      const isMulti = el.type === 'input_multi_select';

      const headerHtml = `
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">
          <span style="font-weight:700;color:${numColor};font-size:${formStyle?.questionNumberSize || 15}px">${stepNumber} →</span>
          <span style="font-weight:${formStyle?.questionTitleWeight || '600'};color:${titleColor};font-size:${formStyle?.questionTitleSize || 18}px">${escapeHtml(label)}</span>
          ${el.required ? '<span style="color:#ef4444">*</span>' : ''}
        </div>`;

      const optionsHtml = options.map((opt: any, i: number) => {
        const letter = String.fromCharCode(65 + i);
        return `<button type="button" class="ssr-option" data-field-id="${el.id}" data-option-id="${opt.id}" data-multi="${isMulti}" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;border:2px solid rgba(0,0,0,0.12);border-radius:12px;background:transparent;cursor:pointer;text-align:left;font-size:16px;font-family:inherit;transition:border-color 0.15s">
          <span style="width:28px;height:28px;border-radius:6px;border:2px solid rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">${letter}</span>
          <span>${escapeHtml(opt.label)}</span>
        </button>`;
      }).join('');

      return `${headerHtml}<div style="display:flex;flex-direction:column;gap:8px" data-field-type="${el.type}">${optionsHtml}</div>`;
    }

    case 'input_yes_no': {
      const label = el.label || 'Sim ou Não?';
      const numColor = formStyle?.questionNumberColor || formStyle?.primaryColor || '#333';
      const titleColor = formStyle?.questionTitleColor || formStyle?.textColor || '#333';

      const headerHtml = `
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">
          <span style="font-weight:700;color:${numColor};font-size:${formStyle?.questionNumberSize || 15}px">${stepNumber} →</span>
          <span style="font-weight:${formStyle?.questionTitleWeight || '600'};color:${titleColor};font-size:${formStyle?.questionTitleSize || 18}px">${escapeHtml(label)}</span>
        </div>`;

      return `${headerHtml}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <button type="button" class="ssr-option" data-field-id="${el.id}" data-option-id="yes" style="padding:16px;border:2px solid rgba(0,0,0,0.12);border-radius:12px;background:transparent;cursor:pointer;font-size:18px;font-family:inherit">👍 Sim</button>
        <button type="button" class="ssr-option" data-field-id="${el.id}" data-option-id="no" style="padding:16px;border:2px solid rgba(0,0,0,0.12);border-radius:12px;background:transparent;cursor:pointer;font-size:18px;font-family:inherit">👎 Não</button>
      </div>`;
    }

    case 'input_rating': {
      const label = el.label || 'Avaliação';
      const maxRating = el.maxRating || 5;
      const numColor = formStyle?.questionNumberColor || formStyle?.primaryColor || '#333';
      const titleColor = formStyle?.questionTitleColor || formStyle?.textColor || '#333';
      const activeColor = el.ratingActiveColor || '#f59e0b';

      const headerHtml = `
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">
          <span style="font-weight:700;color:${numColor};font-size:${formStyle?.questionNumberSize || 15}px">${stepNumber} →</span>
          <span style="font-weight:${formStyle?.questionTitleWeight || '600'};color:${titleColor};font-size:${formStyle?.questionTitleSize || 18}px">${escapeHtml(label)}</span>
        </div>`;

      const stars = Array.from({ length: maxRating }, (_, i) =>
        `<button type="button" class="ssr-rating" data-field-id="${el.id}" data-value="${i + 1}" style="background:none;border:none;cursor:pointer;font-size:32px;padding:4px;opacity:0.3;transition:opacity 0.15s" data-active-color="${activeColor}">⭐</button>`
      ).join('');

      return `${headerHtml}<div style="display:flex;gap:4px">${stars}</div>`;
    }

    case 'input_slider': {
      const label = el.label || 'Valor';
      const min = el.min ?? 0;
      const max = el.max ?? 100;
      const numColor = formStyle?.questionNumberColor || formStyle?.primaryColor || '#333';
      const titleColor = formStyle?.questionTitleColor || formStyle?.textColor || '#333';

      const headerHtml = `
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">
          <span style="font-weight:700;color:${numColor};font-size:${formStyle?.questionNumberSize || 15}px">${stepNumber} →</span>
          <span style="font-weight:${formStyle?.questionTitleWeight || '600'};color:${titleColor};font-size:${formStyle?.questionTitleSize || 18}px">${escapeHtml(label)}</span>
        </div>`;

      return `${headerHtml}<input type="range" min="${min}" max="${max}" style="width:100%" data-field-id="${el.id}" />`;
    }

    case 'input_checkbox': {
      const label = el.label || 'Concordo';
      return `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:16px">
        <input type="checkbox" data-field-id="${el.id}" style="width:18px;height:18px;accent-color:${formStyle?.primaryColor || '#333'}" ${el.required ? 'required' : ''} />
        <span>${escapeHtml(label)}</span>
      </label>`;
    }

    // Complex elements — render placeholder that React will hydrate
    default:
      return `<div data-ssr-placeholder="${el.type}" data-element-id="${el.id}" style="min-height:48px"></div>`;
  }
}

function generatePageHtml(page: any, formStyle: any): string {
  if (!page?.elements?.length) return '';
  const pageStyle = page.pageStyle || {};
  const gap = pageStyle.gap ?? 32;

  let fieldIndex = 0;
  const elementsHtml = page.elements.map((el: any) => {
    const isField = el.type.startsWith('input_');
    if (isField) fieldIndex++;
    return elementToHtml(el, formStyle, isField ? fieldIndex : 0);
  }).filter(Boolean).join(`\n`);

  return `<div style="display:flex;flex-direction:column;gap:${gap}px">${elementsHtml}</div>`;
}

function generateFormCss(formStyle: any, globalPageStyle: any): string {
  const primaryColor = formStyle?.primaryColor || '220 18% 20%';
  const bgColor = formStyle?.backgroundColor || '#FAFAF6';
  const textColor = formStyle?.textColor || '#203300';
  const fontFamily = formStyle?.fontFamily || 'Borna';

  return `
@font-face{font-family:'Borna';src:url('/fonts/borna/Borna-Regular.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:'Borna';src:url('/fonts/borna/Borna-Medium.woff2') format('woff2');font-weight:500;font-style:normal;font-display:swap}
@font-face{font-family:'Borna';src:url('/fonts/borna/Borna-SemiBold.woff2') format('woff2');font-weight:600;font-style:normal;font-display:swap}
@font-face{font-family:'Borna';src:url('/fonts/borna/Borna-Bold.woff2') format('woff2');font-weight:700;font-style:normal;font-display:swap}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100%;font-family:'${fontFamily}',ui-sans-serif,system-ui,sans-serif}
body{background:${bgColor};color:${textColor}}
#root{min-height:100vh}
.ssr-form-container{min-height:100vh;display:flex;flex-direction:column;align-items:center}
.ssr-form-content{width:100%;max-width:${672 + (globalPageStyle?.paddingX || 24) * 2}px;margin:0 auto;padding:${globalPageStyle?.paddingY || 32}px clamp(16px,4vw,${globalPageStyle?.paddingX || 24}px)}
.ssr-progress{height:4px;background:rgba(0,0,0,0.08);width:100%;position:relative;overflow:hidden}
.ssr-progress-bar{height:100%;background:hsl(${primaryColor});transition:width 0.3s ease}
.ssr-nav{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:center;padding:16px;background:rgba(255,255,255,0.8);backdrop-filter:blur(12px);border-top:1px solid rgba(0,0,0,0.06);z-index:50}
.ssr-nav-inner{display:flex;align-items:center;gap:8px}
.ssr-nav-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 24px;border-radius:8px;border:none;cursor:pointer;font-family:inherit;font-weight:600;font-size:15px;transition:all 0.15s}
.ssr-nav-next{background:hsl(${primaryColor});color:#fff}
.ssr-nav-back{background:transparent;color:${textColor};border:1px solid rgba(0,0,0,0.12)}
.ssr-logo{max-height:${formStyle?.logoHeight || 40}px;object-fit:contain}
.ssr-page{opacity:1;transition:opacity 0.18s ease}
.ssr-page-hidden{display:none}
input:focus,textarea:focus{border-bottom-color:hsl(${primaryColor})!important;outline:none}
.ssr-option:hover{border-color:hsl(${primaryColor})!important}
.ssr-option.selected{border-color:hsl(${primaryColor})!important;background:hsla(${primaryColor},0.05)!important}
@keyframes ssr-spin{to{transform:rotate(360deg)}}
  `.trim();
}

function sanitizeConfig(formData: any): any {
  // Strip sensitive data: webhook URLs, phone numbers, email addresses, API keys
  const safe = {
    id: formData.id,
    title: formData.title,
    pages: (formData.pages || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      elements: (p.elements || []).map((el: any) => ({
        id: el.id,
        type: el.type,
        label: el.label,
        placeholder: el.placeholder,
        required: el.required,
        options: el.options?.map((o: any) => ({ id: o.id, label: o.label, emoji: o.emoji, imageUrl: o.imageUrl, score: o.score })),
        content: el.content,
        defaultValue: el.defaultValue,
        maxRating: el.maxRating,
        min: el.min,
        max: el.max,
        buttonAction: el.buttonAction,
        buttonTargetPageId: el.buttonTargetPageId,
      })),
      variableAssignments: p.variableAssignments,
    })),
    globalPageStyle: formData.globalPageStyle,
    style: formData.style,
    showWelcomeScreen: formData.showWelcomeScreen,
    showProgressBar: formData.showProgressBar,
    welcomeTitle: formData.welcomeTitle,
    welcomeDescription: formData.welcomeDescription,
    thankYouTitle: formData.thankYouTitle,
    thankYouDescription: formData.thankYouDescription,
    welcomePage: formData.welcomePage ? {
      id: formData.welcomePage.id,
      elements: (formData.welcomePage.elements || []).map((el: any) => ({
        id: el.id, type: el.type, content: el.content, src: el.src, alt: el.alt, style: el.style,
        buttonAction: el.buttonAction, buttonTargetPageId: el.buttonTargetPageId,
      })),
    } : undefined,
    thankYouPage: formData.thankYouPage ? {
      id: formData.thankYouPage.id,
      elements: (formData.thankYouPage.elements || []).map((el: any) => ({
        id: el.id, type: el.type, content: el.content, src: el.src, alt: el.alt, style: el.style,
      })),
    } : undefined,
    flowEdges: formData.flowEdges,
    conditions: formData.conditions,
    variableOpNodes: formData.variableOpNodes,
    variables: formData.variables,
    // Pixel IDs are NOT sensitive — embed them for client-side firing
    analyticsNodes: formData.analyticsNodes,
    pixelLoadEvents: formData.pixelLoadEvents,
    abTestNodes: formData.abTestNodes,
    waitNodes: formData.waitNodes,
    jumpNodes: formData.jumpNodes,
    allowResume: formData.allowResume,
    savePartialResponses: formData.savePartialResponses,
    enableGeolocation: formData.enableGeolocation,
    seo: formData.seo,
    status: formData.status,
    closedMessage: formData.closedMessage,
    closedRedirectUrl: formData.closedRedirectUrl,
  };

  return safe;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { formId } = await req.json();
    if (!formId) {
      return new Response(JSON.stringify({ error: 'missing_form_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch form data
    const { data: formRow, error: fetchError } = await admin
      .from('forms')
      .select('id, title, status, data')
      .eq('id', formId)
      .single();

    if (fetchError || !formRow) {
      return new Response(JSON.stringify({ error: 'form_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const formData = {
      ...(formRow.data as Record<string, unknown>),
      id: formRow.id,
      title: formRow.title,
      status: formRow.status,
    };

    // Only generate for published forms
    if (formData.status !== 'published' && formData.status !== 'closed') {
      // Delete any existing pre-render for non-published forms
      await admin.storage.from('form-html').remove([`${formId}.json`]);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'not_published' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const formStyle = (formData as any).style || {};
    const globalPageStyle = (formData as any).globalPageStyle || {};
    const pages = (formData as any).pages || [];

    // Determine first visible page
    const showWelcome = (formData as any).showWelcomeScreen;
    let firstPageHtml = '';

    if (showWelcome) {
      const welcomePage = (formData as any).welcomePage;
      if (welcomePage?.elements?.length) {
        firstPageHtml = generatePageHtml(welcomePage, formStyle);
      } else {
        // Default welcome screen
        const title = (formData as any).welcomeTitle || formData.title || '';
        const desc = (formData as any).welcomeDescription || '';
        const btnBg = formStyle.buttonBgColor || (formStyle.primaryColor ? `hsl(${formStyle.primaryColor})` : '#333');
        const btnColor = formStyle.buttonTextColor || '#fff';
        firstPageHtml = `
          <div style="text-align:center;display:flex;flex-direction:column;gap:16px;align-items:center">
            <h1 style="font-size:28px;font-weight:700;color:${formStyle.textColor || '#333'}">${escapeHtml(title)}</h1>
            <p style="font-size:18px;color:rgba(0,0,0,0.6)">${escapeHtml(desc || 'Clique em começar para iniciar.')}</p>
            <button type="button" class="ssr-nav-btn ssr-nav-next" style="margin-top:16px;background:${btnBg};color:${btnColor}" data-action="start">Começar →</button>
          </div>`;
      }
    } else if (pages.length > 0) {
      // First non-empty page
      for (const page of pages) {
        if (page.elements?.length > 0) {
          firstPageHtml = generatePageHtml(page, formStyle);
          break;
        }
      }
    }

    // Build logo HTML
    let logoHtml = '';
    if (formStyle.logoUrl) {
      logoHtml = `<img src="${escapeHtml(formStyle.logoUrl)}" alt="Logo" class="ssr-logo" />`;
    }

    // Build progress bar HTML
    let progressHtml = '';
    if ((formData as any).showProgressBar !== false && !showWelcome) {
      const totalPages = pages.filter((p: any) => p.elements?.length > 0).length;
      const pct = totalPages > 0 ? Math.round((1 / totalPages) * 100) : 0;
      progressHtml = `<div class="ssr-progress"><div class="ssr-progress-bar" style="width:${pct}%"></div></div>`;
    }

    // Build top bar
    const hasTopBar = logoHtml || progressHtml;
    const topBarHtml = hasTopBar ? `<div style="padding:16px 16px 0;display:flex;align-items:center;gap:16px;width:100%;max-width:${672 + (globalPageStyle.paddingX || 24) * 2}px;margin:0 auto">${logoHtml}${progressHtml ? `<div style="flex:1">${progressHtml}</div>` : ''}</div>` : '';

    // Background styles
    let bgStyle = `background:${formStyle.backgroundColor || '#FAFAF6'}`;
    if (formStyle.backgroundType === 'gradient' && formStyle.backgroundGradient) {
      bgStyle = `background:${formStyle.backgroundGradient}`;
    } else if (formStyle.backgroundType === 'image' && formStyle.backgroundImage) {
      bgStyle = `background:url('${formStyle.backgroundImage}') center/cover no-repeat`;
    }

    // Full HTML shell
    const html = `<div class="ssr-form-container" style="min-height:100vh;${bgStyle}" data-ssr="true">
  ${topBarHtml}
  <div class="ssr-form-content" style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div class="ssr-page" data-page="0">
      ${firstPageHtml}
    </div>
  </div>
</div>`;

    const css = generateFormCss(formStyle, globalPageStyle);
    const config = sanitizeConfig(formData);

    const payload = JSON.stringify({ html, css, config, generatedAt: new Date().toISOString() });

    // Upload to storage (upsert)
    const { error: uploadError } = await admin.storage
      .from('form-html')
      .upload(`${formId}.json`, payload, {
        contentType: 'application/json',
        upsert: true,
        cacheControl: '300', // 5 min cache, auto-invalidated on save
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(JSON.stringify({ success: false, error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, size: payload.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
