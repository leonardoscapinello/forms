import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { FormStoreProvider } from "@/hooks/useFormStore";
import { Loader2 } from "lucide-react";
import FormPreview from "./pages/FormPreview";

// Lazy-loaded pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const FormEditor = lazy(() => import("./pages/FormEditor"));
const Settings = lazy(() => import("./pages/Settings"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AppLayout = lazy(() => import("./components/AppLayout"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: 1,
      networkMode: "offlineFirst",
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
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
  return <Navigate to={id ? `/f/${id}` : "/"} replace />;
}

const App = () => {
  const isPublicFormPath = typeof window !== "undefined" && /^\/f\//.test(window.location.pathname);

  // Public form route: no heavy providers, no extra suspense loaders
  if (isPublicFormPath) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/f/:id" element={<FormPreview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
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
                  <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
                  <Route path="/gallery" element={<ProtectedRoute><AppLayout><Gallery /></AppLayout></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
                  <Route path="/editor/:id" element={<ProtectedRoute><FormEditor /></ProtectedRoute>} />
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
    </QueryClientProvider>
  );
};

export default App;
