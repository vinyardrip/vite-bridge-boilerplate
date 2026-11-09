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

import imageOptimize from "vite-plugin-image-optimize";
import { imgToPicture } from "@atrocityz/vite-plugin-html-img-to-picture";
import { smartAssets } from "vite-plugin-smart-assets";
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

/*! --- ФИЛЬТР NUNJUCKS: ИНЛАЙН SVG-ИКОНОК (используется макросом ui.svg) ---
Читает файл frontend/src/assets/icons/<name>.svg и возвращает готовую
разметку корневого <svg> для прямой вставки в HTML. Вызывается из
макроса ui.svg() (macros/_ui.njk) с модификатором | safe: содержимое —
файл из репозитория, доверенный источник на этапе сборки.

Обработка под наследование цвета через CSS color:
  • вырезаются XML-пролог, DOCTYPE и комментарии;
  • fill="#hex" / stroke="#hex" заменяются на currentColor ПО ВСЕМУ файлу
    (fill="none" не трогаем — он легитимен для stroke-иконок, а собственный
    fill элемента перекрывает унаследованный от корня);
  • если у корневого <svg> не задан fill вовсе — добавляется
    fill="currentColor" (иначе пути рисуются дефолтным черным);
  • класс макроса сливается с классом иконки, если она его уже имела;
  • декоративные иконки: aria-hidden="true" focusable="false".
Отсутствие файла не роняет сборку: предупреждение + HTML-комментарий в разметке. */
const svgIconFilter = (name, classes) => {
  const iconPath = path.resolve(
    __dirname,
    "frontend/src/assets/icons",
    `${name}.svg`,
  );

  let source;
  try {
    source = fs.readFileSync(iconPath, "utf-8");
  } catch {
    console.warn(`svgIcon: иконка "${name}" не найдена в frontend/src/assets/icons/`);
    return `<!-- svgIcon: иконка "${name}" не найдена -->`;
  }

  // 1. Пролог/DOCTYPE/комментарии в inline-разметке не нужны.
  source = source
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  // 2. Зашитые цвета → currentColor (по всему файлу, не только в корне).
  source = source
    .replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="currentColor"')
    .replace(/stroke="#[0-9a-fA-F]{3,8}"/g, 'stroke="currentColor"');

  // 3. Корневой <svg>: class, aria-атрибуты и fill="currentColor" по умолчанию.
  const rootMatch = source.match(/<svg\b([^>]*)>/i);
  if (!rootMatch) {
    console.warn(`svgIcon: в "${name}.svg" нет корневого <svg>`);
    return "";
  }

  let attrs = rootMatch[1];
  if (/\bclass\s*=/i.test(attrs)) {
    attrs = attrs.replace(/\bclass\s*=\s*"([^"]*)"/i, (_, existing) => {
      const merged = `${existing} ${classes}`.trim();
      return `class="${merged}"`;
    });
  } else {
    attrs += ` class="${classes}"`;
  }
  if (!/\bfill\s*=/i.test(attrs)) {
    attrs += ' fill="currentColor"';
  }
  attrs += ' aria-hidden="true" focusable="false"';
  source = source.replace(/<svg\b[^>]*>/i, `<svg${attrs}>`);

  return source;
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

/*!
 * Локальный плагин: обертка <img> в <picture> для HTML, собранного из .njk.
 *
 * !ПОЧЕМУ НУЖЕН: @atrocityz/vite-plugin-html-img-to-picture умеет
 * обрабатывать файлы только через хук transform (id должен совпадать
 * с include-регэкспом \.html$). Страницы этого проекта — .njk: их рендерит
 * vite-plugin-njk-frontmatter в load() и эмитит готовый HTML через
 * emitFile в generateBundle (см. комментарий к injectTagsIntoNjkHtml) —
 * transform их никогда не увидит.
 *
 * Решение: делегируем обработку самому плагину. В generateBundle (после
 * того как njk-frontmatter эмитит HTML-ассеты) вызываем
 * picturePlugin.transform() вручную для каждого HTML-ассета и записываем
 * результат обратно в asset.source. Плагин при этом честно добавлен в
 * plugins — его writeBundle записывает сгенерированные AVIF/WebP-варианты
 * в dist/img/, closeBundle печатает статистику.
 *
 * !ВАЖНО ПРО ПУТИ: transform резолвит src <img> относительно каталога
 * виртуального id. Виртуальный файл кладем в frontend/src — поэтому
 * в шаблонах пишут src="assets/images/foo.jpg" (файл в
 * frontend/src/assets/images/foo.jpg). В <picture> плагин подставляет
 * пути из outputDir ("img") — они относительные, что совместимо с
 * base: './' (абсолютные пути к ассетам запрещает check-build.js).
 *
 * !ИЗВЕСТНАЯ ОСОБЕННОСТЬ ПЛАГИНА: width/height обернутого <img> он пишет
 * как width=height=ширине 1x-варианта (без аспекта). После делегирования
 * чиним height по реальному аспекту исходника — иначе браузер до загрузки
 * CSS резервирует место по неверной пропорции (CLS). Метаданные читаем
 * из исходников ДО трансформации (варианты в dist появляются позже, в
 * writeBundle плагина).
 */
