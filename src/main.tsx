import { createRoot } from "react-dom/client";
import { autoDetectAndPrefetch } from "./lib/formPrefetch";
import { validateEnv } from "./lib/env";
import { installChunkRecovery } from "./lib/chunkRecovery";
import { configurePublicServiceWorker } from "./lib/publicServiceWorker";
import App from "./App.tsx";
import "./index.css";

// Must run before React mounts: the first lazy route can fail before idle work.
installChunkRecovery();

// Bootstrapping defensivo para evitar tela branca em produção
try {
  // Fail fast if env is misconfigured
  validateEnv();

  // Start fetching form data BEFORE React mounts (runs in parallel with chunk loading)
  autoDetectAndPrefetch();

  // Defer non-critical setup to after first paint to reduce TBT on mobile
  const deferSetup = () => {
    void configurePublicServiceWorker();
  };

  // Use requestIdleCallback where available, otherwise setTimeout
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(deferSetup, { timeout: 2000 });
  } else {
    setTimeout(deferSetup, 50);
  }
} catch (error) {
  console.error('[bootstrap]', error);
}

try {
  createRoot(document.getElementById("root")!).render(<App />); // v2
} catch (error) {
  console.error('[render]', error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif;color:#444">Falha ao carregar a aplicação. Recarregue a página.</div>';
  }
}
