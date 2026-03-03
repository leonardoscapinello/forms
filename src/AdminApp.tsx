import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { FormStoreProvider } from "@/hooks/useFormStore";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages
const FormPreview = lazy(() => import("./pages/FormPreview"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AnalyticsDashboard = lazy(() => import("./pages/AnalyticsDashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AppLayout = lazy(() => import("./components/AppLayout"));

// Editor (layout + sub-routes)
const EditorLayout = lazy(() => import("./pages/editor/EditorLayout"));
const EditorWorkflow = lazy(() => import("./pages/editor/EditorWorkflow"));
const EditorPages = lazy(() => import("./pages/editor/EditorPages"));
const EditorDesign = lazy(() => import("./pages/editor/EditorDesign"));
const EditorResponses = lazy(() => import("./pages/editor/EditorResponses"));
const EditorShare = lazy(() => import("./pages/editor/EditorShare"));
const EditorAnalytics = lazy(() => import("./pages/editor/EditorAnalytics"));
const EditorSettingsPage = lazy(() => import("./pages/editor/EditorSettingsPage"));
const EditorSEO = lazy(() => import("./pages/editor/EditorSEO"));

function PageLoader() {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background px-6">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      {isSlow && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-sm text-primary underline underline-offset-4"
        >
          Demorou para carregar — recarregar
        </button>
      )}
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function LegacyPreviewRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/f/${id}?editorPreview=1` : "/"} replace />;
}

export default function AdminApp() {
  return (
    <AuthProvider>
      <FormStoreProvider>
        <TooltipProvider delayDuration={300}>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><AppLayout><AnalyticsDashboard /></AppLayout></ProtectedRoute>} />
                <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
                <Route path="/gallery" element={<ProtectedRoute><AppLayout><Gallery /></AppLayout></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />

                {/* Editor with nested routes */}
                <Route path="/editor/:id" element={<ProtectedRoute><EditorLayout /></ProtectedRoute>}>
                  <Route index element={<Navigate to="pages" replace />} />
                  <Route path="pages" element={<EditorPages />} />
                  <Route path="workflow" element={<EditorWorkflow />} />
                  <Route path="design" element={<EditorDesign />} />
                  <Route path="responses" element={<EditorResponses />} />
                  <Route path="share" element={<EditorShare />} />
                  <Route path="analytics" element={<EditorAnalytics />} />
                  <Route path="settings" element={<EditorSettingsPage />} />
                  <Route path="seo" element={<EditorSEO />} />
                </Route>

                <Route path="/f/:id" element={<FormPreview />} />
                <Route path="/preview/:id" element={<LegacyPreviewRedirect />} />
                <Route path="/forms/:id" element={<LegacyPreviewRedirect />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </FormStoreProvider>
    </AuthProvider>
  );
}
