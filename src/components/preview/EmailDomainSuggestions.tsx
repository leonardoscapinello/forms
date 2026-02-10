import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const DOMAINS = [
  'gmail.com',
  'outlook.com',
  'outlook.com.br',
  'hotmail.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'live.com',
  'uol.com.br',
  'bol.com.br',
  'terra.com.br',
  'globo.com',
  'protonmail.com',
];

interface EmailDomainSuggestionsProps {
  value: string;
  onSelect: (fullEmail: string) => void;
}

export default function EmailDomainSuggestions({ value, onSelect }: EmailDomainSuggestionsProps) {
  const suggestions = useMemo(() => {
    if (!value || !value.includes('@')) return [];
    const [username, partialDomain] = value.split('@');
    if (!username || !partialDomain) return [];
    // Don't show if domain already looks complete and matches exactly
    if (DOMAINS.includes(partialDomain)) return [];

    return DOMAINS
      .filter(d => d.startsWith(partialDomain.toLowerCase()))
      .slice(0, 4);
  }, [value]);

  if (suggestions.length === 0) return null;

  const username = value.split('@')[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        className="flex flex-wrap gap-1.5 mt-2"
      >
        {suggestions.map(domain => (
          <motion.button
            key={domain}
            type="button"
            onClick={() => onSelect(`${username}@${domain}`)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="px-2.5 py-1 rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            @{domain}
          </motion.button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
