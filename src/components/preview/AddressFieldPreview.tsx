import { useState, useCallback, useEffect } from 'react';

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

interface Props {
  value: AddressValue | undefined;
  onChange: (value: AddressValue) => void;
}

const inputClass = "w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-xl py-2 mt-1 text-foreground placeholder:text-muted-foreground/40 transition-colors";
const labelClass = "text-sm font-medium text-muted-foreground uppercase tracking-wider";

export default function AddressFieldPreview({ value, onChange }: Props) {
  const addr = value && typeof value === 'object' && 'country' in value ? value : EMPTY_ADDRESS;
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');

  const selectedCountry = COUNTRIES.find(c => c.code === addr.country) || COUNTRIES[0];
  const isBrazil = addr.country === 'BR';

  const update = useCallback((patch: Partial<AddressValue>) => {
    onChange({ ...addr, ...patch });
  }, [addr, onChange]);

  // Auto-fill from ViaCEP
  const fetchCep = useCallback(async (cep: string) => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;

    setCepLoading(true);
    setCepError('');
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
        street: data.logradouro || addr.street,
        neighborhood: data.bairro || addr.neighborhood,
        city: data.localidade || addr.city,
        state: data.uf || addr.state,
      });
    } catch {
      setCepError('Erro ao buscar CEP');
    } finally {
      setCepLoading(false);
    }
  }, [addr, onChange]);

  // Format CEP as user types
  const handleCepChange = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    update({ cep: formatted });
    if (digits.length === 8) fetchCep(formatted);
  }, [update, fetchCep]);

  return (
    <div className="space-y-5">
      {/* Country selector */}
      <div>
        <label className={labelClass}>País</label>
        <div className="relative mt-1">
          <select
            value={addr.country}
            onChange={e => update({ country: e.target.value, cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' })}
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
            />
            {cepLoading && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          {cepError && <p className="text-xs text-destructive mt-1">{cepError}</p>}
        </div>
      )}

      {/* Street */}
      <div>
        <label className={labelClass}>{isBrazil ? 'Rua' : 'Endereço'}</label>
        <input value={addr.street} onChange={e => update({ street: e.target.value })} placeholder={isBrazil ? 'Rua, Avenida...' : 'Street address'} className={inputClass} />
      </div>

      {/* Number + Complement */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Número</label>
          <input value={addr.number} onChange={e => update({ number: e.target.value })} placeholder="123" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Complemento</label>
          <input value={addr.complement} onChange={e => update({ complement: e.target.value })} placeholder="Apto, Sala..." className={inputClass} />
        </div>
      </div>

      {/* Neighborhood */}
      {isBrazil && (
        <div>
          <label className={labelClass}>Bairro</label>
          <input value={addr.neighborhood} onChange={e => update({ neighborhood: e.target.value })} placeholder="Bairro" className={inputClass} />
        </div>
      )}

      {/* City + State */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Cidade</label>
          <input value={addr.city} onChange={e => update({ city: e.target.value })} placeholder="Cidade" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{isBrazil ? 'Estado' : 'Estado / Região'}</label>
          <input value={addr.state} onChange={e => update({ state: e.target.value })} placeholder={isBrazil ? 'UF' : 'Estado'} className={inputClass} />
        </div>
      </div>
    </div>
  );
}
