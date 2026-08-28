/*!
 * =================================================================================================
 * scripts/plugins/assets.js
 * =================================================================================================
 * Фабрика плагинов «ассетного» слоя: SVG-спрайт (vite-plugin-svg-sprite),
 * оптимизация картинок (vite-imagetools) и гибридная загрузка шрифтов
 * (vite-plugin-webfont-dl).
 */

import svgSprite from "vite-plugin-svg-sprite";
import { imagetools } from "vite-imagetools";
import webfontDl from "vite-plugin-webfont-dl";

/**
 * @returns {import('vite').Plugin[]}
 */
export function getAssetPlugins() {
  return [
    /*! --- НАСТРОЙКА SVG-СПРАЙТА (АГРЕССИВНАЯ ОЧИСТКА) --- */
    svgSprite({
      symbolId: "icon-[name]",
      svgo: {
        plugins: [
          {
            name: "preset-default",
          },
          {
            name: "removeAttrs",
            params: {
              attrs: "(fill|stroke)",
            },
          },
          "cleanupIds",
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
  ];
}
