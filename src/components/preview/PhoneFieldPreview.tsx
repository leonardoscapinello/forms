import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  applyNationalPhoneMask,
  getCountryDdi,
  getCountryPhoneMask,
  getExpectedNationalPhoneDigits,
  normalizePhoneDefault,
  type NormalizedPhoneValue,
} from '@/lib/phoneValue';

/** Renders dropdown in a portal, positioned relative to trigger, flipping up if near bottom */
function DropdownPortal({
  triggerRef,
  contentRef,
  children,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = 280; // max-h-64 ≈ 256 + padding
    const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    setStyle({
      position: 'fixed',
      left: rect.left,
      width: 288, // w-72
      zIndex: 9999,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [triggerRef]);

  return createPortal(
    <div
      ref={contentRef}
      role="listbox"
      aria-label="País e código de discagem"
      style={style}
      className="max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg"
    >
      {children}
    </div>,
    document.body
  );
}
const COUNTRIES = [
  { code: 'BR', flag: '🇧🇷', name: 'Brasil' },
  { code: 'US', flag: '🇺🇸', name: 'Estados Unidos' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: 'CL', flag: '🇨🇱', name: 'Chile' },
  { code: 'CO', flag: '🇨🇴', name: 'Colômbia' },
  { code: 'MX', flag: '🇲🇽', name: 'México' },
  { code: 'UY', flag: '🇺🇾', name: 'Uruguai' },
  { code: 'PY', flag: '🇵🇾', name: 'Paraguai' },
  { code: 'PE', flag: '🇵🇪', name: 'Peru' },
  { code: 'GB', flag: '🇬🇧', name: 'Reino Unido' },
  { code: 'DE', flag: '🇩🇪', name: 'Alemanha' },
  { code: 'FR', flag: '🇫🇷', name: 'França' },
  { code: 'ES', flag: '🇪🇸', name: 'Espanha' },
  { code: 'IT', flag: '🇮🇹', name: 'Itália' },
  { code: 'JP', flag: '🇯🇵', name: 'Japão' },
  { code: 'CN', flag: '🇨🇳', name: 'China' },
  { code: 'IN', flag: '🇮🇳', name: 'Índia' },
  { code: 'AU', flag: '🇦🇺', name: 'Austrália' },
  { code: 'CA', flag: '🇨🇦', name: 'Canadá' },
].map(country => ({
  ...country,
  ddi: getCountryDdi(country.code),
  mask: getCountryPhoneMask(country.code),
}));

export type PhoneValue = NormalizedPhoneValue;

interface Props {
  value: PhoneValue | string | undefined;
  onChange: (value: PhoneValue) => void;
  defaultCountryCode?: string;
  error?: string | null;
  errorId?: string;
  labelledBy?: string;
}

export default function PhoneFieldPreview({ value, onChange, defaultCountryCode = 'BR', error, errorId, labelledBy }: Props) {
  const normalizedDefaultCountryCode = String(defaultCountryCode || 'BR').toUpperCase();
  const defaultCountry = COUNTRIES.find(c => c.code === normalizedDefaultCountryCode) || COUNTRIES[0];
  const phoneValue: PhoneValue = useMemo(() => {
    const normalized = normalizePhoneDefault(value, defaultCountry.code);
    if (normalized) return normalized;

    // Keep a country explicitly selected on an otherwise empty optional field.
    // This state is valid in the browser and must remain coherent with the Edge
    // validator, which also treats an empty national number as absent.
    if (typeof value === 'object' && value !== null && 'countryCode' in value) {
      const emptyCountryCode = String((value as PhoneValue).countryCode || '').toUpperCase();
      const emptyCountry = COUNTRIES.find(country => country.code === emptyCountryCode);
      if (emptyCountry) {
        return { countryCode: emptyCountry.code, ddi: emptyCountry.ddi, number: '' };
      }
    }

    return { countryCode: defaultCountry.code, ddi: defaultCountry.ddi, number: '' };
  }, [value, defaultCountry.code, defaultCountry.ddi]);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
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
    const nationalDigits = phoneValue.number.replace(/\D/g, '');
    const maxDigits = getExpectedNationalPhoneDigits(country.code);
    // Never silently reinterpret an overflowing number as a valid phone from
    // another country. Keep an invalid marker until an explicit input edit.
    const hasOverflow = !!phoneValue.invalidReason || nationalDigits.length > maxDigits;
    onChange({
      countryCode: country.code,
      ddi: country.ddi,
      number: applyNationalPhoneMask(nationalDigits, country.code),
      ...(hasOverflow ? { invalidReason: 'mask_overflow' as const } : {}),
    });
    setOpen(false);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [phoneValue, onChange]);

  const handleInput = useCallback((raw: string) => {
    const nationalDigits = raw.replace(/\D/g, '');
    const hasOverflow = nationalDigits.length > getExpectedNationalPhoneDigits(selectedCountry.code);
    const masked = applyNationalPhoneMask(raw, selectedCountry.code);
    onChange({
      countryCode: selectedCountry.code,
      ddi: selectedCountry.ddi,
      number: masked,
      ...(hasOverflow ? { invalidReason: 'mask_overflow' as const } : {}),
    });
  }, [selectedCountry, onChange]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = dropdownRef.current?.contains(target);
      const clickedPortal = portalRef.current?.contains(target);
      if (!clickedTrigger && !clickedPortal) {
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
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`País selecionado: ${selectedCountry.name}, ${selectedCountry.ddi}`}
          className="flex items-center gap-2 border-0 border-b-2 border-border hover:border-primary py-3 px-1 transition-colors cursor-pointer bg-transparent"
        >
          <span className="text-xl md:text-2xl leading-none">{selectedCountry.flag}</span>
          <span className="text-base md:text-lg text-foreground font-medium">{selectedCountry.ddi}</span>
          <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <DropdownPortal triggerRef={dropdownRef} contentRef={portalRef}>
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
                type="button"
                role="option"
                aria-selected={country.code === phoneValue.countryCode}
                onClick={() => selectCountry(country)}
                className={`group w-full flex items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground ${
                  country.code === phoneValue.countryCode ? 'bg-primary text-primary-foreground' : 'text-foreground'
                }`}
              >
                <span className="text-xl">{country.flag}</span>
                <span className="text-sm text-current flex-1">{country.name}</span>
                <span className="text-xs text-current opacity-75 group-hover:opacity-100 group-focus-visible:opacity-100">{country.ddi}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                Nenhum país encontrado
              </div>
            )}
          </DropdownPortal>
        )}
      </div>

      {/* Phone input with mask */}
      <input
        ref={inputRef}
        type="tel"
        value={applyNationalPhoneMask(phoneValue.number, selectedCountry.code)}
        onChange={e => handleInput(e.target.value)}
        placeholder={selectedCountry.mask}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        aria-labelledby={labelledBy}
        data-form-primary-control
        autoFocus
        className="flex-1 bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-base md:text-lg lg:text-2xl py-2 md:py-3 text-foreground placeholder:text-muted-foreground/40 transition-colors"
      />
    </div>
  );
}
