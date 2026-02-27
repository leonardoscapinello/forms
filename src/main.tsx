import { createRoot } from "react-dom/client";
import { autoDetectAndPrefetch } from "./lib/formPrefetch";
import App from "./App.tsx";
import "./index.css";

// Start fetching form data BEFORE React mounts
autoDetectAndPrefetch();

// Register Service Worker for asset caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
