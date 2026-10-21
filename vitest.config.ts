import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "tests/acceptance/**/*.test.ts"],
    passWithNoTests: true,
    fileParallelism: false,
  },
});
