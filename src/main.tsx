import { createRoot } from "react-dom/client";
import { autoDetectAndPrefetch } from "./lib/formPrefetch";
import App from "./App.tsx";
import "./index.css";

// Start fetching form data BEFORE React mounts — runs in parallel with hydration
autoDetectAndPrefetch();

createRoot(document.getElementById("root")!).render(<App />);
