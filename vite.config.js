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
import fs from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import { visualizer } from "rollup-plugin-visualizer";

import { nunjucksFrontMatterPlugin } from "vite-plugin-njk-frontmatter";
import viteNjkTrace from "vite-njk-trace";

import { imagetools } from "vite-imagetools";
import webfontDl from "vite-plugin-webfont-dl";
// import { VitePWA } from "vite-plugin-pwa";
import { FontaineTransform } from "fontaine";

/*! --- ГЛОБАЛЬНЫЕ ДАННЫЕ САЙТА --- */
// vite-plugin-njk-frontmatter особый случай: файл site.json он сливает
// в КОРЕНЬ контекста, а не в namespace site.*. Шаблоны же проекта
// рассчитывают на site.name, site.url, site.fonts и т.д., поэтому
// читаем site.json здесь и отдаем его через globals.site.
const readSiteData = () => {
  try {
    return JSON.parse(fs.readFileSync("frontend/src/data/site.json", "utf-8"));
  } catch {
    console.warn("Не удалось прочитать frontend/src/data/site.json");
    return {};
  }
};

/*! --- ТОЧКИ ВХОДА ДЛЯ СБОРКИ --- */
// Nunjucks-страницы подхватывает vite-plugin-njk-frontmatter (хук load →
// generateBundle: рендерит .njk и эмитит .html). app.js нужен как отдельная
// точка входа, чтобы он попал в бандл и в manifest.json для get_asset().
const collectRollupInputs = () => {
  const pages = globSync("frontend/src/views/pages/*.njk");
  const entries = [...pages, "frontend/src/js/app.js"];

  return Object.fromEntries(
    entries.map((file) => [path.basename(file, path.extname(file)), file]),
  );
};

/*!
 * Локальный плагин: инжект <script>/<link> в HTML-страницы, собранные из .njk.
 *
 * !ПОЧЕМУ НУЖЕН: встроенный инжект Vite (vite:build-html) обрабатывает только
 * HTML, прошедший хук transform (реальные .html-точки входа).
 * vite-plugin-njk-frontmatter рендерит .njk в load() как JS-модуль и эмитит
 * готовый HTML через this.emitFile({ type: "asset" }) — в обход этого
 * пайплайна (проверено: без плагина dist/index.html ссылается на
 * несуществующий /frontend/src/js/app.js и не содержит <link>).
 *
 * Плагин делает ровно две вещи и ничего не вырезает:
 *   1. подменяет src точки входа на хешированный файл бандла;
 *   2. вставляет <link rel="stylesheet"> перед </head>.
 * Данные берутся из родных метаданных Vite (isEntry-чанк и его
 * viteMetadata.importedCss — тот же источник, что использует сам Vite).
 * Пути вычисляются ОТНОСИТЕЛЬНО каждой страницы — совместимо с base: './'
 * и открытием dist/index.html через file://.
 */
const injectTagsIntoNjkHtml = () => ({
  name: "inject-tags-into-njk-html",
  enforce: "post",
  apply: "build",
  generateBundle(_, bundle) {
    const htmlFiles = Object.values(bundle).filter(
      (file) => file.type === "asset" && file.fileName.endsWith(".html"),
    );
    if (htmlFiles.length === 0) {
      return;
    }

    const appChunk = Object.values(bundle).find(
      (file) =>
        file.type === "chunk" &&
        file.isEntry &&
        file.facadeModuleId?.replace(/\\/g, "/").endsWith("js/app.js"),
    );

    if (!appChunk) {
      this.warn(
        "Чанк точки входа js/app.js не найден — HTML останется без скрипта",
      );
    }

    // CSS, который импортирует точка входа (родные метаданные Vite).
    const cssFiles = Array.from(appChunk?.viteMetadata?.importedCss ?? []);

    for (const html of htmlFiles) {
      const htmlDir = path.posix.dirname(html.fileName);
      // Путь ассета относительно страницы: из dist/index.html → "js/...",
      // из вложенной страницы (pages/about.html) → "../js/...".
      const rel = (assetPath) =>
        path.posix.relative(htmlDir, assetPath) || path.posix.basename(assetPath);

      let source = String(html.source);

      if (appChunk) {
        source = source.replace(
          /src="\/frontend\/src\/js\/app\.js"/g,
          `src="${rel(appChunk.fileName)}"`,
        );
      }

      if (cssFiles.length > 0) {
        const links = cssFiles
          .map((cssFile) => `    <link rel="stylesheet" href="${rel(cssFile)}">`)
          .join("\n");
        source = source.replace("</head>", `${links}\n  </head>`);
      }

      html.source = source;
    }
  },
});

/*!
 * Локальный плагин: чистка осиротевших sourcemap'ов.
 *
 * vite-plugin-njk-frontmatter удаляет пустые чанки HTML-страниц из бандла,
 * но их sourcemap'ы остаются. Убираем карты без парного .js.
 */
const removeOrphanSourcemaps = () => ({
  name: "remove-orphan-sourcemaps",
  enforce: "post",
  generateBundle(_, bundle) {
    for (const [name, file] of Object.entries(bundle)) {
      if (file.type === "asset" && name.endsWith(".js.map")) {
        const jsName = name.replace(/\.map$/, "");
        if (!bundle[jsName]) {
          delete bundle[name];
        }
      }
    }
  },
});

