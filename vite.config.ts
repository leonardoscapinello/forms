import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    // Editor previews run in an opaque-origin sandbox so draft content cannot
    // access the authenticated editor's storage. ES modules therefore need an
    // explicit CORS response even though their URL points at this dev server.
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
  preview: {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    cssMinify: true,
    sourcemap: false,
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react-dom') || (id.includes('/react/') && !id.includes('react-router'))) return 'vendor-react';
          if (id.includes('react-router-dom')) return 'vendor-router';
          if (id.includes('@supabase/supabase-js') || id.includes('@supabase/')) return 'vendor-supabase';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
}));
