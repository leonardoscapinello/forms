import { useState, useCallback, useRef, useEffect } from 'react';

const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
  'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const BR_STATE_NAME_TO_UF: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amapa': 'AP', 'amazonas': 'AM',
  'bahia': 'BA', 'ceará': 'CE', 'ceara': 'CE', 'distrito federal': 'DF',
  'espírito santo': 'ES', 'espirito santo': 'ES', 'goiás': 'GO', 'goias': 'GO',
  'maranhão': 'MA', 'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', 'pará': 'PA', 'para': 'PA', 'paraíba': 'PB', 'paraiba': 'PB',
  'paraná': 'PR', 'parana': 'PR', 'pernambuco': 'PE', 'piauí': 'PI', 'piaui': 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  'rondônia': 'RO', 'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
  'são paulo': 'SP', 'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
};

const COUNTRIES = [
  { code: 'BR', flag: '🇧🇷', name: 'Brasil', hasCep: true },
  { code: 'US', flag: '🇺🇸', name: 'Estados Unidos', hasCep: false },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal', hasCep: false },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina', hasCep: false },
  { code: 'CL', flag: '🇨🇱', name: 'Chile', hasCep: false },
  { code: 'CO', flag: '🇨🇴', name: 'Colômbia', hasCep: false },
  { code: 'MX', flag: '🇲🇽', name: 'México', hasCep: false },
  { code: 'DE', flag: '🇩🇪', name: 'Alemanha', hasCep: false },
  { code: 'FR', flag: '🇫🇷', name: 'França', hasCep: false },
  { code: 'ES', flag: '🇪🇸', name: 'Espanha', hasCep: false },
  { code: 'IT', flag: '🇮🇹', name: 'Itália', hasCep: false },
  { code: 'GB', flag: '🇬🇧', name: 'Reino Unido', hasCep: false },
  { code: 'JP', flag: '🇯🇵', name: 'Japão', hasCep: false },
  { code: 'CA', flag: '🇨🇦', name: 'Canadá', hasCep: false },
  { code: 'AU', flag: '🇦🇺', name: 'Austrália', hasCep: false },
];

