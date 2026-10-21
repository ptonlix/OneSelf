import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/smoke/closed-loop.test.ts"],
    passWithNoTests: true,
    fileParallelism: false,
  },
});
