import { useState, useCallback } from 'react';

interface Props {
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str.startsWith('http') ? str : `https://${str}`);
    return url.hostname.includes('.');
  } catch {
    return false;
  }
}

export default function WebsiteFieldPreview({ value, onChange, placeholder }: Props) {
  const [focused, setFocused] = useState(false);
  const raw = value || '';

  const handleBlur = useCallback(() => {
    setFocused(false);
    // Auto-add https:// if user typed a valid-looking domain
    if (raw && !raw.startsWith('http://') && !raw.startsWith('https://')) {
      if (isValidUrl(raw)) {
        onChange(`https://${raw}`);
      }
    }
  }, [raw, onChange]);

  const valid = !raw || isValidUrl(raw);

  return (
    <div>
      <div className="flex items-center gap-0">
        {/* Protocol badge */}
        <span className="text-lg text-muted-foreground/50 select-none pr-1">
          {raw.startsWith('http://') ? 'http://' : 'https://'}
        </span>
        <input
          type="url"
          value={raw.replace(/^https?:\/\//, '')}
          onChange={e => {
            const v = e.target.value;
            // If user pastes a full URL, keep it
            if (v.startsWith('http://') || v.startsWith('https://')) {
              onChange(v);
            } else {
              onChange(v ? `https://${v}` : '');
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder={placeholder || 'www.exemplo.com'}
          autoFocus
          className={`flex-1 bg-transparent border-0 border-b-2 outline-none text-2xl py-3 text-foreground placeholder:text-muted-foreground/40 transition-colors ${
            !valid ? 'border-destructive' : focused ? 'border-primary' : 'border-border'
          }`}
        />
      </div>
      {!valid && raw.length > 3 && (
        <p className="text-xs text-destructive mt-2 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
          URL inválida. Exemplo: www.exemplo.com.br
        </p>
      )}
    </div>
  );
}