export default defineConfig(({ command }) => {
  const plugins = [
    // Fontaine должен идти первым: подменяет @font-face на fallback-метрики.
    FontaineTransform.vite({
      fallbacks: {
        "JetBrains Mono": ["Courier New", "monospace"],
        Spectral: ["Georgia", "serif"],
        "Spectral SC": ["Georgia", "serif"],
      },
    }),

    /*! --- НАСТРОЙКА NUNJUCKS & FRONTMATTER --- */
    nunjucksFrontMatterPlugin({
      root: "frontend/src/views",
      pagesDir: "frontend/src/views/pages",
      data: "frontend/src/data/**/*.json",
      globals: {
        site: {
          ...readSiteData(),
          production: command === "build",
        },
      },
    }),

    /*! --- ТРЕЙСЕР NUNJUCKS-ШАБЛОНОВ (только dev) --- */
    // Идет ПОСЛЕ nunjucksFrontMatterPlugin: патчит загрузчик Nunjucks после
    // настройки шаблонизатора и добавляет в HTML комментарии-границы
    // <!-- NJK: START/END ... -->, чтобы в DevTools было видно источник фрагмента.
    viteNjkTrace({
      projectRoot: path.resolve(__dirname),
      pagesDir: "frontend/src/views/pages",
    }),

    /*! --- SVG-СПРАЙТ ---
    Плагин vite-plugin-svg-sprite намеренно отключен: иконок в проекте пока
    нет. Когда появятся — раскомментировать здесь и складывать исходники
    в frontend/src/assets/svg/ (спрайт соберется в dist/img/sprite.svg,
    макрос ui.icon() из macros/_ui.njk уже ссылается на него). */

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

    /*! --- PWA (отключен по умолчанию) ---
    Чтобы включить PWA: 1) раскомментируйте импорт vite-plugin-pwa вверху
    файла; 2) раскомментируйте ОДИН из вариантов VitePWA ниже; 3) иконки
    генерируются командой `pnpm favicons:generate` (vite.config.js —
    см. pwaAssets). */

    /*! --- НАСТРОЙКА PWA И ГЕНЕРАЦИИ FAVICONS --- */
    // VitePWA({
    //   registerType: "autoUpdate",
    //   injectRegister: false,
    //   manifest: {
    //     name: "Vite Bridge Boilerplate",
    //     short_name: "ViteApp",
    //     description: "My Awesome App description",
    //     theme_color: "#ffffff",
    //     background_color: "#da532c",
    //     icons: [
    //       { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
    //       { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
    //       { src: "apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    //       {
    //         src: "maskable-icon-512x512.png",
    //         sizes: "512x512",
    //         type: "image/png",
    //         purpose: "maskable",
    //       },
    //     ],
    //   },
      // pwaAssets: {
      //   image: "frontend/public/favicon.svg",
      //   config: {
      //     favicon: true,
      //     apple: { precomposed: true },
      //     msTile: { tileColor: "#da532c" },
      //     android: true,
      //     safariPinnedTab: { themeColor: "#5bbad5" },
      //   },
      // },
    // }),

// VitePWA({
//   disable: isDev,
//   registerType: 'autoUpdate',
//   workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico}'] },
//   manifest: {
//     name: 'Vite Bridge Boilerplate',
//     short_name: 'ViteApp',
//     theme_color: '#ffffff',
//     icons: []
//   }
// })

// VitePWA({
//   registerType: 'autoUpdate',
//   // pwaAssets: { ... }        ← УБИРАЕМ полностью
//   manifest: {
//     name: 'Vite Bridge Boilerplate',
//     short_name: 'ViteApp',
//     theme_color: '#ffffff',
//     icons: []
//   }
// })
//

    /*! --- ИНЖЕКТ ТЕГОВ В HTML ИЗ .NJK (см. комментарий выше) --- */
    injectTagsIntoNjkHtml(),

    /*! --- ЧИСТКА ОСИРОТЕВШИХ SOURCEMAP'ОВ --- */
    removeOrphanSourcemaps(),
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
    /*! --- БАЗА ПУТЕЙ --- */
    // В сборке пути к ассетам в HTML — относительные ("./css/...", "./js/..."),
    // чтобы dist/index.html открывался двойным кликом через file://.
    // В dev base обязан быть абсолютным (требование Vite), оставляем "/".
    base: command === "build" ? "./" : "/",

    /*! --- НАСТРОЙКА DEV-СЕРВЕРА --- */
    server: {
      host: true,
    },

    /*! --- ПУБЛИЧНАЯ ДИРЕКТОРИЯ (копируется в dist как есть) --- */
    publicDir: "frontend/public",

    plugins,

    /*! --- НАСТРОЙКА SASS / ITCSS LOAD PATHS --- */
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
          loadPaths: [path.resolve(__dirname, 'frontend/src/scss')],
        },
      },
    },

    /*! --- НАСТРОЙКА ФИНАЛЬНОЙ СБОРКИ --- */
    build: {
      outDir: "dist",
      // manifest.json кладем в корень dist, чтобы PHP-хелпер get_asset()
      // находил его по пути <theme>/assets/manifest.json после sync:theme.
      manifest: "manifest.json",
      sourcemap: true,
      rollupOptions: {
        // Точки входа: все Nunjucks-страницы + JS-точка входа (см. collectRollupInputs).
        input: collectRollupInputs(),
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