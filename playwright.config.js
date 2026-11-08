import { defineConfig, devices } from "@playwright/test";

// Порт preview-сервера можно переопределить, чтобы не пересекаться
// с другими запущенными копиями проекта: PREVIEW_PORT=4174 pnpm playwright test
const previewPort = Number(process.env.PREVIEW_PORT) || 4173;
const previewUrl = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: "./frontend/tests",
  fullyParallel: true,
  reporter: "html",

  webServer: {
    command: `pnpm preview --port ${previewPort} --strictPort`,
    url: previewUrl,
    reuseExistingServer: !process.env.CI,
  },

  use: {
    baseURL: previewUrl,
    trace: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    // WebKit временно отключен: в песочнице нет системных зависимостей
    // (нужен `pnpm playwright install-deps webkit` с правами sudo).
    // Вернуть: раскомментировать строку ниже после установки зависимостей.
    // { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
