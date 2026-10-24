import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted variable fonts (bundled into dist/, no third-party requests).
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/public-sans";

import { App } from "./App.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