interface AddressValue {
  country: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

const EMPTY_ADDRESS: AddressValue = {
  country: 'BR',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
};

export interface GeoSuggestion {
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  neighborhood?: string;
  street?: string;
  cep?: string;
  source?: string; // 'gps' | 'ip'
}

interface Props {
  value: AddressValue | undefined;
  onChange: (value: AddressValue) => void;
  geoSuggestion?: GeoSuggestion;
}

const inputClass = "w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-xl py-2 mt-1 text-foreground placeholder:text-muted-foreground/40 transition-colors";
const readonlyClass = "w-full bg-muted/30 border-0 border-b-2 border-border/50 outline-none text-xl py-2 mt-1 text-foreground/80 transition-colors cursor-default";
const labelClass = "text-sm font-medium text-muted-foreground uppercase tracking-wider";

export default function AddressFieldPreview({ value, onChange, geoSuggestion }: Props) {
  const addr = value && typeof value === 'object' && 'country' in value ? value : EMPTY_ADDRESS;
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const [cepFound, setCepFound] = useState(false);
  const [geoApplied, setGeoApplied] = useState(false);

  const numberRef = useRef<HTMLInputElement>(null);
  const complementRef = useRef<HTMLInputElement>(null);

  const isBrazil = addr.country === 'BR';

  const update = useCallback((patch: Partial<AddressValue>) => {
    onChange({ ...addr, ...patch });
  }, [addr, onChange]);

  // Auto-fill from geolocation suggestion (once, when data arrives)
  useEffect(() => {
    if (geoApplied || !geoSuggestion || !geoSuggestion.city) return;
    // Only suggest if user hasn't typed anything yet
    const isEmpty = !addr.city && !addr.state && !addr.street && !addr.cep;
    if (!isEmpty) return;

    const patch: Partial<AddressValue> = {};

    // Set country if detected
    if (geoSuggestion.countryCode) {
      const matchedCountry = COUNTRIES.find(c => c.code === geoSuggestion.countryCode);
      if (matchedCountry) patch.country = matchedCountry.code;
    }

    if (geoSuggestion.city) patch.city = geoSuggestion.city;
    if (geoSuggestion.state) {
      if ((patch.country || addr.country) === 'BR') {
        const normalized = geoSuggestion.state.toLowerCase().trim();
        const uf = BR_STATE_NAME_TO_UF[normalized]
          || BR_STATES.find(s => s === normalized.toUpperCase())
          || BR_STATES.find(s => s === normalized.toUpperCase().slice(0, 2));
        if (uf) patch.state = uf;
      } else {
        patch.state = geoSuggestion.state;
      }
    }
    if (geoSuggestion.neighborhood) patch.neighborhood = geoSuggestion.neighborhood;
    if (geoSuggestion.street && geoSuggestion.source === 'gps') patch.street = geoSuggestion.street;
    if (geoSuggestion.cep && geoSuggestion.source === 'gps') patch.cep = geoSuggestion.cep;

    if (Object.keys(patch).length > 0) {
      onChange({ ...addr, ...patch });
      setGeoApplied(true);
    }
  }, [geoSuggestion, geoApplied, addr, onChange]);

  // Auto-fill from ViaCEP
  const fetchCep = useCallback(async (cep: string) => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;

    setCepLoading(true);
    setCepError('');
    setCepFound(false);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepError('CEP não encontrado');
        return;
      }
      onChange({
        ...addr,
        cep,
        street: data.logradouro || '',
        neighborhood: data.bairro || '',
        city: data.localidade || '',
        state: data.uf || '',
        number: '',
        complement: '',
      });
      setCepFound(true);
      // Focus on número after auto-fill
      setTimeout(() => numberRef.current?.focus(), 100);
    } catch {
      setCepError('Erro ao buscar CEP');
    } finally {
      setCepLoading(false);
    }
  }, [addr, onChange]);

  const handleCepChange = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    // Reset cepFound if user clears/changes CEP
    if (digits.length < 8) setCepFound(false);
    update({ cep: formatted });
    if (digits.length === 8) fetchCep(formatted);
  }, [update, fetchCep]);

  // After filling number, focus complement
  const handleNumberKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (!e.shiftKey) {
        e.preventDefault();
        complementRef.current?.focus();
      }
    }
  }, []);

  // Fields that are auto-filled and should be readonly when cepFound
  const autoFilled = cepFound && isBrazil;

  return (
    <div className="space-y-5">
      {/* Country selector */}
      <div>
        <label className={labelClass}>País</label>
        <div className="relative mt-1">
          <select
            value={addr.country}
            onChange={e => {
              setCepFound(false);
              update({ country: e.target.value, cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' });
            }}
            className="w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-xl py-2 text-foreground transition-colors appearance-none cursor-pointer"
          >
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
            ))}
          </select>
          <svg className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* CEP (Brazil only) */}
      {isBrazil && (
        <div>
          <label className={labelClass}>CEP</label>
          <div className="relative">
            <input
              value={addr.cep}
              onChange={e => handleCepChange(e.target.value)}
              placeholder="00000-000"
              className={inputClass}
              maxLength={9}
              inputMode="numeric"
            />
            {cepLoading && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          {cepError && <p className="text-xs text-destructive mt-1">{cepError}</p>}
          {cepFound && <p className="text-xs text-emerald-500 mt-1">✓ Endereço encontrado</p>}
        </div>
      )}

      {/* Street */}
      <div>
        <label className={labelClass}>{isBrazil ? 'Rua' : 'Endereço'}</label>
        <input
          value={addr.street}
          onChange={autoFilled ? undefined : e => update({ street: e.target.value })}
          readOnly={autoFilled}
          placeholder={isBrazil ? 'Rua, Avenida...' : 'Street address'}
          className={autoFilled ? readonlyClass : inputClass}
        />
      </div>

      {/* Number + Complement (always editable) */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Número</label>
          <input
            ref={numberRef}
            value={addr.number}
            onChange={e => update({ number: e.target.value })}
            onKeyDown={handleNumberKeyDown}
            placeholder="123"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Complemento</label>
          <input
            ref={complementRef}
            value={addr.complement}
            onChange={e => update({ complement: e.target.value })}
            placeholder="Apto, Sala..."
            className={inputClass}
          />
        </div>
      </div>

      {/* Neighborhood */}
      {isBrazil && (
        <div>
          <label className={labelClass}>Bairro</label>
          <input
            value={addr.neighborhood}
            onChange={autoFilled ? undefined : e => update({ neighborhood: e.target.value })}
            readOnly={autoFilled}
            placeholder="Bairro"
            className={autoFilled ? readonlyClass : inputClass}
          />
        </div>
      )}

      {/* City + State */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Cidade</label>
          <input
            value={addr.city}
            onChange={autoFilled ? undefined : e => update({ city: e.target.value })}
            readOnly={autoFilled}
            placeholder="Cidade"
            className={autoFilled ? readonlyClass : inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>{isBrazil ? 'Estado' : 'Estado / Região'}</label>
          {isBrazil ? (
            <div className="relative mt-1">
              <select
                value={addr.state}
                onChange={autoFilled ? undefined : e => update({ state: e.target.value })}
                disabled={autoFilled}
                className={`${autoFilled ? readonlyClass : inputClass} appearance-none cursor-pointer`}
              >
                <option value="">Selecione</option>
                {BR_STATES.map(uf => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
              <svg className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          ) : (
            <input
              value={addr.state}
              onChange={e => update({ state: e.target.value })}
              placeholder="Estado"
              className={inputClass}
            />
          )}
        </div>
      </div>
    </div>
  );
}
