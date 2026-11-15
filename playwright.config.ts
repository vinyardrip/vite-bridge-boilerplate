import { defineConfig, devices } from "@playwright/test";

// Порт preview-сервера можно переопределить, чтобы не пересекаться
// с другими запущенными копиями проекта: PREVIEW_PORT=4174 pnpm playwright test
const previewPort = Number(process.env.PREVIEW_PORT) || 4173;
const previewUrl = `http://127.0.0.1:${previewPort}`;

/*! --- DEV-СЕРВЕР ДЛЯ DEV-ONLY СТРАНИЦ ---
styleguide (и другие страницы из DEV_ONLY_PAGES в vite.config.ts) не
собирается в dist/, но остается живой документацией UI-кита — проверяем
его против `pnpm dev`. Порт 5175 выбран отдельно от дефолтного dev (5173),
чтобы не пересекаться с запущенным у разработчика сервером:
STYLEGUIDE_PORT=5176 pnpm playwright test */
const styleguideDevPort = Number(process.env.STYLEGUIDE_PORT) || 5175;
const styleguideDevUrl = `http://127.0.0.1:${styleguideDevPort}`;

export default defineConfig({
  testDir: "./frontend/tests",
  fullyParallel: true,
  reporter: "html",

  webServer: [
    {
      command: `pnpm preview --port ${previewPort} --strictPort`,
      url: previewUrl,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm dev --port ${styleguideDevPort} --strictPort`,
      url: styleguideDevUrl,
      reuseExistingServer: !process.env.CI,
    },
  ],

  use: {
    baseURL: previewUrl,
    trace: "on-first-retry",
  },

  projects: [
    // Собранные страницы: обе дев-спеки исключены — их страницы в dist нет.
    {
      name: "chromium",
      testIgnore: /styleguide\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: previewUrl },
    },
    {
      name: "firefox",
      testIgnore: /styleguide\.spec\.ts$/,
      use: { ...devices["Desktop Firefox"], baseURL: previewUrl },
    },
    // Styleguide — dev-only: тестируется против dev-сервера (там же доступны
    // HMR-модули и njk-middleware, как их видит разработчик).
    {
      name: "styleguide-dev",
      testMatch: /styleguide\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: styleguideDevUrl },
    },
  ],
});
