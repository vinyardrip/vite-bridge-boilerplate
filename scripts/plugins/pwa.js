/*!
 * =================================================================================================
 * scripts/plugins/pwa.js
 * =================================================================================================
 * PWA factory: vite-plugin-pwa (Service Worker + manifest).
 *
 *   - Disabled in dev mode.
 *   - Disabled when project.config.json → `pwa: false` (CMS targets default
 *     to off to avoid WordPress caching/auth conflicts).
 * =================================================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";

import { rootDir } from "../build-target.js";

function readConfig() {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(rootDir, "project.config.json"), "utf-8"),
    );
    return cfg;
  } catch {
    return { pwa: true };
  }
}

/**
 * @param {boolean} isDev  true в dev-режиме (mode === "development")
 * @returns {import('vite').Plugin[]}
 */
export function getPwaPlugins(isDev) {
  const cfg = readConfig();
  // pwa === false → disable (e.g. CMS target).
  // In dev → always disable.
  const pwaEnabled = cfg.pwa !== false && !isDev;

  if (!pwaEnabled) {
    return []; // empty plugin list
  }

  return [
    VitePWA({
      disable: isDev,
      registerType: "autoUpdate",
      // Паттерны привязаны к реально генерируемым файлам сборки,
      // чтобы workbox не выдавал предупреждение о пустых паттернах.
      workbox: { globPatterns: ["**/*.{js,css,html}"] },
      manifestFilename: "manifest.json",
      manifest: {
        name: "Vite Bridge Boilerplate",
        short_name: "ViteApp",
        description: "Vite Bridge Boilerplate",
        theme_color: "#3b4b66",
        background_color: "#ffffff",
        icons: [
          { src: "img/favicons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "img/favicons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ];
}
