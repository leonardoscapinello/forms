import { useState, useCallback } from 'react';
import { ALL_COMPANY_FIELDS, CompanyFieldKey, COMPANY_FIELD_LABELS } from '@/types/pageElements';

export interface CompanyValue {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  natureza_juridica: string;
  porte: string;
  abertura: string;
  situacao: string;
  cnae_principal: string;
  cnae_descricao: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
}

const EMPTY_COMPANY: CompanyValue = {
  cnpj: '', razao_social: '', nome_fantasia: '', natureza_juridica: '',
  porte: '', abertura: '', situacao: '', cnae_principal: '', cnae_descricao: '',
  logradouro: '', numero: '', complemento: '', bairro: '',
  municipio: '', uf: '', cep: '', telefone: '', email: '',
};

function formatCNPJ(digits: string): string {
  const d = digits.slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

interface Props {
  value: CompanyValue | undefined;
  onChange: (value: CompanyValue) => void;
  visibleFields?: CompanyFieldKey[];
  editableFields?: CompanyFieldKey[];
}

const inputClass = "w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-lg py-2 mt-1 text-foreground placeholder:text-muted-foreground/40 transition-colors";
const readonlyClass = "w-full bg-muted/30 border-0 border-b-2 border-border/50 outline-none text-lg py-2 mt-1 text-foreground/80 transition-colors cursor-default";
const labelClass = "text-sm font-medium text-muted-foreground uppercase tracking-wider";

export default function CompanyFieldPreview({ value, onChange, visibleFields, editableFields = [] }: Props) {
  const company = value && typeof value === 'object' && 'cnpj' in value ? value : EMPTY_COMPANY;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState(false);

  const visible = visibleFields || ALL_COMPANY_FIELDS;
  const isVisible = (key: CompanyFieldKey) => visible.includes(key);
  const isEditable = (key: CompanyFieldKey) => editableFields.includes(key);

  const fetchCNPJ = useCallback(async (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return;

    setLoading(true);
    setError('');
    setFound(false);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
      if (!res.ok) {
        setError('CNPJ não encontrado');
        return;
      }
      const data = await res.json();

      const cnaePrincipal = data.cnae_fiscal ? `${data.cnae_fiscal}` : '';
      const cnaeDesc = data.cnae_fiscal_descricao || '';

      onChange({
        ...company,
        cnpj,
        razao_social: data.razao_social || '',
        nome_fantasia: data.nome_fantasia || '',
        natureza_juridica: data.natureza_juridica || '',
        porte: data.porte || data.descricao_porte || '',
        abertura: data.data_inicio_atividade || '',
        situacao: data.descricao_situacao_cadastral || '',
        cnae_principal: cnaePrincipal,
        cnae_descricao: cnaeDesc,
        logradouro: data.logradouro || '',
        numero: data.numero || '',
        complemento: data.complemento || '',
        bairro: data.bairro || '',
        municipio: data.municipio || '',
        uf: data.uf || '',
        cep: data.cep || '',
        telefone: data.ddd_telefone_1 || '',
        email: data.email || '',
      });
      setFound(true);
    } catch {
      setError('Erro ao buscar CNPJ');
    } finally {
      setLoading(false);
    }
  }, [company, onChange]);

  const handleCnpjChange = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 14);
    const formatted = formatCNPJ(digits);
    onChange({ ...company, cnpj: formatted });
    if (digits.length === 14) fetchCNPJ(formatted);
  }, [company, onChange, fetchCNPJ]);

  const handleFieldChange = (key: CompanyFieldKey, val: string) => {
    onChange({ ...company, [key]: val });
  };

  const hasData = found || company.razao_social;

  /** Render a single field row */
  const renderField = (key: CompanyFieldKey, displayValue?: string) => {
    if (!isVisible(key)) return null;
    const val = displayValue ?? (company as any)[key];
    if (!val && !isEditable(key)) return null;

    const editable = isEditable(key);
    return (
      <div key={key}>
        <label className={labelClass}>{COMPANY_FIELD_LABELS[key]}</label>
        <input
          value={val || ''}
          readOnly={!editable}
          onChange={editable ? e => handleFieldChange(key, e.target.value) : undefined}
          placeholder={editable ? `Digite ${COMPANY_FIELD_LABELS[key].toLowerCase()}...` : undefined}
          className={editable ? inputClass : readonlyClass}
        />
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* CNPJ input */}
      <div>
        <label className={labelClass}>CNPJ</label>
        <div className="relative">
          <input
            value={company.cnpj}
            onChange={e => handleCnpjChange(e.target.value)}
            placeholder="00.000.000/0000-00"
            className={inputClass}
            maxLength={18}
            inputMode="numeric"
          />
          {loading && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        {found && <p className="text-xs text-emerald-500 mt-1">✓ Empresa encontrada</p>}
      </div>

      {/* Company data fields */}
      {hasData && (
        <>
          {renderField('razao_social')}
          {renderField('nome_fantasia')}

          {/* Situação badge (special rendering) */}
          {isVisible('situacao') && company.situacao && (
            <div>
              <label className={labelClass}>Situação</label>
              <div className="mt-1">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  company.situacao.toLowerCase().includes('ativa')
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {company.situacao}
                </span>
              </div>
            </div>
          )}

          {renderField('porte')}
          {renderField('natureza_juridica')}

          {/* CNAE (combined display) */}
          {isVisible('cnae_principal') && company.cnae_principal && (
            <div>
              <label className={labelClass}>CNAE Principal</label>
              <input
                value={`${company.cnae_principal}${company.cnae_descricao ? ` - ${company.cnae_descricao}` : ''}`}
                readOnly={!isEditable('cnae_principal')}
                onChange={isEditable('cnae_principal') ? e => handleFieldChange('cnae_principal', e.target.value) : undefined}
                className={isEditable('cnae_principal') ? inputClass : readonlyClass}
              />
            </div>
          )}

          {renderField('abertura')}

          {/* Address fields */}
          {renderField('logradouro')}
          <div className="grid grid-cols-2 gap-4">
            {renderField('numero')}
            {renderField('complemento')}
          </div>
          {renderField('bairro')}
          <div className="grid grid-cols-2 gap-4">
            {renderField('municipio')}
            {renderField('uf')}
          </div>
          {renderField('cep')}

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            {renderField('telefone')}
            {renderField('email')}
          </div>
        </>
      )}
    </div>
  );
}
