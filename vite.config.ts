import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    cssMinify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react-dom') || (id.includes('/react/') && !id.includes('react-router'))) return 'vendor-react';
          if (id.includes('react-router-dom')) return 'vendor-router';
          if (id.includes('@supabase/supabase-js') || id.includes('@supabase/')) return 'vendor-supabase';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  esbuild: mode === "production" ? {
    drop: ['console', 'debugger'],
    legalComments: 'none',
  } : undefined,
}));
