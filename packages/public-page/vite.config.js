import { defineConfig } from "vite";

// Preloads the hashed Geist text font so it downloads alongside the CSS instead of after it.
// Geist Mono only sets short code lines, so it keeps loading on demand.
const preloadGeist = {
  name: "oneself-preload-geist",
  transformIndexHtml: {
    order: "post",
    handler(_html, context) {
      const font = Object.keys(context.bundle ?? {}).find((file) =>
        /(?:^|\/)Geist-Variable-[\w-]+\.woff2$/.test(file),
      );
      if (font === undefined) {
        return [];
      }
      return [
        {
          tag: "link",
          attrs: {
            rel: "preload",
            href: `./${font}`,
            as: "font",
            type: "font/woff2",
            crossorigin: true,
          },
          injectTo: "head",
        },
      ];
    },
  },
};

// MPA: unknown paths 404. Do not enable the SPA fallback to index.html.
// Relative base: the same build works at / and under /_preview/{id}/.
export default defineConfig({
  appType: "mpa",
  base: "./",
  plugins: [preloadGeist],
});
