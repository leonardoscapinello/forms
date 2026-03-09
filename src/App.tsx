import { lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

/** Catches render errors so the user sees a message instead of a blank screen */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Algo deu errado</p>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>{this.state.error.message}</p>
            <button onClick={() => window.location.reload()} style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}>
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

/** CSS-only spinner — no lucide / icon library on the critical path */
function FormSkeleton() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'hsl(var(--background, 60 20% 99%))',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 28,
          height: 28,
          border: '3px solid hsl(var(--foreground, 48 32% 13%) / 0.1)',
          borderTopColor: 'hsl(var(--foreground, 48 32% 13%) / 0.6)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto',
        }} />
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const App = () => {
  const isPublicFormPath = typeof window !== "undefined" && /^\/f\//.test(window.location.pathname);

  // Public form route: only loads React Router + FormPreview chunk
  // No AuthProvider, FormStoreProvider, Toasters, lucide, radix-ui, etc.
  if (isPublicFormPath) {
    return (
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense fallback={<FormSkeleton />}>
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
