import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["core/test/**/*.test.ts", "worker/test/**/*.test.ts", "cli/test/**/*.test.ts"],
  },
});
