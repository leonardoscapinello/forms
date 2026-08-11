import { describe, expect, it, vi } from 'vitest';
import {
  installChunkRecovery,
  isChunkLoadError,
  markAutoRecovery,
  recoveryFingerprint,
  runtimeBuildId,
  safeRecoveryStorage,
  shouldAutoRecover,
} from './chunkRecovery';

describe('chunkRecovery', () => {
  it('recognizes browser and bundler dynamic-import failures only', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/Page-abc.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/Editor-abc.css'))).toBe(true);
    expect(isChunkLoadError(new Error('ChunkLoadError: Loading chunk editor failed'))).toBe(true);
    expect(isChunkLoadError(new Error('API request failed'))).toBe(false);
  });

  it('ties the one-shot marker to the deployed entry and current path', () => {
    document.head.innerHTML = '<script type="module" src="/assets/index-release123.js"></script>';
    const fingerprint = recoveryFingerprint(runtimeBuildId(document), '/dashboard');
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    expect(fingerprint).toContain('/assets/index-release123.js|/dashboard');
    expect(shouldAutoRecover(adapter, fingerprint)).toBe(true);
    markAutoRecovery(adapter, fingerprint);
    expect(shouldAutoRecover(adapter, fingerprint)).toBe(false);
    expect(shouldAutoRecover(adapter, `${fingerprint}-new-release`)).toBe(true);
  });

  it('automatically reloads only once for the same entry and route', async () => {
    document.head.innerHTML = '<script type="module" src="/assets/index-stable.js"></script>';
    window.history.replaceState(null, '', '/dashboard');
    const reload = vi.fn();
    const storage = window.sessionStorage;
    storage.clear();

    const dispose = installChunkRecovery({ reload, storage });
    const first = new Event('unhandledrejection', { cancelable: true });
    Object.defineProperty(first, 'reason', {
      value: new TypeError('Failed to fetch dynamically imported module: /assets/Dashboard-old.js'),
    });
    window.dispatchEvent(first);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    dispose();

    const secondReload = vi.fn();
    const disposeSecond = installChunkRecovery({ reload: secondReload, storage });
    const second = new Event('unhandledrejection', { cancelable: true });
    Object.defineProperty(second, 'reason', {
      value: new TypeError('Failed to fetch dynamically imported module: /assets/Dashboard-old.js'),
    });
    window.dispatchEvent(second);
    await Promise.resolve();

    expect(secondReload).not.toHaveBeenCalled();
    disposeSecond();
  });

  it('boots with volatile storage when an opaque sandbox blocks sessionStorage', () => {
    const opaqueWindow = {
      get sessionStorage() {
        throw new DOMException('Blocked for opaque origins', 'SecurityError');
      },
    } as unknown as Window;
    const storage = safeRecoveryStorage(opaqueWindow);

    expect(storage.getItem('probe')).toBeNull();
    storage.setItem('probe', 'ok');
    expect(storage.getItem('probe')).toBe('ok');
  });

  it('recovers every Vite preload failure even when the browser message is generic', async () => {
    document.head.innerHTML = '<script type="module" src="/assets/index-preload.js"></script>';
    window.history.replaceState(null, '', '/editor/form-123/pages');
    window.sessionStorage.clear();
    const reload = vi.fn();
    const dispose = installChunkRecovery({ reload });
    const event = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: unknown };
    event.payload = new TypeError('Failed to fetch');

    window.dispatchEvent(event);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(event.defaultPrevented).toBe(true);
    dispose();
  });
});
