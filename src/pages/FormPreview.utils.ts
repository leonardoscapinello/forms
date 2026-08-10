import { PageElement } from '@/types/pageElements';
import { FormData as AppFormData, UserDataMapping } from '@/types/form';
import { flattenPageElements } from '@/lib/pageElementTree';

export { flattenPageElements } from '@/lib/pageElementTree';

function digits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function hasRequiredValue(element: PageElement, value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== 'object') return true;
  const compound = value as Record<string, unknown>;
  switch (element.type) {
    case 'input_phone':
      return digits(compound.number).length >= 7;
    case 'input_document':
      return String(compound.value || '').trim().length > 0;
    case 'input_company':
      return digits(compound.cnpj).length === 14;
    case 'input_address':
      return String(compound.street || '').trim().length > 0
        && String(compound.number || '').trim().length > 0
        && String(compound.city || '').trim().length > 0
        && String(compound.state || '').trim().length > 0
        && (compound.country !== 'BR' || digits(compound.cep).length === 8);
    case 'input_height':
    case 'input_weight':
      return typeof compound.value === 'number' && Number.isFinite(compound.value);
    default:
      return Object.values(compound).some((part) => typeof part === 'number'
        || typeof part === 'boolean' && part
        || typeof part === 'string' && part.trim().length > 0);
  }
}

function isValidCpf(value: unknown): boolean {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(cpf[index]) * (length + 1 - index);
    const result = 11 - sum % 11;
    return result >= 10 ? 0 : result;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

function isValidCnpj(value: unknown): boolean {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calculate = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(cnpj[index]) * weight, 0);
    return sum % 11 < 2 ? 0 : 11 - sum % 11;
  };
  return calculate(12) === Number(cnpj[12]) && calculate(13) === Number(cnpj[13]);
}

export function getRequiredFieldErrors(
  elements: PageElement[],
  answers: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const element of flattenPageElements(elements)) {
    if (!element.required || !element.type.startsWith('input_')) continue;
    const value = answers[element.id];
    if (!hasRequiredValue(element, value)) {
      errors[element.id] = element.requiredMessage
        || (element.type === 'input_multi_select' ? 'Selecione ao menos uma opção' : 'Preencha este campo');
      continue;
    }
    if (element.type === 'input_document' && typeof value === 'object' && value) {
      const document = value as Record<string, unknown>;
      const valid = document.documentType === 'cpf'
        ? isValidCpf(document.value)
        : document.documentType === 'cnpj'
          ? isValidCnpj(document.value)
          : String(document.value || '').trim().length >= 5;
      if (!valid) errors[element.id] = element.validationMessage || 'Documento inválido';
    }
    if (element.type === 'input_number') {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) errors[element.id] = element.validationMessage || 'Número inválido';
      if (element.min !== undefined && numericValue < element.min) errors[element.id] = element.validationMessage || `Valor mínimo: ${element.min}`;
      if (element.max !== undefined && numericValue > element.max) errors[element.id] = element.validationMessage || `Valor máximo: ${element.max}`;
    }
  }
  return errors;
}

export function buildDefaults(form: AppFormData | null) {
  if (!form) return {};
  const defaults: Record<string, any> = {};
  for (const page of form.pages || []) {
    for (const el of flattenPageElements(page.elements || [])) {
      if (el.defaultValue !== undefined && el.defaultValue !== '') {
        defaults[el.id] = el.defaultValue;
      }
    }
  }
  for (const v of form.variables || []) {
    if (v.defaultValue !== undefined && v.defaultValue !== '') {
      defaults[`__var_${v.name}`] = v.defaultValue;
    }
  }
  return defaults;
}

/** Resolve userData (email, phone, name) from a UserDataMapping and current answers */
export function resolveUserData(
  mapping: UserDataMapping | undefined,
  answers: Record<string, any>,
  form: AppFormData,
): { email?: string; phone?: string; name?: string } {
  const result: { email?: string; phone?: string; name?: string } = {};

  const findFirstElement = (type: string): string | undefined => {
    for (const page of form.pages || []) {
      for (const el of flattenPageElements(page.elements || [])) {
        if (el.type === type) return el.id;
      }
    }
    return undefined;
  };

  const emailId = mapping?.emailElementId === '__none__' ? undefined
    : (mapping?.emailElementId || findFirstElement('input_email'));
  if (emailId && answers[emailId]) {
    result.email = String(answers[emailId]);
  }

  const phoneId = mapping?.phoneElementId === '__none__' ? undefined
    : (mapping?.phoneElementId || findFirstElement('input_phone'));
  if (phoneId && answers[phoneId]) {
    const val = answers[phoneId];
    result.phone = typeof val === 'object' && val?.full_number ? val.full_number : String(val);
  }

  const nameId = mapping?.nameElementId === '__none__' ? undefined
    : (mapping?.nameElementId || findFirstElement('input_short_text') || findFirstElement('input_text'));
  if (nameId && answers[nameId]) {
    result.name = String(answers[nameId]);
  }

  return result;
}

