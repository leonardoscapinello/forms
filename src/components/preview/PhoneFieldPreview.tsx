import { useState, useRef, useEffect, useCallback } from 'react';

const COUNTRIES = [
  { code: 'BR', ddi: '+55', flag: '🇧🇷', name: 'Brasil', mask: '(00) 00000-0000' },
  { code: 'US', ddi: '+1', flag: '🇺🇸', name: 'Estados Unidos', mask: '(000) 000-0000' },
  { code: 'PT', ddi: '+351', flag: '🇵🇹', name: 'Portugal', mask: '000 000 000' },
  { code: 'AR', ddi: '+54', flag: '🇦🇷', name: 'Argentina', mask: '(00) 0000-0000' },
  { code: 'CL', ddi: '+56', flag: '🇨🇱', name: 'Chile', mask: '0 0000 0000' },
  { code: 'CO', ddi: '+57', flag: '🇨🇴', name: 'Colômbia', mask: '000 000 0000' },
  { code: 'MX', ddi: '+52', flag: '🇲🇽', name: 'México', mask: '00 0000 0000' },
  { code: 'UY', ddi: '+598', flag: '🇺🇾', name: 'Uruguai', mask: '00 000 000' },
  { code: 'PY', ddi: '+595', flag: '🇵🇾', name: 'Paraguai', mask: '000 000 000' },
  { code: 'PE', ddi: '+51', flag: '🇵🇪', name: 'Peru', mask: '000 000 000' },
  { code: 'GB', ddi: '+44', flag: '🇬🇧', name: 'Reino Unido', mask: '0000 000000' },
  { code: 'DE', ddi: '+49', flag: '🇩🇪', name: 'Alemanha', mask: '000 00000000' },
  { code: 'FR', ddi: '+33', flag: '🇫🇷', name: 'França', mask: '0 00 00 00 00' },
  { code: 'ES', ddi: '+34', flag: '🇪🇸', name: 'Espanha', mask: '000 00 00 00' },
  { code: 'IT', ddi: '+39', flag: '🇮🇹', name: 'Itália', mask: '000 000 0000' },
  { code: 'JP', ddi: '+81', flag: '🇯🇵', name: 'Japão', mask: '00-0000-0000' },
  { code: 'CN', ddi: '+86', flag: '🇨🇳', name: 'China', mask: '000 0000 0000' },
  { code: 'IN', ddi: '+91', flag: '🇮🇳', name: 'Índia', mask: '00000 00000' },
  { code: 'AU', ddi: '+61', flag: '🇦🇺', name: 'Austrália', mask: '0000 000 000' },
  { code: 'CA', ddi: '+1', flag: '🇨🇦', name: 'Canadá', mask: '(000) 000-0000' },
];

/** Apply mask: '0' = digit slot, other chars are literal */
function applyMask(raw: string, mask: string): string {
  const digits = raw.replace(/\D/g, '');
  let result = '';
  let di = 0;
  for (let i = 0; i < mask.length && di < digits.length; i++) {
    if (mask[i] === '0') {
      result += digits[di++];
    } else {
      result += mask[i];
    }
  }
  return result;
}

/** Strip mask chars, return only digits */
function stripMask(val: string): string {
  return val.replace(/\D/g, '');
}

export interface PhoneValue {
  countryCode: string;
  ddi: string;
  number: string;
}

interface Props {
  value: PhoneValue | string | undefined;
  onChange: (value: PhoneValue) => void;
  defaultCountryCode?: string;
}

export default function PhoneFieldPreview({ value, onChange, defaultCountryCode = 'BR' }: Props) {
  const defaultCountry = COUNTRIES.find(c => c.code === defaultCountryCode) || COUNTRIES[0];
  const phoneValue: PhoneValue = typeof value === 'object' && value !== null && 'countryCode' in value
    ? value as PhoneValue
    : { countryCode: defaultCountry.code, ddi: defaultCountry.ddi, number: typeof value === 'string' ? value : '' };

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCountry = COUNTRIES.find(c => c.code === phoneValue.countryCode) || COUNTRIES[0];

  const filtered = search
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.ddi.includes(search) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  const selectCountry = useCallback((country: typeof COUNTRIES[0]) => {
    // Re-apply new country mask to existing digits
    const digits = stripMask(phoneValue.number);
    const masked = applyMask(digits, country.mask);
    onChange({ countryCode: country.code, ddi: country.ddi, number: masked });
    setOpen(false);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [phoneValue, onChange]);

  const handleInput = useCallback((raw: string) => {
    const masked = applyMask(raw, selectedCountry.mask);
    onChange({ ...phoneValue, number: masked });
  }, [phoneValue, selectedCountry, onChange]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="flex items-end gap-3">
      {/* Country selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 border-0 border-b-2 border-border hover:border-primary py-3 px-1 transition-colors cursor-pointer bg-transparent"
        >
          <span className="text-xl md:text-2xl leading-none">{selectedCountry.flag}</span>
          <span className="text-base md:text-lg text-foreground font-medium">{selectedCountry.ddi}</span>
          <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 w-72 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg z-50">
            <div className="sticky top-0 bg-popover p-2 border-b border-border">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar país..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary"
                autoFocus
              />
            </div>
            {filtered.map(country => (
              <button
                key={country.code}
                onClick={() => selectCountry(country)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors ${
                  country.code === phoneValue.countryCode ? 'bg-primary/5' : ''
                }`}
              >
                <span className="text-xl">{country.flag}</span>
                <span className="text-sm text-foreground flex-1">{country.name}</span>
                <span className="text-xs text-muted-foreground">{country.ddi}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                Nenhum país encontrado
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phone input with mask */}
      <input
        ref={inputRef}
        type="tel"
        value={phoneValue.number}
        onChange={e => handleInput(e.target.value)}
        placeholder={selectedCountry.mask}
        autoFocus
        className="flex-1 bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-base md:text-lg lg:text-2xl py-2 md:py-3 text-foreground placeholder:text-muted-foreground/40 transition-colors"
      />
    </div>
  );
}
