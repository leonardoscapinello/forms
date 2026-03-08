import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Tracks navigator.onLine and fires toasts on transitions.
 * Returns current online status.
 */
export function useNetworkStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const prevRef = useRef(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      if (!prevRef.current) {
        toast.success('Conexão reestabelecida', { duration: 3000 });
      }
      prevRef.current = true;
    };

    const handleOffline = () => {
      setOnline(false);
      if (prevRef.current) {
        toast.warning('Sem conexão com a internet. Tentando novamente…', {
          duration: Infinity,
          id: 'offline-toast',
        });
      }
      prevRef.current = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
