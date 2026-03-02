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
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React — shared by all routes
          if (id.includes('react-dom') || (id.includes('/react/') && !id.includes('react-router'))) return 'vendor-react';
          if (id.includes('react-router-dom')) return 'vendor-router';
          // framer-motion — used by form preview
          if (id.includes('framer-motion')) return 'motion';
          // Heavy admin-only deps
          if (id.includes('recharts')) return 'charts';
          if (id.includes('@xyflow')) return 'flow';
          if (id.includes('@dnd-kit')) return 'dnd';
          // Radix UI — mostly admin
          if (id.includes('@radix-ui')) return 'ui';
          // Supabase client — shared
          if (id.includes('@supabase')) return 'supabase';
        },
      },
    },
  },
}));
