import { PageElement } from '@/types/pageElements';
import { FormData as AppFormData, FunnelPage, UserDataMapping } from '@/types/form';
import { flattenPageElements } from '@/lib/pageElementTree';
import { getDateRangeError, isDateWithinRange, resolveDateRange } from '@/lib/dateRules';
import { validateEmailFormat } from '@/lib/emailValidation';
import {
  readAnswerValue,
  resolveConfiguredVariableValue,
  resolveTemplateValue,
} from '@/lib/variableInterpolation';
import { formatInternationalPhone, normalizePhoneDefault, validatePhoneValue } from '@/lib/phoneValue';

export { flattenPageElements } from '@/lib/pageElementTree';

function digits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export function hasFieldAnswer(element: PageElement, value: unknown): boolean {
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

function resolveOptionId(element: PageElement, value: unknown): string | undefined {
  const candidate = String(value ?? '').trim();
  if (!candidate) return undefined;
  const option = (element.options || []).find(item => (
    item.id === candidate || item.label.trim().toLocaleLowerCase('pt-BR') === candidate.toLocaleLowerCase('pt-BR')
  ));
  return option?.id;
}

function parseObjectDefault(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeDateDefault(element: PageElement, value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;

  if (element.dateMode === 'time') {
    const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (!match) return undefined;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return undefined;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  }

  // Date-only strings are interpreted as UTC by the Date constructor. Build
  // them at local noon so a configured date does not render as the previous day.
  const localDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (localDate) {
    const year = Number(localDate[1]);
    const month = Number(localDate[2]);
    const day = Number(localDate[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
    return date.toISOString();
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeElementDefault(element: PageElement, value: unknown): unknown {
  switch (element.type) {
    case 'input_phone':
      return normalizePhoneDefault(value, element.defaultCountryCode);

    case 'input_height':
    case 'input_weight': {
      const objectValue = parseObjectDefault(value);
      const numericValue = Number(objectValue?.value ?? value);
      if (!Number.isFinite(numericValue)) return undefined;
      if (element.min !== undefined && numericValue < element.min) return undefined;
      if (element.max !== undefined && numericValue > element.max) return undefined;
      return {
        value: numericValue,
        unit: String(objectValue?.unit || element.unit || (element.type === 'input_height' ? 'cm' : 'kg')),
      };
    }

    case 'input_select':
    case 'input_radio':
    case 'input_quiz_icon':
    case 'input_quiz_image':
      return resolveOptionId(element, value);

    case 'input_multi_select': {
      let candidates: unknown[];
      if (Array.isArray(value)) {
        candidates = value;
      } else if (typeof value === 'string') {
        const trimmed = value.trim();
        try {
          const parsed = JSON.parse(trimmed);
          candidates = Array.isArray(parsed) ? parsed : trimmed.split(',');
        } catch {
          candidates = trimmed.split(',');
        }
      } else {
        candidates = [];
      }
      const optionIds = candidates
        .map(candidate => resolveOptionId(element, candidate))
        .filter((candidate): candidate is string => !!candidate);
      return optionIds.length > 0 ? [...new Set(optionIds)] : undefined;
    }

    case 'input_yes_no': {
      if (value === true || value === 1) return 'yes';
      if (value === false || value === 0) return 'no';
      const normalized = String(value ?? '').trim().toLocaleLowerCase('pt-BR');
      if (['yes', 'sim', 'true', '1'].includes(normalized)) return 'yes';
      if (['no', 'não', 'nao', 'false', '0'].includes(normalized)) return 'no';
      return undefined;
    }

    case 'input_checkbox':
      return value === true || value === 1 || ['true', '1', 'yes', 'sim'].includes(String(value).toLowerCase());

    case 'input_rating':
    case 'input_nps':
    case 'input_number': {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return undefined;
      const minimum = element.type === 'input_nps' ? 0 : (element.type === 'input_rating' ? 1 : element.min);
      const maximum = element.type === 'input_nps' || element.type === 'input_rating' ? element.maxRating : element.max;
      if (minimum !== undefined && numericValue < minimum) return undefined;
      if (maximum !== undefined && numericValue > maximum) return undefined;
      return numericValue;
    }

    case 'input_date':
      return normalizeDateDefault(element, value);

    case 'input_document': {
      const objectValue = parseObjectDefault(value);
      if (objectValue?.value !== undefined) return objectValue;
      const raw = String(value ?? '').trim();
      if (!raw) return undefined;
      const allowed = element.documentAllowedTypes?.length
        ? element.documentAllowedTypes
        : ['cpf', 'cnpj', 'passport'];
      const digitCount = digits(raw).length;
      const documentType = digitCount === 14 && allowed.includes('cnpj')
        ? 'cnpj'
        : digitCount === 11 && allowed.includes('cpf')
          ? 'cpf'
          : allowed[0];
      return { documentType, value: raw };
    }

    case 'input_company': {
      const objectValue = parseObjectDefault(value);
      if (objectValue?.cnpj !== undefined) return objectValue;
      const raw = String(value ?? '').trim();
      return raw ? { cnpj: raw } : undefined;
    }

    case 'input_address': {
      const objectValue = parseObjectDefault(value);
      if (objectValue) return { country: 'BR', ...objectValue };
      const raw = String(value ?? '').trim();
      return raw ? {
        country: 'BR', cep: '', street: raw, number: '', complement: '', neighborhood: '', city: '', state: '',
      } : undefined;
    }

    default:
      return value;
  }
}

export function getRequiredFieldErrors(
  elements: PageElement[],
  answers: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const element of flattenPageElements(elements)) {
    if (!element.type.startsWith('input_')) continue;
    const value = answers[element.id];
    const hasValue = hasFieldAnswer(element, value);
    const phoneWasStarted = element.type === 'input_phone'
      && typeof value === 'object'
      && value !== null
      && (digits((value as Record<string, unknown>).number).length > 0
        || Boolean((value as Record<string, unknown>).invalidReason));
    if (element.required && !hasValue && !phoneWasStarted) {
      errors[element.id] = element.requiredMessage
        || (element.type === 'input_multi_select' ? 'Selecione ao menos uma opção' : 'Preencha este campo');
      continue;
    }
    if (!hasValue && !phoneWasStarted) continue;
    if (element.type === 'input_email') {
      const result = validateEmailFormat(String(value));
      if (!result.valid) errors[element.id] = element.validationMessage || result.error || 'E-mail inválido';
    }
    if (element.type === 'input_phone') {
      const result = validatePhoneValue(value, {
        required: element.required,
        defaultCountryCode: element.defaultCountryCode,
      });
      if (!result.valid) errors[element.id] = element.validationMessage || result.error || 'Telefone inválido';
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
    if (element.type === 'input_company') {
      const cnpj = typeof value === 'object' && value
        ? (value as Record<string, unknown>).cnpj
        : value;
      if (!isValidCnpj(cnpj)) errors[element.id] = element.validationMessage || 'CNPJ inválido';
    }
    if (element.type === 'input_number') {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) errors[element.id] = element.validationMessage || 'Número inválido';
      if (element.min !== undefined && numericValue < element.min) errors[element.id] = element.validationMessage || `Valor mínimo: ${element.min}`;
      if (element.max !== undefined && numericValue > element.max) errors[element.id] = element.validationMessage || `Valor máximo: ${element.max}`;
    }
    if (element.type === 'input_date' && (element.dateMode || 'date') !== 'time') {
      const date = new Date(String(value));
      const range = resolveDateRange(element.dateMinRule, element.dateMaxRule);
      if (Number.isNaN(date.getTime()) || !isDateWithinRange(date, range)) {
        errors[element.id] = element.dateConstraintMessage || getDateRangeError(range);
      }
    }
  }
  return errors;
}

/**
 * Auto-advance is only safe when every input on the page has an answer. Optional
 * fields may be omitted on manual navigation, but must not be silently skipped by
 * a choice field that auto-advances.
 */
export function hasUnansweredInputFields(
  elements: PageElement[],
  answers: Record<string, unknown>,
): boolean {
  return flattenPageElements(elements).some((element) => (
    element.type.startsWith('input_') && !hasFieldAnswer(element, answers[element.id])
  ));
}

/** Synchronise an element configured with "Salvar em variável". */
export function applyElementVariableBinding(
  form: AppFormData,
  elementId: string,
  value: unknown,
  currentAnswers: Record<string, any>,
): Record<string, any> {
  const searchablePages = [
    ...(form.pages || []),
    form.welcomePage,
    form.thankYouPage,
  ].filter((page): page is FunnelPage => Boolean(page));
  const element = searchablePages
    .flatMap((page) => flattenPageElements(page.elements || []))
    .find((candidate) => candidate.id === elementId);
  if (!element?.variableId) return currentAnswers;

  const variable = (form.variables || []).find((candidate) => candidate.id === element.variableId);
  if (!variable) return currentAnswers;

  return { ...currentAnswers, [`__var_${variable.name}`]: value };
}

/** Apply assignments when a respondent enters a page. */
export function applyPageVariableAssignments(
  form: AppFormData,
  page: FunnelPage,
  currentAnswers: Record<string, any>,
): Record<string, any> {
  if (!page.variableAssignments?.length || !form.variables?.length) return currentAnswers;

  const updated = { ...currentAnswers };
  for (const assignment of page.variableAssignments) {
    const variable = form.variables.find((candidate) => candidate.id === assignment.variableId);
    if (!variable) continue;

    let value: unknown;
    if (assignment.sourceType === 'field' && assignment.sourceElementId) {
      value = readAnswerValue(updated, assignment.sourceElementId);
    } else if (assignment.sourceType === 'context' && assignment.value) {
      value = updated[`__ctx_${assignment.value}`];
    } else if (assignment.sourceType === 'param' && assignment.value) {
      value = updated[`__param_${assignment.value}`];
    } else if (assignment.sourceType === 'free') {
      value = resolveTemplateValue(
        assignment.value || '',
        form.variables,
        updated,
        { unknown: 'empty' },
      );
    }

    if (value !== undefined && value !== null) {
      updated[`__var_${variable.name}`] = value;
    }
  }
  return updated;
}

/**
 * Resolve form and variable defaults against the synchronous session seed.
 *
 * A bounded fixed-point pass is intentional: a variable may reference another
 * variable declared later, a response variable may read a compound field
 * default, and a field default may in turn reference any of those values. Cycles
 * settle as empty values and never block the first render.
 */
export function buildDefaults(
  form: AppFormData | null,
  seedAnswers: Record<string, any> = {},
) {
  if (!form) return {};
  const variables = form.variables || [];
  const defaults: Record<string, any> = {};
  const pages = [
    ...(form.pages || []),
    ...(form.welcomePage ? [form.welcomePage] : []),
    ...(form.thankYouPage ? [form.thankYouPage] : []),
  ];
  const elements = pages.flatMap(page => flattenPageElements(page.elements || []));
  const resolvedAnswers: Record<string, any> = { ...seedAnswers };
  const maxPasses = Math.min(512, Math.max(2, variables.length + elements.length + 1));

  const snapshot = () => JSON.stringify(
    Object.keys(defaults).sort().map(key => [key, defaults[key]]),
  );

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const before = snapshot();
    for (const variable of variables) {
      const storeKey = `__var_${variable.name}`;
      if (Object.prototype.hasOwnProperty.call(seedAnswers, storeKey)) continue;

      // A value produced by an earlier pass is not an explicit runtime
      // override. Remove only the current variable so response/default sources
      // can be recomputed as other defaults become available.
      const resolutionAnswers = { ...resolvedAnswers };
      delete resolutionAnswers[storeKey];
      const value = resolveConfiguredVariableValue(variable, variables, resolutionAnswers);
      if (value === undefined || value === null || value === '') {
        delete resolvedAnswers[storeKey];
        delete defaults[storeKey];
      } else {
        resolvedAnswers[storeKey] = value;
        // Response variables must continue reading their source field after the
        // respondent edits a pre-populated value. Keeping a computed __var_
        // entry here would incorrectly turn the initial value into a permanent
        // runtime override.
        if (variable.type === 'response') delete defaults[storeKey];
        else defaults[storeKey] = value;
      }
    }

    for (const el of elements) {
      if (Object.prototype.hasOwnProperty.call(seedAnswers, el.id)) continue;
      if (el.defaultValue !== undefined && el.defaultValue !== '') {
        const configuredValue = resolveTemplateValue(
          el.defaultValue,
          variables,
          resolvedAnswers,
          { unknown: 'empty' },
        );
        const normalizedValue = normalizeElementDefault(el, configuredValue);
        if (normalizedValue === undefined || normalizedValue === null || normalizedValue === '') {
          delete resolvedAnswers[el.id];
          delete defaults[el.id];
        } else {
          resolvedAnswers[el.id] = normalizedValue;
          defaults[el.id] = normalizedValue;
          if (el.variableId) {
            const boundVariable = variables.find(variable => variable.id === el.variableId);
            const boundKey = boundVariable ? `__var_${boundVariable.name}` : '';
            if (boundKey && !Object.prototype.hasOwnProperty.call(seedAnswers, boundKey)) {
              resolvedAnswers[boundKey] = normalizedValue;
              defaults[boundKey] = normalizedValue;
            }
          }
        }
      }
    }
    if (snapshot() === before) break;
  }
  return defaults;
}

function sameDefaultValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * Merge context that only becomes available after first paint (currently geo)
 * without overwriting respondent edits or resumed values.
 */
export function mergeLateContextDefaults(
  form: AppFormData,
  currentAnswers: Record<string, any>,
  initialDefaults: Record<string, any>,
  lateContextAnswers: Record<string, any>,
  protectedKeys: ReadonlySet<string> = new Set(),
): Record<string, any> {
  const seedAnswers: Record<string, any> = {};
  for (const [key, value] of Object.entries(currentAnswers)) {
    if (
      key.startsWith('__ctx_') || key.startsWith('__param_') ||
      key.startsWith('__webhook_') || protectedKeys.has(key)
    ) seedAnswers[key] = value;
  }
  Object.assign(seedAnswers, lateContextAnswers);
  const refreshedDefaults = buildDefaults(form, seedAnswers);
  const next = { ...currentAnswers, ...lateContextAnswers };

  for (const [key, refreshedValue] of Object.entries(refreshedDefaults)) {
    if (protectedKeys.has(key)) continue;
    const currentValue = currentAnswers[key];
    const wasInitiallyDefaulted = Object.prototype.hasOwnProperty.call(initialDefaults, key) &&
      sameDefaultValue(currentValue, initialDefaults[key]);
    const isStillEmpty = currentValue === undefined || currentValue === null || currentValue === '';
    if (isStillEmpty || wasInitiallyDefaulted) next[key] = refreshedValue;
  }
  return next;
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
    result.phone = formatInternationalPhone(answers[phoneId]);
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
