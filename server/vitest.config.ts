import { defineConfig } from "vitest/config";

// The relay's unit tests import the shared protocol from ../../shared, which
// sits outside server/. Allow Vite/Vitest to read above the package root.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  server: {
    fs: { allow: [".."] },
  },
});
