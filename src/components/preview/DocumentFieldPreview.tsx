import { useState, useCallback } from 'react';

export type DocumentType = 'cpf' | 'cnpj' | 'passport';

export interface DocumentValue {
  documentType: DocumentType;
  value: string;
}

const EMPTY_DOC: DocumentValue = { documentType: 'cpf', value: '' };

const DOC_LABELS: Record<DocumentType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  passport: 'Passaporte',
};

const DOC_PLACEHOLDERS: Record<DocumentType, string> = {
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
  passport: 'AB123456',
};

function formatCPF(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCNPJ(digits: string): string {
  const d = digits.slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (parseInt(digits[9]) !== check) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return parseInt(digits[10]) === check;
}

function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weights1[i];
  let check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (parseInt(digits[12]) !== check) return false;
  
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weights2[i];
  check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return parseInt(digits[13]) === check;
}

interface Props {
  value: DocumentValue | undefined;
  onChange: (value: DocumentValue) => void;
  allowedTypes?: DocumentType[];
}

const inputClass = "w-full bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-xl py-2 mt-1 text-foreground placeholder:text-muted-foreground/40 transition-colors";
const labelClass = "text-sm font-medium text-muted-foreground uppercase tracking-wider";

export default function DocumentFieldPreview({ value, onChange, allowedTypes }: Props) {
  const doc = value && typeof value === 'object' && 'documentType' in value ? value : EMPTY_DOC;
  const types = allowedTypes && allowedTypes.length > 0 ? allowedTypes : (['cpf', 'cnpj', 'passport'] as DocumentType[]);
  
  const [touched, setTouched] = useState(false);
  
  const isValid = useCallback((val: string, type: DocumentType): boolean => {
    if (!val) return true; // empty is not invalid, just incomplete
    const clean = val.replace(/\D/g, '');
    if (type === 'cpf') return clean.length === 11 && validateCPF(val);
    if (type === 'cnpj') return clean.length === 14 && validateCNPJ(val);
    return val.length >= 5; // passport basic check
  }, []);

  const handleValueChange = useCallback((raw: string) => {
    let formatted = raw;
    if (doc.documentType === 'cpf') {
      formatted = formatCPF(raw.replace(/\D/g, ''));
    } else if (doc.documentType === 'cnpj') {
      formatted = formatCNPJ(raw.replace(/\D/g, ''));
    } else {
      formatted = raw.toUpperCase().slice(0, 20);
    }
    onChange({ ...doc, value: formatted });
  }, [doc, onChange]);

  const handleTypeChange = useCallback((type: DocumentType) => {
    onChange({ documentType: type, value: '' });
    setTouched(false);
  }, [onChange]);

  const showError = touched && doc.value && !isValid(doc.value, doc.documentType);
  const cleanDigits = doc.value.replace(/\D/g, '');
  const isComplete = doc.documentType === 'cpf' ? cleanDigits.length === 11 
    : doc.documentType === 'cnpj' ? cleanDigits.length === 14 
    : doc.value.length >= 5;

  return (
    <div className="space-y-4">
      {/* Document type selector */}
      {types.length > 1 && (
        <div>
          <label className={labelClass}>Tipo de documento</label>
          <div className="flex gap-2 mt-2">
            {types.map(type => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  doc.documentType === type
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {DOC_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Document number input */}
      <div>
        <label className={labelClass}>{DOC_LABELS[doc.documentType]}</label>
        <input
          value={doc.value}
          onChange={e => handleValueChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={DOC_PLACEHOLDERS[doc.documentType]}
          className={`${inputClass} ${showError ? '!border-destructive' : ''}`}
          maxLength={doc.documentType === 'cpf' ? 14 : doc.documentType === 'cnpj' ? 18 : 20}
          inputMode={doc.documentType === 'passport' ? 'text' : 'numeric'}
        />
        {showError && isComplete && (
          <p className="text-xs text-destructive mt-1">
            {doc.documentType === 'cpf' ? 'CPF inválido' : doc.documentType === 'cnpj' ? 'CNPJ inválido' : 'Documento inválido'}
          </p>
        )}
        {touched && doc.value && isComplete && isValid(doc.value, doc.documentType) && (
          <p className="text-xs text-emerald-500 mt-1">✓ Documento válido</p>
        )}
      </div>
    </div>
  );
}
