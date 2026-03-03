import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Converts render-blocking <link rel="stylesheet"> to non-blocking preload pattern.
 * This eliminates the "Render-blocking resources" Lighthouse warning for CSS.
 */
function deferCssPlugin(): Plugin {
  return {
    name: 'defer-css',
    enforce: 'post',
    transformIndexHtml(html) {
      // Only transform in production builds
      return html.replace(
        /<link rel="stylesheet" crossorigin href="(.*?)">/g,
        '<link rel="preload" as="style" crossorigin href="$1" onload="this.rel=\'stylesheet\'">' +
        '<noscript><link rel="stylesheet" crossorigin href="$1"></noscript>'
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'production' && deferCssPlugin(),
  ].filter(Boolean),
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
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('lucide-react')) return 'vendor-icons';
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
