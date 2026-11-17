import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/component/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "tests/live/**", "node_modules/**"],
    css: true,
    restoreMocks: true,
    // Arc's animated controls are heavy in jsdom; a 5 s default made auth and timeline tests flaky under load.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/api/**", "src/lib/**"],
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
