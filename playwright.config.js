import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  // The JSON report is what CI uploads and Planwright reads for [AC:] / [INV:] markers.
  reporter: [["list"], ["json", { outputFile: "test-results/report.json" }]],
  use: { baseURL: "http://localhost:4010" },
  webServer: {
    command: "node src/server.js",
    url: "http://localhost:4010/health",
    reuseExistingServer: !process.env.CI,
  },
});
