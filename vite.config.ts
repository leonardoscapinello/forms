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
          if (id.includes('react-dom') || (id.includes('/react/') && !id.includes('react-router'))) return 'vendor-react';
          if (id.includes('react-router-dom')) return 'vendor-router';
          if (id.includes('framer-motion')) return 'motion';
          // recharts + d3 must stay together to avoid circular ref
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
          if (id.includes('@xyflow')) return 'flow';
          if (id.includes('@dnd-kit')) return 'dnd';
          if (id.includes('@radix-ui')) return 'ui';
          if (id.includes('@supabase')) return 'supabase';
        },
      },
    },
  },
}));