const njkImgToPicture = (picturePlugin) => {
  // Метаданные исходников: имя файла без расширения → { width, height }.
  const metaCache = new Map();

  const getMeta = async (src) => {
    const baseName = path.basename(src, path.extname(src));
    if (metaCache.has(baseName)) {
      return metaCache.get(baseName);
    }

    try {
      const sharp = (await import("sharp")).default;
      const imagePath = path.resolve(__dirname, "frontend/src", src);
      const meta = await sharp(imagePath).metadata();
      const value = { width: meta.width, height: meta.height };
      metaCache.set(baseName, value);
      return value;
    } catch (error) {
      console.warn(`njkImgToPicture: не удалось прочитать ${src}: ${error.message}`);
      metaCache.set(baseName, null);
      return null;
    }
  };

  return {
    name: "njk-img-to-picture",
    apply: "build",
    async generateBundle(_, bundle) {
      const htmlFiles = Object.values(bundle).filter(
        (file) => file.type === "asset" && file.fileName.endsWith(".html"),
      );
      if (htmlFiles.length === 0) {
        return;
      }

      // Виртуальный id: должен заканчиваться на .html (include-фильтр плагина),
      // его каталог frontend/src — база для относительных src в шаблонах.
      const virtualId = path.resolve(
        __dirname,
        "frontend/src",
        "__virtual__.html",
      );

      // Тот же регэксп, что внутри плагина: src картинок ДО трансформации.
      const imgRegex = /<img[^>]+src="(assets\/images\/[^">]+\.(?:jpg|jpeg|png))"[^>]*>/gi;

      for (const html of htmlFiles) {
        const source = String(html.source);

        // 1. Метаданные исходников (для починки height после трансформации).
        for (const match of source.matchAll(imgRegex)) {
          await getMeta(match[1]);
        }

        // 2. Делегация оборачивания в <picture> самому плагину.
        const result = await picturePlugin.transform(source, virtualId);
        if (!result?.code) {
          continue;
        }

        // 3. Починка height: плагин пишет height=width; у не-квадратных
        //    картинок подставляем реальный аспект (width=1x-вариант,
        //    аспект совпадает с исходником). Пару находим по совпадающим
        //    значениям width/height, имя файла — по src того же тега.
        html.source = result.code.replace(
          /src="([^"]*\.(?:jpg|jpeg|png))"[^>]*width="(\d+)"\s+height="\2"/gi,
          (match, src, width) => {
            const baseName = path.basename(src, path.extname(src));
            const meta = metaCache.get(baseName);
            if (!meta?.width) {
              return match;
            }
            const height = Math.round((width * meta.height) / meta.width);
            return match.replace(/height="\d+"(?=\s|$|>)/, `height="${height}"`);
          },
        );
      }
    },
  };
};

/*!
 * ЕДИНСТВЕННЫЙ экземпляр imgToPicture (см. комментарий к image-пайплайну
 * ниже). Обертка njkImgToPicture делегирует обработку HTML именно в этот
 * экземпляр — накопленные варианты пишет в dist/img его собственный
 * writeBundle. Два разных экземпляра не видели бы память друг друга.
 */
const imgToPicturePlugin = imgToPicture({
  // AVIF первым: браузер выбирает первый поддерживаемый <source>.
  formats: ["avif", "webp"],
  quality: 80,
  outputDir: "img",
  isRetinaSupport: true,
  lazyLoading: true,
});

