import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname);

export default defineConfig({
  testDir: "./tests/frontend/e2e",
  // Tests in picture-transform.spec.js each invoke `pnpm build` which
  // mutates dist/. Running them in parallel corrupts the build output
  // for the smoke tests that read dist/. Keep them serial.
  fullyParallel: false,
  workers: 1,
  reporter: "html",

  // All test output artifacts land under temp/ so they never pollute the
  // project root. temp/ is .gitignored.
  outputDir: "temp/test-results",

  webServer: {
    command: "pnpm preview",
    // run the preview server from the repo root, not the e2e test dir
    cwd: REPO_ROOT,
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },

  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
