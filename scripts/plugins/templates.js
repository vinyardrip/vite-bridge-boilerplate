/*!
 * =================================================================================================
 * scripts/plugins/templates.js
 * =================================================================================================
 * Фабрика плагинов «шаблонного» слоя: генерация шрифтов (fontaine),
 * Nunjucks + frontmatter (vite-plugin-njk-frontmatter).
 */

import { FontaineTransform } from "fontaine";
import { nunjucksFrontMatterPlugin } from "vite-plugin-njk-frontmatter";

/**
 * @param {boolean} isServe  true в dev-режиме (command === "serve")
 * @param {object}  paths
 * @param {string}  paths.projectRoot  Корень проекта
 * @param {string}  paths.pagesDir     Каталог страниц .njk
 * @returns {import('vite').Plugin[]}
 */
export function getTemplatePlugins(isServe, { projectRoot, pagesDir }) {
  return [
    // 👇 ДОБАВЛЯЕМ ПЛАГИН FONTAINE В САМОЕ НАЧАЛО
    FontaineTransform.vite({
      fallbacks: {
        "JetBrains Mono": ["Courier New", "monospace"],
        Oswald: ["Arial", "sans-serif"],
        Spectral: ["Georgia", "serif"],
        "Spectral SC": ["Georgia", "serif"],
      },
    }),

    /*! --- НАСТРОЙКА NUNJUCKS & FRONTMATTER --- */
    nunjucksFrontMatterPlugin({
      root: "frontend/src/views",
      pagesDir,
      // !ВАЖНО: glob резолвится от КОРНЯ Vite (frontend/), поэтому префикс
      // "frontend/" здесь не нужен.
      data: "src/data/**/*.json",
      globals: {
        site: {
          // В dev site.production === false (фавикон из /src/...), в build — true.
          production: !isServe,
        },
      },
    }),
  ];
}
