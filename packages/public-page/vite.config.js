import { defineConfig } from "vite";

// MPA: unknown paths 404. Do not enable the SPA fallback to index.html.
export default defineConfig({
  appType: "mpa",
});
