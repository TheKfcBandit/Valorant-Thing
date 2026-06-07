import { defineConfig } from "vitest/config";

// Node env — current smoke tests are pure utilities, no DOM needed.
// When the first React component test lands, add jsdom and switch
// `environment` to "jsdom".
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}", "src/__tests__/**/*.{js,jsx}"],
    globals: false,
  },
});
