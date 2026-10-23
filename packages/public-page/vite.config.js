import { defineConfig } from "vite";

// MPA: unknown paths 404. Do not enable the SPA fallback to index.html.
// Relative base: the same build works at / and under /_preview/{id}/.
export default defineConfig({
  appType: "mpa",
  base: "./",
});
