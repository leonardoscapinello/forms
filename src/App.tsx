import { lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DEFAULT_FONT_STACK } from '@/lib/fontUtils';
import { appErrorMessage } from '@/lib/appErrorMessage';
import { refreshCurrentRuntime } from '@/lib/chunkRecovery';
import { FormChunkFallback } from '@/components/preview/FormBootLoader';

/** Catches render errors so the user sees a message instead of a blank screen */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    document.getElementById('form-ssr-shell')?.remove();
  }
  render() {
    if (this.state.error) {
      const displayMessage = appErrorMessage(this.state.error);
      const reload = () => {
        void refreshCurrentRuntime()
          .finally(() => window.location.reload());
      };
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DEFAULT_FONT_STACK, padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Algo deu errado</p>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>{displayMessage}</p>
            <button onClick={reload} style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}>
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Public form route: ultra-lean, zero admin dependencies ─────────────────
const FormPreview = lazy(() => import("./pages/FormPreview"));

// ─── Admin app: lazy-loaded with all admin deps (Auth, Store, Toasters…) ────
const AdminApp = lazy(() => import("./AdminApp"));

/** Administrative fallback stays neutral; public links always use the branded boot loader. */
function FormSkeleton() {
  return <div className="min-h-screen bg-background" />;
}


const App = () => {
  const isPublicFormPath = typeof window !== "undefined" && /^\/f\//.test(window.location.pathname);

  // Public form route: only loads React Router + FormPreview chunk
  // No AuthProvider, FormStoreProvider, Toasters, lucide, radix-ui, etc.
  if (isPublicFormPath) {
    return (
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense fallback={<FormChunkFallback />}>
            <Routes>
              <Route path="/f/:id" element={<FormPreview />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    );
  }

  // Admin routes: everything lazy-loaded together
  return (
    <ErrorBoundary>
      <Suspense fallback={<FormSkeleton />}>
        <AdminApp />
      </Suspense>
    </ErrorBoundary>
  );
};

export default App;
