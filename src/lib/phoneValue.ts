const COUNTRY_DDI: Record<string, string> = {
  AR: '+54',
  AU: '+61',
  BR: '+55',
  CA: '+1',
  CL: '+56',
  CN: '+86',
  CO: '+57',
  DE: '+49',
  ES: '+34',
  FR: '+33',
  GB: '+44',
  IN: '+91',
  IT: '+39',
  JP: '+81',
  MX: '+52',
  PE: '+51',
  PT: '+351',
  PY: '+595',
  US: '+1',
  UY: '+598',
};

const COUNTRY_MASK: Record<string, string> = {
  AR: '(00) 0000-0000',
  AU: '0000 000 000',
  BR: '(00) 00000-0000',
  CA: '(000) 000-0000',
  CL: '0 0000 0000',
  CN: '000 0000 0000',
  CO: '000 000 0000',
  DE: '000 00000000',
  ES: '000 00 00 00',
  FR: '0 00 00 00 00',
  GB: '0000 000000',
  IN: '00000 00000',
  IT: '000 000 0000',
  JP: '00-0000-0000',
  MX: '00 0000 0000',
  PE: '000 000 000',
  PT: '000 000 000',
  PY: '000 000 000',
  US: '(000) 000-0000',
  UY: '00 000 000',
};

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function getCountryDdi(countryCode?: string): string {
  return COUNTRY_DDI[String(countryCode || 'BR').toUpperCase()] || COUNTRY_DDI.BR;
}

export function getCountryPhoneMask(countryCode?: string): string {
  return COUNTRY_MASK[String(countryCode || 'BR').toUpperCase()] || COUNTRY_MASK.BR;
}

export function getExpectedNationalPhoneDigits(countryCode?: string): number {
  return (getCountryPhoneMask(countryCode).match(/0/g) || []).length;
}

export function applyNationalPhoneMask(value: unknown, countryCode?: string): string {
  const valueDigits = digits(value);
  const mask = getCountryPhoneMask(countryCode);
  let result = '';
  let digitIndex = 0;

  for (let maskIndex = 0; maskIndex < mask.length && digitIndex < valueDigits.length; maskIndex += 1) {
    if (mask[maskIndex] === '0') result += valueDigits[digitIndex++];
    else result += mask[maskIndex];
  }

  return result;
}

/**
 * Normalizes both the public PhoneValue shape and legacy string values into a
 * compact international number. PhoneValue.ddi already contains the leading
 * `+`, so it must never be prefixed blindly.
 */
export function formatInternationalPhone(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value === 'object' && !Array.isArray(value)) {
    const phone = value as Record<string, unknown>;
    if (phone.full_number) return formatInternationalPhone(phone.full_number);

    const numberDigits = digits(phone.number);
    if (!numberDigits) return undefined;
    const ddiDigits = digits(phone.ddi);
    return ddiDigits ? `+${ddiDigits}${numberDigits}` : numberDigits;
  }

  const raw = String(value).trim();
  const normalizedDigits = digits(raw);
  if (!normalizedDigits) return undefined;
  return raw.startsWith('+') ? `+${normalizedDigits}` : normalizedDigits;
}

export interface NormalizedPhoneValue {
  countryCode: string;
  ddi: string;
  number: string;
  /** Keeps a visually empty reset invalid until the respondent explicitly edits it. */
  invalidReason?: 'mask_overflow';
}

export interface PhoneValidationResult {
  valid: boolean;
  error?: string;
}

/** Empty optional values are allowed; once started, the national mask must be complete. */
export function validatePhoneValue(
  value: unknown,
  { required = false, defaultCountryCode = 'BR' }: { required?: boolean; defaultCountryCode?: string } = {},
): PhoneValidationResult {
  const objectValue = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (objectValue?.invalidReason === 'mask_overflow') {
    return { valid: false, error: 'Digite novamente o telefone após trocar o país' };
  }

  const normalized = normalizePhoneDefault(value, defaultCountryCode);
  let rawNationalDigits: string;
  if (objectValue) {
    rawNationalDigits = digits(objectValue.number);
  } else {
    const raw = String(value ?? '').trim();
    const rawDigits = digits(raw);
    const configuredDdiDigits = digits(getCountryDdi(defaultCountryCode));
    rawNationalDigits = raw.startsWith('+') && rawDigits.startsWith(configuredDdiDigits)
      ? rawDigits.slice(configuredDdiDigits.length)
      : rawDigits;
  }
  if (!normalized || !rawNationalDigits) {
    return required
      ? { valid: false, error: 'Telefone obrigatório' }
      : { valid: true };
  }

  const countryCode = normalized.countryCode.toUpperCase();
  if (!COUNTRY_DDI[countryCode] || normalized.ddi !== COUNTRY_DDI[countryCode]) {
    return { valid: false, error: 'Selecione um país válido para o telefone' };
  }

  const actualDigits = rawNationalDigits.length;
  const expectedDigits = getExpectedNationalPhoneDigits(countryCode);
  if (actualDigits !== expectedDigits) {
    return {
      valid: false,
      error: `Preencha todos os ${expectedDigits} dígitos do telefone`,
    };
  }

  return { valid: true };
}

/** Converts an editor default into the same object emitted by PhoneFieldPreview. */
export function normalizePhoneDefault(value: unknown, defaultCountryCode = 'BR'): NormalizedPhoneValue | undefined {
  const countryCode = String(defaultCountryCode || 'BR').toUpperCase();
  const defaultDdi = getCountryDdi(countryCode);

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const phone = value as Record<string, unknown>;
    const resolvedCountryCode = String(phone.countryCode || countryCode).toUpperCase();
    const ddiDigits = digits(phone.ddi || getCountryDdi(resolvedCountryCode));
    const ddi = `+${ddiDigits}`;
    if (phone.invalidReason === 'mask_overflow') {
      return { countryCode: resolvedCountryCode, ddi, number: '', invalidReason: 'mask_overflow' };
    }
    const nationalDigits = digits(phone.number);
    if (!nationalDigits) return undefined;
    const hasOverflow = nationalDigits.length > getExpectedNationalPhoneDigits(resolvedCountryCode);
    const number = hasOverflow ? '' : applyNationalPhoneMask(nationalDigits, resolvedCountryCode);
    if (hasOverflow) {
      return { countryCode: resolvedCountryCode, ddi, number, invalidReason: 'mask_overflow' };
    }
    return { countryCode: resolvedCountryCode, ddi, number };
  }

  const raw = String(value ?? '').trim();
  if (!raw) return undefined;

  // An international default may already include the configured DDI. Keep the
  // national portion in `number`, matching what PhoneFieldPreview emits.
  const rawDigits = digits(raw);
  const ddiDigits = digits(defaultDdi);
  const nationalDigits = raw.startsWith('+') && rawDigits.startsWith(ddiDigits)
    ? rawDigits.slice(ddiDigits.length)
    : raw;

  const normalizedNationalDigits = digits(nationalDigits);
  if (!normalizedNationalDigits) return undefined;
  const hasOverflow = normalizedNationalDigits.length > getExpectedNationalPhoneDigits(countryCode);
  const number = hasOverflow ? '' : applyNationalPhoneMask(normalizedNationalDigits, countryCode);

  return {
    countryCode,
    ddi: defaultDdi,
    number,
    ...(hasOverflow ? { invalidReason: 'mask_overflow' as const } : {}),
  };
}
