import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!value || !value.includes('@')) return [];
    const [username, partialDomain] = value.split('@');
    if (!username || !partialDomain) return [];
    if (DOMAINS.includes(partialDomain)) return [];
    return DOMAINS
      .filter(d => d.startsWith(partialDomain.toLowerCase()))
      .slice(0, 5);
  }, [value]);

  useEffect(() => { setActiveIndex(0); }, [suggestions.length]);

  // Detect if there's enough space below, otherwise open upward
  useEffect(() => {
    if (suggestions.length === 0 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < 200);
  }, [suggestions.length]);

  const username = value?.split('@')[0] || '';

  const selectCurrent = useCallback(() => {
    if (suggestions.length > 0) {
      onSelect(`${username}@${suggestions[activeIndex]}`);
    }
  }, [suggestions, activeIndex, username, onSelect]);

  useEffect(() => {
    if (suggestions.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => (i + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => (i - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        selectCurrent();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [suggestions, selectCurrent]);

  if (suggestions.length === 0) return null;

  return (
    <div ref={containerRef} className="relative" style={{ height: 0 }}>
      <AnimatePresence>
        <motion.ul
          initial={{ opacity: 0, y: openUp ? 4 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: openUp ? 4 : -4 }}
          transition={{ duration: 0.15 }}
          className={`absolute left-0 right-0 z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden ${
            openUp ? 'bottom-1' : 'top-1'
          }`}
          role="listbox"
        >
          {suggestions.map((domain, i) => (
            <motion.li
              key={domain}
              role="option"
              aria-selected={i === activeIndex}
              onClick={() => onSelect(`${username}@${domain}`)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                i === activeIndex
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <span className="text-foreground font-medium">{username}@</span>
              <span>{domain}</span>
              {i === activeIndex && (
                <span className="ml-auto text-xs text-muted-foreground/60 hidden md:inline">
                  Tab ↵
                </span>
              )}
            </motion.li>
          ))}
        </motion.ul>
      </AnimatePresence>
    </div>
  );
}
