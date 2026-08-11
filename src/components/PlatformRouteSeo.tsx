import { useContext, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BrandContext } from '@/hooks/brandContext';
import { BRAND } from '@/lib/brand';
import { applyPlatformRouteSeo, resolvePlatformRouteSeo } from '@/lib/platformSeo';

/** Keeps every SPA route's browser metadata synchronized with the URL and brand. */
export default function PlatformRouteSeo() {
  const { pathname } = useLocation();
  // The compiled identity is also a safe fallback for the earliest render and
  // for isolated route tests where the async provider is intentionally mocked.
  const brand = useContext(BrandContext)?.brand || BRAND;

  useLayoutEffect(() => {
    const seo = resolvePlatformRouteSeo(pathname, brand);
    if (seo) applyPlatformRouteSeo(document, seo);
  }, [brand, pathname]);

  return null;
}
