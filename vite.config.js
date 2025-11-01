/*!
 * =================================================================================================
 * vite.config.js
 * =================================================================================================
 *
 * Главный конфигурационный файл для сборщика Vite.
 * Источник правды для всей frontend-сборки.
 *
 * =================================================================================================
 */

import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

import nunjucks from "@vituum/vite-plugin-nunjucks";
import svgSprite from "vite-plugin-svg-sprite";
import { imagetools } from "vite-plugin-imagetools";
import webfontDl from "vite-plugin-webfont-dl";
import { VitePWA } from "vite-plugin-pwa";
import { FontaineTransform } from "fontaine"; // 👈 ИМПОРТИРУЕМ ПЛАГИН

export default defineConfig(({ command }) => {
  const plugins = [
    // 👇 ДОБАВЛЯЕМ ПЛАГИН FONTAINE В САМОЕ НАЧАЛО
    FontaineTransform.vite({
      fallbacks: {
        "JetBrains Mono": ["Courier New", "monospace"],
        Spectral: ["Georgia", "serif"],
        "Spectral SC": ["Georgia", "serif"],
      },
    }),

    nunjucks({
      root: "./frontend/src/views",
      data: ["./frontend/src/data/**/*.json"],
      fm: true,
      globals: {
        site: {
          production: command === "build",
        },
      },
    }),

    /*! --- НАСТРОЙКА SVG-СПРАЙТА (АГРЕССИВНАЯ ОЧИСТКА) --- */
    svgSprite({
      symbolId: "icon-[name]",
      svgo: {
        plugins: [
          {
            name: "preset-default",
            params: {
              overrides: {
                removeAttrs: {
                  attrs: "(fill|stroke)",
                },
                cleanupIDs: true,
              },
            },
          },
        ],
      },
    }),

    imagetools(),

    /*! --- НАСТРОЙКА ГИБРИДНОЙ ЗАГРУЗКИ ШРИФТОВ --- */
    webfontDl({
      google: {
        families: [
          { name: "JetBrains Mono", weights: ["300", "700"] },
          { name: "Spectral", weights: ["700"] },
          { name: "Spectral SC", weights: ["700"] },
        ],
      },
      custom: {
        families: [
          {
            name: "JetBrains Mono",
            local: "JetBrainsMono-Light",
            weights: ["300"],
          },
          {
            name: "JetBrains Mono",
            local: "JetBrainsMono-Bold",
            weights: ["700"],
          },
          { name: "Spectral", local: "Spectral-Bold", weights: ["700"] },
          {
            // !Пример, как мы можем дать кастомный алиас.
            name: "spectral-lc",
            mapTo: "Spectral SC",
            local: "SpectralSC-Bold",
            weights: ["700"],
          },
        ],
        // !ВАЖНО: Эта опция - ключ к созданию fallback'а.
        injectTo: "google",
      },
    }),

    /*! --- НАСТРОЙКА PWA И ГЕНЕРАЦИИ FAVICONS --- */
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Vite Bridge Boilerplate",
        short_name: "ViteApp",
        description: "My Awesome App description",
        theme_color: "#ffffff",
        background_color: "#da532c",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "apple-touch-icon.png", sizes: "180x180", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      pwaAssets: {
        image: "frontend/public/favicon.svg",
        config: {
          favicon: true,
          apple: { precomposed: true },
          msTile: { tileColor: "#da532c" },
          android: true,
          safariPinnedTab: { themeColor: "#5bbad5" },
        },
      },
    }),
  ];

  /*! --- УСЛОВНОЕ ПОДКЛЮЧЕНИЕ АНАЛИЗАТОРА СБОРКИ --- */
  if (process.env.ANALYZE) {
    plugins.push(
      visualizer({
        open: true,
        filename: "dist/stats.html",
        gzipSize: true,
        brotliSize: true,
      }),
    );
  }

  return {
    /*! --- НАСТРОЙКА DEV-СЕРВЕРА --- */
    server: {
      host: true,
    },

    plugins,

    /*! --- НАСТРОЙКА ФИНАЛЬНОЙ СБОРКИ --- */
    build: {
      outDir: "dist",
      manifest: true,
      sourcemap: true,
      rollupOptions: {
        output: {
          entryFileNames: "js/[name].[hash].js",
          chunkFileNames: "js/chunk.[hash].js",
          assetFileNames: (assetInfo) => {
            // ?ИСПРАВЛЕНО: Заменено устаревшее свойство `assetInfo.name` на `assetInfo.fileName`
            // для соответствия последним версиям Rollup (используется в Vite).
            // Добавлен fallback `|| assetInfo.name` для максимальной обратной совместимости.
            const extType = (assetInfo.fileName || assetInfo.name)
              .split(".")
              .pop();

            if (/css/i.test(extType)) return "css/app.[hash].css";
            if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp|avif/i.test(extType))
              return "img/[name].[hash][extname]";
            if (/woff|woff2|eot|ttf|otf/i.test(extType))
              return "fonts/[name].[hash][extname]";
            return "[name].[hash][extname]";
          },
          manualChunks(id) {
            if (id.includes("node_modules")) return "vendor";
          },
        },
      },
    },
  };
});
