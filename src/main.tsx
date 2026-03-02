import { createRoot } from "react-dom/client";
import { autoDetectAndPrefetch } from "./lib/formPrefetch";
import { validateEnv } from "./lib/env";
import { initSecurityGuard } from "./lib/securityGuard";
import App from "./App.tsx";
import "./index.css";

// Fail fast if env is misconfigured
validateEnv();

// Production security hardening — skip on public form routes (saves CPU from setInterval)
if (!/^\/f\//.test(window.location.pathname)) {
  initSecurityGuard();
}

// Start fetching form data BEFORE React mounts (runs in parallel with chunk loading)
autoDetectAndPrefetch();

// Self-heal for sporadic Vite lazy chunk failures (cache/version skew/network)
if (typeof window !== 'undefined') {
  const guardFlag = '__dynamic_import_recovery_attached__';
  if (!(window as any)[guardFlag]) {
    (window as any)[guardFlag] = true;
    window.addEventListener('unhandledrejection', (event) => {
      const message =
        typeof event.reason?.message === 'string'
          ? event.reason.message
          : String(event.reason ?? '');

      const isDynamicImportError =
        /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
          message
        );

      if (!isDynamicImportError) return;

      event.preventDefault();
      const retryKey = '__dynamic_import_retry_once__';

      if (!sessionStorage.getItem(retryKey)) {
        sessionStorage.setItem(retryKey, '1');
        window.location.reload();
        return;
      }

      sessionStorage.removeItem(retryKey);
    });
  }
}

// Register Service Worker ONLY on production public routes (/f/:id)
if ('serviceWorker' in navigator) {
  const isPublicForm = /^\/f\//.test(window.location.pathname);
  const shouldUseServiceWorker = import.meta.env.PROD && isPublicForm;

  if (shouldUseServiceWorker) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    // Ensure preview/admin routes never keep stale SW/cache artifacts
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => reg.unregister());
    });

    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
  }
}

createRoot(document.getElementById("root")!).render(<App />); // v2