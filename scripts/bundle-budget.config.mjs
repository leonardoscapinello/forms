const kib = (value) => value * 1024;

export const bundleBudgets = {
  bootstrap: {
    label: 'Bootstrap compartilhado',
    entries: ['index.html'],
    maxGzipBytes: kib(180),
    maxBrotliBytes: kib(160),
    maxFiles: 10,
  },
  publicCritical: {
    label: 'Formulário público interativo',
    // FormPreview eagerly starts both dynamic imports so data and renderer load
    // in parallel. They are intentionally part of the critical budget.
    entries: [
      'index.html',
      'src/pages/FormPreview.tsx',
      'src/pages/FormPreviewCore.tsx',
      'src/components/preview/InteractiveElement.tsx',
    ],
    maxGzipBytes: kib(305),
    maxBrotliBytes: kib(270),
    maxFiles: 32,
    forbiddenKeyPatterns: [/AdminApp/, /vendor-supabase/, /useAuth/],
  },
  adminShell: {
    label: 'Shell administrativo',
    entries: ['index.html', 'src/AdminApp.tsx'],
    maxGzipBytes: kib(285),
    maxBrotliBytes: kib(250),
    maxFiles: 24,
    forbiddenKeys: [
      'src/pages/Dashboard.tsx',
      'src/pages/AnalyticsDashboard.tsx',
      'src/pages/Settings.tsx',
      'src/pages/Gallery.tsx',
      'src/pages/Login.tsx',
      'src/pages/ResetPassword.tsx',
      'src/components/AppLayout.tsx',
    ],
  },
  login: {
    label: 'Login',
    entries: ['index.html', 'src/AdminApp.tsx', 'src/pages/Login.tsx'],
    maxGzipBytes: kib(295),
    maxBrotliBytes: kib(260),
    maxFiles: 30,
  },
  passwordReset: {
    label: 'Redefinição de senha',
    entries: ['index.html', 'src/AdminApp.tsx', 'src/pages/ResetPassword.tsx'],
    maxGzipBytes: kib(295),
    maxBrotliBytes: kib(260),
    maxFiles: 30,
  },
  dashboard: {
    label: 'Lista de formulários',
    entries: [
      'index.html',
      'src/AdminApp.tsx',
      'src/components/AppLayout.tsx',
      'src/pages/Dashboard.tsx',
    ],
    maxGzipBytes: kib(335),
    maxBrotliBytes: kib(295),
    maxFiles: 48,
  },
  analytics: {
    label: 'Dashboard geral',
    entries: [
      'index.html',
      'src/AdminApp.tsx',
      'src/components/AppLayout.tsx',
      'src/pages/AnalyticsDashboard.tsx',
    ],
    maxGzipBytes: kib(500),
    maxBrotliBytes: kib(430),
    maxFiles: 50,
  },
  editorPages: {
    label: 'Editor de páginas',
    entries: [
      'index.html',
      'src/AdminApp.tsx',
      'src/pages/editor/EditorLayout.tsx',
      'src/pages/editor/EditorPages.tsx',
      'src/components/editor/page-builder/PageBuilder.tsx',
    ],
    maxGzipBytes: kib(650),
    maxBrotliBytes: kib(560),
    maxFiles: 90,
  },
};

export const globalBundleBudget = {
  maxSingleJavaScriptGzipBytes: kib(120),
  maxSingleCssGzipBytes: kib(25),
};
