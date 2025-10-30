import { defineConfig } from "vite";
import nunjucks from "@vituum/vite-plugin-nunjucks";
import svgSprite from "vite-plugin-svg-sprite";
import { imagetools } from "vite-plugin-imagetools";
import webfontDl from "vite-plugin-webfont-dl";

export default defineConfig(({ command }) => ({
  plugins: [
    nunjucks({
      root: "./src/views",
      data: ["./src/data/**/*.json"],
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
      // Плагин будет использовать этот блок для генерации CSS,
      // который в первую очередь пытается загрузить шрифты с серверов Google.
      google: {
        // Указываем, какие семейства шрифтов нам нужны.
        families: [
          {
            // Имя семейства на Google Fonts.
            name: "JetBrains Mono",
            // Указываем необходимые начертания (веса).
            weights: ["300", "700"],
            // Можно также указать текст для создания subset'ов (оптимизация).
            // text: 'abcdef12345',
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
      // Этот блок добавляет наши локальные шрифты в те же самые правила @font-face,
      // которые были сгенерированы для Google Fonts.
      custom: {
        families: [
          {
            // ВАЖНО: 'name' должно ТОЧНО совпадать с именем из секции 'google'.
            // Так плагин понимает, к какому правилу @font-face добавить этот файл.
            name: "JetBrains Mono",
            // 'local' - имя нашего локального файла в /src/assets/fonts/
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
            // Пример, как мы можем дать кастомный алиас, если имя на Google Fonts
            // отличается от того, что мы хотим использовать в CSS.
            // Здесь мы используем 'Spectral SC' от Google, но в CSS будет 'spectral-lc'.
            name: "spectral-lc", // <-- Наш алиас для CSS
            // Но мы "связываем" его с семейством от Google.
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
