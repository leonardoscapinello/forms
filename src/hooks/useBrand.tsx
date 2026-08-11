import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { BRAND, normalizeBrandSettings, type BrandSettings } from '@/lib/brand';
import { BrandContext, type BrandContextValue } from './brandContext';

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandSettings>(BRAND);
  const [loading, setLoading] = useState(true);

  const refreshBrand = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'brand')
        .maybeSingle();
      if (error) throw error;
      if (data?.value) setBrand(normalizeBrandSettings(data.value));
    } catch (error) {
      // The compiled personal identity remains a safe fallback during the
      // migration/deploy window or a transient network outage.
      console.warn('[brand] using local fallback', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshBrand(); }, [refreshBrand]);

  const saveBrand = useCallback(async (next: BrandSettings) => {
    const normalized = normalizeBrandSettings(next);
    const { data, error } = await supabase
      .from('app_settings')
      .upsert({ key: 'brand', value: normalized as unknown as Json }, { onConflict: 'key' })
      .select('value')
      .single();
    if (error) throw error;
    const saved = normalizeBrandSettings(data.value);
    setBrand(saved);
    return saved;
  }, []);

  const value = useMemo<BrandContextValue>(() => ({
    brand,
    loading,
    saveBrand,
    refreshBrand,
  }), [brand, loading, refreshBrand, saveBrand]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}
