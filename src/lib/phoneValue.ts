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

// Some calling codes are shared by more than one country (notably +1). When
// the configured country is not one of the matches, use the same practical
// default exposed first by the public picker instead of depending on object
// insertion order.
const COUNTRY_INFERENCE_PRIORITY = [
  'US', 'CA', 'BR', 'PT', 'AR', 'CL', 'CO', 'MX', 'UY', 'PY', 'PE',
  'GB', 'DE', 'FR', 'ES', 'IT', 'JP', 'CN', 'IN', 'AU',
];

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

  // Preserve overflow visibly. Silently dropping pasted digits can transform a
  // mistyped phone into a different, apparently valid lead identifier.
  return digitIndex < valueDigits.length
    ? `${result} ${valueDigits.slice(digitIndex)}`
    : result;
}

function inferInternationalCountry(
  rawDigits: string,
  preferredCountryCode?: string,
): { countryCode: string; ddi: string; nationalDigits: string } | undefined {
  const preferred = String(preferredCountryCode || '').toUpperCase();
  const matches = Object.entries(COUNTRY_DDI)
    .map(([countryCode, ddi]) => ({ countryCode, ddi, ddiDigits: digits(ddi) }))
    .filter(candidate => rawDigits.startsWith(candidate.ddiDigits))
    .sort((left, right) => {
      const lengthDifference = right.ddiDigits.length - left.ddiDigits.length;
      if (lengthDifference !== 0) return lengthDifference;
      if (left.countryCode === preferred) return -1;
      if (right.countryCode === preferred) return 1;
      return COUNTRY_INFERENCE_PRIORITY.indexOf(left.countryCode)
        - COUNTRY_INFERENCE_PRIORITY.indexOf(right.countryCode);
    });
  const match = matches[0];
  if (!match) return undefined;
  return {
    countryCode: match.countryCode,
    ddi: match.ddi,
    nationalDigits: rawDigits.slice(match.ddiDigits.length),
  };
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
  invalidReason?: 'mask_overflow' | 'unsupported_country';
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
  const normalized = normalizePhoneDefault(value, defaultCountryCode);
  const rawNationalDigits = objectValue
    ? digits(objectValue.number)
    : digits(normalized?.number);
  if (!normalized || !rawNationalDigits) {
    if (normalized?.invalidReason === 'mask_overflow') {
      return { valid: false, error: 'O telefone possui mais dígitos do que a máscara permite' };
    }
    if (normalized?.invalidReason === 'unsupported_country') {
      return { valid: false, error: 'Selecione um país válido para o telefone' };
    }
    return required
      ? { valid: false, error: 'Telefone obrigatório' }
      : { valid: true };
  }

  if (normalized.invalidReason === 'mask_overflow') {
    return { valid: false, error: 'O telefone possui mais dígitos do que a máscara permite' };
  }
  if (normalized.invalidReason === 'unsupported_country') {
    return { valid: false, error: 'Selecione um país válido para o telefone' };
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
    if (phone.full_number !== undefined && phone.full_number !== null) {
      return normalizePhoneDefault(phone.full_number, String(phone.countryCode || countryCode));
    }
    const resolvedCountryCode = String(phone.countryCode || countryCode).toUpperCase();
    if (!COUNTRY_DDI[resolvedCountryCode]) {
      return {
        countryCode: resolvedCountryCode,
        ddi: String(phone.ddi || defaultDdi),
        number: applyNationalPhoneMask(phone.number, countryCode),
        invalidReason: 'unsupported_country',
      };
    }
    const ddiDigits = digits(phone.ddi || getCountryDdi(resolvedCountryCode));
    const ddi = `+${ddiDigits}`;
    if (phone.invalidReason === 'mask_overflow') {
      return {
        countryCode: resolvedCountryCode,
        ddi,
        number: applyNationalPhoneMask(phone.number, resolvedCountryCode),
        invalidReason: 'mask_overflow',
      };
    }
    if (phone.invalidReason === 'unsupported_country') {
      return {
        countryCode: resolvedCountryCode,
        ddi,
        number: applyNationalPhoneMask(phone.number, resolvedCountryCode),
        invalidReason: 'unsupported_country',
      };
    }
    const nationalDigits = digits(phone.number);
    if (!nationalDigits) return undefined;
    const hasOverflow = nationalDigits.length > getExpectedNationalPhoneDigits(resolvedCountryCode);
    return {
      countryCode: resolvedCountryCode,
      ddi,
      number: applyNationalPhoneMask(nationalDigits, resolvedCountryCode),
      ...(hasOverflow ? { invalidReason: 'mask_overflow' as const } : {}),
    };
  }

  const source = String(value ?? '');
  // URLSearchParams follows application/x-www-form-urlencoded semantics and
  // decodes a literal leading `+` as a space. Recover that common query-string
  // representation before deciding whether this is an international number.
  const hasDecodedLeadingPlus = /^ \d/.test(source);
  const raw = source.trim();
  if (!raw) return undefined;

  const rawDigits = digits(raw);
  let resolvedCountryCode = countryCode;
  let resolvedDdi = defaultDdi;
  let nationalDigits: string;

  if (raw.startsWith('+') || hasDecodedLeadingPlus) {
    const inferred = inferInternationalCountry(rawDigits, countryCode);
    if (!inferred) {
      return {
        countryCode,
        ddi: defaultDdi,
        number: '',
        invalidReason: 'unsupported_country',
      };
    }
    resolvedCountryCode = inferred.countryCode;
    resolvedDdi = inferred.ddi;
    nationalDigits = inferred.nationalDigits;
  } else {
    if (!COUNTRY_DDI[countryCode]) {
      return {
        countryCode,
        ddi: defaultDdi,
        number: applyNationalPhoneMask(rawDigits, 'BR'),
        invalidReason: 'unsupported_country',
      };
    }
    const inferredWithoutPlus = inferInternationalCountry(rawDigits, countryCode);
    const unambiguousInternationalValue = inferredWithoutPlus
      && rawDigits.length > getExpectedNationalPhoneDigits(countryCode)
      && inferredWithoutPlus.nationalDigits.length
        === getExpectedNationalPhoneDigits(inferredWithoutPlus.countryCode);
    if (unambiguousInternationalValue && inferredWithoutPlus) {
      resolvedCountryCode = inferredWithoutPlus.countryCode;
      resolvedDdi = inferredWithoutPlus.ddi;
      nationalDigits = inferredWithoutPlus.nationalDigits;
    } else {
      nationalDigits = rawDigits;
    }
  }

  const normalizedNationalDigits = digits(nationalDigits);
  if (!normalizedNationalDigits) return undefined;
  const hasOverflow = normalizedNationalDigits.length > getExpectedNationalPhoneDigits(resolvedCountryCode);

  return {
    countryCode: resolvedCountryCode,
    ddi: resolvedDdi,
    number: applyNationalPhoneMask(normalizedNationalDigits, resolvedCountryCode),
    ...(hasOverflow ? { invalidReason: 'mask_overflow' as const } : {}),
  };
}
