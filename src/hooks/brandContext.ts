import { createContext, useContext } from 'react';
import type { BrandSettings } from '@/lib/brand';

export type BrandContextValue = {
  brand: BrandSettings;
  loading: boolean;
  saveBrand: (next: BrandSettings) => Promise<BrandSettings>;
  refreshBrand: () => Promise<void>;
};

export const BrandContext = createContext<BrandContextValue | null>(null);

export function useBrand(): BrandContextValue {
  const context = useContext(BrandContext);
  if (!context) throw new Error('useBrand must be used inside BrandProvider');
  return context;
}
