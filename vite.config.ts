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
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-popover", "@radix-ui/react-dropdown-menu", "@radix-ui/react-tooltip", "@radix-ui/react-tabs"],
          query: ["@tanstack/react-query"],
          charts: ["recharts"],
          flow: ["@xyflow/react"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable"],
          motion: ["framer-motion"],
        },
      },
    },
  },
}));
