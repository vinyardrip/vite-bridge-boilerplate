import { defineConfig } from "vite";
import nunjucks from "@vituum/vite-plugin-nunjucks";
import svgSprite from "vite-plugin-svg-sprite";
import { imagetools } from "vite-plugin-imagetools";
import webfontDl from "vite-plugin-webfont-dl";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => ({
  plugins: [
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
    svgSprite({
      symbolId: "icon-[name]",
    }),
    imagetools(),
    // --- НАСТРОЙКА ГИБРИДНОЙ ЗАГРУЗКИ ШРИФТОВ ---
    webfontDl({
      // --- ЭТАП 1: ЗАПРОС К GOOGLE FONTS ---
      google: {
        families: [
          {
            name: "JetBrains Mono",
            weights: ["300", "700"],
          },
          {
            name: "Spectral",
            weights: ["700"],
          },
          {
            name: "Spectral SC",
            weights: ["700"],
          },
        ],
      },
      // --- ЭТАП 2: ДОБАВЛЕНИЕ ЛОКАЛЬНЫХ ФАЙЛОВ КАК FALLBACK ---
      custom: {
        families: [
          {
            // ВАЖНО: 'name' должно ТОЧНО совпадать с именем из секции 'google'.
            // Так плагин понимает, к какому правилу @font-face добавить этот файл.
            name: "JetBrains Mono",
            // 'local' - имя нашего локального файла в /frontend/src/assets/fonts/
            local: "JetBrainsMono-Light",
            // Указываем, какому весу (начертанию) соответствует этот файл.
            weights: ["300"],
          },
          {
            name: "JetBrains Mono",
            local: "JetBrainsMono-Bold",
            weights: ["700"],
          },
          {
            name: "Spectral",
            local: "Spectral-Bold",
            weights: ["700"],
          },
          {
            // Пример, как мы можем дать кастомный алиас.
            name: "spectral-lc",
            mapTo: "Spectral SC",
            local: "SpectralSC-Bold",
            weights: ["700"],
          },
        ],
        // ВАЖНО: Эта опция - ключ к созданию fallback'а.
        // Она говорит плагину: "Не создавай новые правила @font-face,
        // а добавь эти локальные файлы в правила, созданные для 'google'".
        injectTo: "google",
      },
    }),

    // --- НАСТРОЙКА PWA И ГЕНЕРАЦИИ FAVICONS ---
    VitePWA({
      // Отключаем лишние для нас PWA-фичи, оставляя только генерацию ассетов.
      registerType: "autoUpdate",
      injectRegister: false,

      manifest: {
        // Данные для файла manifest.webmanifest
        name: "Vite Bridge Boilerplate",
        short_name: "ViteApp",
        description: "My Awesome App description",
        theme_color: "#ffffff", // Цвет для UI браузера на Android
        background_color: "#da532c", // Цвет для плиток Windows

        // Описание иконок, которые будут перечислены в манифесте.
        // Плагин сам сгенерирует эти файлы из исходника.
        icons: [
          {
            src: "pwa-192x192.png", // Путь будет относительным корня сайта
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "apple-touch-icon.png", // Иконка для iOS
            sizes: "180x180",
            type: "image/png",
          },
          {
            src: "maskable-icon-512x512.png", // Адаптивная иконка для Android
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      // Эта секция - ядро генерации иконок.
      pwaAssets: {
        // ВАЖНО: Указываем путь к нашему мастер-файлу иконки.
        image: "frontend/public/favicon.svg",
        // Конфигурация для разных платформ, аналог вашего Gulp-файла.
        config: {
          // Генерировать favicon.ico для старых браузеров
          favicon: true,
          // Настройки для иконок Apple
          apple: {
            // true = иконка без эффекта "стеклянного блеска"
            precomposed: true,
          },
          // Настройки для плиток Windows Metro
          msTile: {
            tileColor: "#da532c",
          },
          // Включить генерацию стандартных иконок для Android/PWA
          android: true,
          // Настройки для закрепленной вкладки в Safari
          safariPinnedTab: {
            themeColor: "#5bbad5",
          },
        },
      },
    }),
  ],

  build: {
    outDir: "dist",
    manifest: true,
    rollupOptions: {
      output: {
        entryFileNames: "js/[name].[hash].js",
        chunkFileNames: "js/chunk.[hash].js",
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name.split(".").pop();
          if (/css/i.test(extType)) {
            return "css/app.[hash].css";
          }
          if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp|avif/i.test(extType)) {
            return "img/[name].[hash][extname]";
          }
          if (/woff|woff2|eot|ttf|otf/i.test(extType)) {
            return "fonts/[name].[hash][extname]";
          }
          return "[name].[hash][extname]";
        },
        manualChunks(id) {
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
}));