export default defineConfig(({ command, mode }) => {
  /*! --- РЕЖИМ WORDPRESS (pnpm build:wp, `vite build --mode wordpress`) ---
  Ассеты собираются сразу в тему: backend/wp-content/themes/my-theme/assets/
  (каталог в .gitignore). manifest.json кладется в корень этой папки —
  его читает get_asset() из inc/enqueue-assets.php.
  Отличия от обычной сборки: только outDir и точки входа. HTML-страницы
  из .njk в WP-режиме не собираются — разметку рендерит PHP, а base
  остается относительным: чанки/шрифты лежат рядом и резолвятся
  от URL файла независимо от домена. */
  const isWpBuild = mode === "wordpress";
  const wpAssetsDir = "backend/wp-content/themes/my-theme/assets";

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
      filters: {
        svgIcon: svgIconFilter,
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

    /*! --- ГЕНЕРАЦИЯ AVIF/WEBP + ОПТИМИЗАЦИЯ КАРТИНОК ---
    Порядок важен (см. план image-пайплайна): сначала image-optimize
    (генерирует современные форматы ДО обработки HTML), затем
    HTML-трансформация в <picture>.

    1) image-optimize:
       • buildStart — для .jpg/.png из frontend/public/img генерирует
         .webp/.avif-сиблинги РЯДОМ с исходником (папка копируется в dist
         и в assets/ темы как есть). Сюда кладут картинки, на которые
         ссылаются по URL: CSS background-image с image-set(), og:image,
         разметка PHP-шаблонов.
       • closeBundle — дожимает jpg/png/svg в dist/img. WebP/AVIF исключены:
         их уже сгенерировал imgToPicture (см. ниже), повторное перекодирование
         только портило бы качество.
    2) imgToPicture: для каждого <img src="assets/images/*.jpg"> в HTML
       генерирует комплект вариантов (1x из 2x-исходника + 2x, AVIF/WebP/JP),
       оборачивает <img> в <picture> с <source> и пишет варианты в dist/img.
       • outputDir "img" — ОБЯЗАТЕЛЬНО относительный: собранный HTML
         открывается через file:// (base: './'), а check-build.js запрещает
         абсолютные пути к ассетам.
       • isRetinaSupport: true — исходники грузим в 2x, 1x-вариант плагин
         получает ресайзом пополам.
       • Картинки контента живут в frontend/src/assets/images/ (их сжимает
         compress-images.js, путь резолвит обертка njkImgToPicture). */
    imageOptimize({
      webpEnable: true,
      avifEnable: true,
      // Не перекодировать сгенерированные imgToPicture форматы в dist/img.
      exclude: ["**/*.webp", "**/*.avif"],
      logListings: true,
    }),

    imgToPicturePlugin,

    /*! --- SMART ASSETS (monorepo-пакет packages/vite-plugin-smart-assets) ---
    Phase 1, скелет: сканирует frontend/raw/ и роутит файлы КАК ЕСТЬ в плоскую
    структуру dist/assets/ (img/, icons/) + пишет assets-manifest.json в корень
    outDir. Источник и вывод НЕ пересекаются со старым пайплайном ниже
    (assets/images + public/img → dist/img), поэтому плагины работают
    ПАРАЛЛЕЛЬНО: выключать image-optimize/imgToPicture пока нельзя — на их
    артефактах завязаны разметка главной (boiler-demo) и picture-тесты
    (check-build тоже проверяет <picture> в dist). Когда smart-классификатор
    (Phase 2) заберет роутинг на себя, старые плагины будут отключены и
    frontend/src/assets/images + frontend/public/img мигрируют в frontend/raw. */
    !isWpBuild && smartAssets(),

    /*! --- ОБЕРТКА <IMG> В <PICTURE> ДЛЯ .NJK-СТРАНИЦ (см. выше) --- */
    njkImgToPicture(imgToPicturePlugin),

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
      // dist — обычная статическая сборка; в WP-режиме (build:wp) — сразу
      // в assets/ темы. emptyOutDir вычищает устаревшие хешированные файлы.
      outDir: isWpBuild ? wpAssetsDir : "dist",
      emptyOutDir: true,
      // manifest.json кладем в корень выходной папки, чтобы PHP-хелпер
      // get_asset() находил его по пути <theme>/assets/manifest.json
      // (и после build:wp, и после sync:theme из dist).
      manifest: "manifest.json",
      sourcemap: true,
      rollupOptions: {
        // Точки входа: все Nunjucks-страницы + JS-точка входа (см. collectRollupInputs).
        // В WP-режиме HTML не нужен (шаблоны рендерит PHP) — только JS-точка входа.
        input: isWpBuild
          ? { app: "frontend/src/js/app.js" }
          : collectRollupInputs(),
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
            // !ВСЕ картинки (jpg/png/svg/webp/avif/...) — в ПЛОСКУЮ img/:
            // никаких img/avif/, img/webp/ (совместимость с WP-плагинами).
            // get_asset() клеит путь из manifest.json к URL как есть,
            // strip-avif.js удаляет *.avif по маске **/*.avif — оба ожидают
            // одноуровневую структуру. imgToPicture и image-optimize тоже
            // пишут варианты рядом (outputDir + имя файла, без подпапок).
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