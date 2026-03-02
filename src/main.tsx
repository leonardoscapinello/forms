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

// Register Service Worker ONLY for public form routes — admin must never be cached
if ('serviceWorker' in navigator) {
  const isPublicForm = /^\/f\//.test(window.location.pathname);
  if (isPublicForm) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    // Unregister any existing SW for admin users to prevent stale cache
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => reg.unregister());
    });
    // Clear any existing caches
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
  }
}

createRoot(document.getElementById("root")!).render(<App />); // v2