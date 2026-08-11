const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk [\w-]+ failed|ChunkLoadError/i;

const RECOVERY_KEY = 'forms:chunk-recovery:v1';
const FORMS_CACHE_PATTERN = /^(?:forms-public-|forms-v\d+$)/;

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>;

function memoryRecoveryStorage(): RecoveryStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

export function safeRecoveryStorage(windowRef: Window, preferred?: Storage): RecoveryStorage {
  if (preferred) return preferred;
  try {
    return windowRef.sessionStorage;
  } catch {
    // Sandboxed previews intentionally use an opaque origin. Storage access
    // throws there, so use a volatile marker without weakening the sandbox.
    return memoryRecoveryStorage();
  }
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (reason && typeof reason === 'object' && 'message' in reason) {
    return String((reason as { message?: unknown }).message ?? '');
  }
  return String(reason ?? '');
}

export function isChunkLoadError(reason: unknown): boolean {
  return CHUNK_ERROR_PATTERN.test(errorMessage(reason));
}

export function runtimeBuildId(documentRef: Document = document): string {
  const entry = Array.from(documentRef.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))
    .map((script) => script.src)
    .find(Boolean);

  if (!entry) return 'unknown-entry';

  try {
    return new URL(entry, documentRef.baseURI).pathname;
  } catch {
    return entry;
  }
}

export function recoveryFingerprint(buildId: string, pathname: string): string {
  return `${buildId}|${pathname}`;
}

export function shouldAutoRecover(storage: Pick<Storage, 'getItem'>, fingerprint: string): boolean {
  try {
    return storage.getItem(RECOVERY_KEY) !== fingerprint;
  } catch {
    // Storage can be blocked in hardened/private contexts. The in-memory guard
    // in installChunkRecovery still prevents duplicate handling before reload.
    return true;
  }
}

export function markAutoRecovery(storage: Pick<Storage, 'setItem'>, fingerprint: string): void {
  try {
    storage.setItem(RECOVERY_KEY, fingerprint);
  } catch {
    // A reload is still the safest recovery when sessionStorage is unavailable.
  }
}

export async function refreshRuntimeCaches(
  cacheStorage: Pick<CacheStorage, 'keys' | 'delete'> | undefined,
  serviceWorker: Pick<ServiceWorkerContainer, 'getRegistrations'> | undefined,
): Promise<void> {
  const operations: Promise<unknown>[] = [];

  if (cacheStorage) {
    operations.push(
      cacheStorage.keys().then((keys) =>
        Promise.all(keys.filter((key) => FORMS_CACHE_PATTERN.test(key)).map((key) => cacheStorage.delete(key))),
      ),
    );
  }

  if (serviceWorker) {
    operations.push(
      serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => {
              try {
                return new URL(registration.active?.scriptURL ?? registration.installing?.scriptURL ?? '').pathname === '/sw.js';
              } catch {
                return false;
              }
            })
            .map((registration) => registration.update()),
        ),
      ),
    );
  }

  await Promise.allSettled(operations);
}

export function refreshCurrentRuntime(windowRef: Window = window): Promise<void> {
  let cacheStorage: CacheStorage | undefined;
  let serviceWorker: ServiceWorkerContainer | undefined;

  try {
    cacheStorage = windowRef.caches;
  } catch {
    cacheStorage = undefined;
  }
  try {
    serviceWorker = windowRef.navigator.serviceWorker;
  } catch {
    serviceWorker = undefined;
  }

  return refreshRuntimeCaches(cacheStorage, serviceWorker);
}

interface ChunkRecoveryOptions {
  windowRef?: Window;
  documentRef?: Document;
  storage?: Storage;
  reload?: () => void;
}

/**
 * Installs recovery before React mounts so even the first lazy route is covered.
 * Each deployed entry/path gets at most one automatic reload per tab session.
 */
export function installChunkRecovery(options: ChunkRecoveryOptions = {}): () => void {
  const windowRef = options.windowRef ?? window;
  const documentRef = options.documentRef ?? document;
  const storage = safeRecoveryStorage(windowRef, options.storage);
  const reload = options.reload ?? (() => windowRef.location.reload());
  const fingerprint = recoveryFingerprint(runtimeBuildId(documentRef), windowRef.location.pathname);
  let recovering = false;

  const recover = (reason: unknown, event: Event, knownPreloadFailure = false): void => {
    if (!knownPreloadFailure && !isChunkLoadError(reason)) return;

    if (recovering) {
      event.preventDefault();
      return;
    }

    if (!shouldAutoRecover(storage, fingerprint)) {
      // Let React's ErrorBoundary render the manual recovery UI. Keeping the
      // marker prevents an automatic reload loop if the deployment is broken.
      return;
    }

    recovering = true;
    markAutoRecovery(storage, fingerprint);
    event.preventDefault();

    void refreshCurrentRuntime(windowRef)
      .finally(reload);
  };

  const onPreloadError = (event: Event) => {
    // Vite only dispatches this event for a failed dynamic-import dependency;
    // browser wording can be a generic "Failed to fetch".
    recover((event as Event & { payload?: unknown }).payload, event, true);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    recover(event.reason, event);
  };

  windowRef.addEventListener('vite:preloadError', onPreloadError);
  windowRef.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    windowRef.removeEventListener('vite:preloadError', onPreloadError);
    windowRef.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