// Lazy component loaders — exported so FormPreview can use them for prefetching
export const loadPhoneFieldPreview = () => import('@/components/preview/PhoneFieldPreview');
export const loadEmailDomainSuggestions = () => import('@/components/preview/EmailDomainSuggestions');
export const loadHeightWeightField = () => import('@/components/preview/HeightWeightField');
export const loadChartLivePreview = () => import('@/components/editor/chart-designer/ChartLivePreview');
export const loadComparativeChartPreview = () => import('@/components/preview/charts/ComparativeChartPreview');
export const loadCircularProgressPreview = () => import('@/components/preview/CircularProgressPreview');
export const loadIOSNotification = () => import('@/components/preview/IOSNotification');
export const loadDateFieldPreview = () => import('@/components/preview/DateFieldPreview');
export const loadTimerPreview = () => import('@/components/preview/TimerPreview');
export const loadListPreview = () => import('@/components/preview/ListPreview');
export const loadLoadingPreview = () => import('@/components/preview/LoadingPreview');
export const loadDocumentFieldPreview = () => import('@/components/preview/DocumentFieldPreview');
export const loadCompanyFieldPreview = () => import('@/components/preview/CompanyFieldPreview');
export const loadAddressFieldPreview = () => import('@/components/preview/AddressFieldPreview');
export const loadProgressBarColumn = () => import('@/components/preview/ProgressBarColumn');
export const loadBeforeAfterSlider = () => import('@/components/preview/BeforeAfterSlider');
export const loadSectionPreviews = () => import('@/components/editor/page-builder/SectionPreviews');
export const loadWhatsAppInvite = () => import('@/components/preview/WhatsAppInvitePreview');

export function prefetchLazyComponentsForElements(
  elements?: PageElement[],
  priority: 'immediate' | 'idle' = 'idle'
) {
  if (!elements || elements.length === 0) return;

  const loaders = new Set<() => Promise<unknown>>();

  const collect = (items: PageElement[]) => {
    for (const el of items) {
      switch (el.type) {
        case 'input_phone':
          loaders.add(loadPhoneFieldPreview);
          break;
        case 'input_email':
          loaders.add(loadEmailDomainSuggestions);
          break;
        case 'input_weight':
          loaders.add(loadHeightWeightField);
          break;
        case 'chart':
          loaders.add(loadChartLivePreview);
          break;
        case 'comparative_chart':
          loaders.add(loadComparativeChartPreview);
          break;
        case 'circular_progress':
          loaders.add(loadCircularProgressPreview);
          break;
        case 'notification':
          loaders.add(loadIOSNotification);
          break;
        case 'input_date':
          loaders.add(loadDateFieldPreview);
          break;
        case 'timer':
          loaders.add(loadTimerPreview);
          break;
        case 'list':
          loaders.add(loadListPreview);
          break;
        case 'loading':
          loaders.add(loadLoadingPreview);
          break;
        case 'input_document':
          loaders.add(loadDocumentFieldPreview);
          break;
        case 'input_company':
          loaders.add(loadCompanyFieldPreview);
          break;
        case 'input_address':
          loaders.add(loadAddressFieldPreview);
          break;
        case 'progress_bar':
          loaders.add(loadProgressBarColumn);
          break;
        case 'before_after':
          loaders.add(loadBeforeAfterSlider);
          break;
        case 'arguments':
        case 'testimonials':
        case 'faq':
        case 'pricing':
        case 'carousel':
          loaders.add(loadSectionPreviews);
          break;
        case 'whatsapp_invite':
          loaders.add(loadWhatsAppInvite);
          break;
        case 'columns': {
          const columns = (el as any).columnData || [];
          for (const col of columns) {
            collect((col?.elements || []) as PageElement[]);
          }
          break;
        }
      }
    }
  };

  collect(elements);
  if (loaders.size === 0) return;

  const run = () => {
    Promise.allSettled([...loaders].map((loader) => loader())).catch(() => {});
  };

  if (priority === 'immediate') {
    run();
    return;
  }

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run);
  } else {
    setTimeout(run, 0);
  }
}
