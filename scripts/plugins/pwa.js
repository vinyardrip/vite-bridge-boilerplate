/*!
 * =================================================================================================
 * scripts/plugins/pwa.js
 * =================================================================================================
 * Фабрика PWA-плагина (vite-plugin-pwa): service worker + манифест.
 * В dev-режиме PWA полностью отключается (disable: isDev).
 */

import { VitePWA } from "vite-plugin-pwa";

/**
 * @param {boolean} isDev  true в dev-режиме (mode === "development")
 * @returns {import('vite').Plugin[]}
 */
export function getPwaPlugins(isDev) {
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
        // Theme color coordinated with vite-html-asset-inject <head> tag.
        theme_color: "#3b4b66",
        background_color: "#ffffff",
        // icon-192.png / icon-512.png are generated into img/favicons/ of the
        // build target after vite build (scripts/generate-favicons.js) —
        // listed here as static relative paths so the PWA manifest
        // references the canonical favicon set.
        icons: [
          { src: "img/favicons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "img/favicons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ];
}
