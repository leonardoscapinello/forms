import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';

/**
 * A controlled input that keeps local state while typing
 * and only propagates via onBlur or Enter — prevents cursor jumping
 * inside React Flow nodes.
 */
export function LocalInput({
  value,
  onCommit,
  ...rest
}: Omit<React.ComponentProps<typeof Input>, 'onChange' | 'onBlur'> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const ref = useRef(value);

  // Sync external value only when component is not focused
  useEffect(() => {
    if (ref.current !== value) {
      ref.current = value;
      setLocal(value);
    }
  }, [value]);

  return (
    <Input
      {...rest}
      value={local}
      onChange={e => {
        setLocal(e.target.value);
        ref.current = e.target.value;
      }}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
        // Prevent React Flow keyboard shortcuts from firing while typing
        e.stopPropagation();
      }}
    />
  );
}
