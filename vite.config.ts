/*!
 * =================================================================================================
 * vite.config.ts
 * =================================================================================================
 *
 * Главный конфигурационный файл для сборщика Vite.
 * Источник правды для всей frontend-сборки.
 *
 * =================================================================================================
 */

import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { globSync } from "glob";
import { visualizer } from "rollup-plugin-visualizer";

import { nunjucksFrontMatterPlugin } from "vite-plugin-njk-frontmatter";
import viteNjkTrace from "vite-njk-trace";

import { imagetools } from "vite-imagetools";
import webfontDl from "vite-plugin-webfont-dl";

import { smartAssets } from "vite-plugin-smart-assets";
// projectSvg — проекция записи SVG-манифеста в HTML (<svg> / <use> / <img>),
// ГЛУБОКИЙ импорт: точка входа пакета экспортирует только smartAssets.
// Пакет мигрирован на TypeScript (шаг 2) — импортируем .ts-исходник.
import { projectSvg } from "vite-plugin-smart-assets/src/svg/project.ts";
import type { AssetOptions } from "vite-plugin-smart-assets/src/types.ts";
// import { VitePWA } from "vite-plugin-pwa";
import { FontaineTransform } from "fontaine";

/*! --- SAFE-ОБЕРТКА ДЛЯ ФИЛЬТРОВ NUNJUCKS ---
Макросы ui.icon()/ui.picture() должны возвращать готовый HTML БЕЗ | safe.
autoescape у njk-frontmatter включен — «сырую» строку фильтра он экранирует.
Nunjucks не экранирует значения типа SafeString, поэтому фильтры возвращают
SafeString ТОЙ ЖЕ копии nunjucks, которую грузит плагин шаблонов
(peer-зависимость vite-plugin-njk-frontmatter, объявлена в корневых
devDependencies — pnpm ставит один модуль в .pnpm, instanceof сходится). */
const nunjucksRuntime = createRequire(
  path.resolve(process.cwd(), "package.json"),
)("nunjucks").runtime;
const safe = (html: unknown) => new nunjucksRuntime.SafeString(String(html));

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
  // !DEV-ONLY СТРАНИЦЫ: не попадают в production-сборку. Страница остается
  // доступной в `pnpm dev` через middleware vite-plugin-njk-frontmatter,
  // но .html-файл не эмитится в dist. test-fonts — инструмент диагностики
  // шрифтов: в собранном виде он не работает (JS отключен проверкой
  // site.production) и на проде не нужен. styleguide в dist собирается
  // намеренно — это витрина компонентов.
  const DEV_ONLY_PAGES = new Set(["dev-dashboard", "test-fonts"]);
  const pages = globSync("frontend/src/views/pages/*.njk").filter(
    (file) => !DEV_ONLY_PAGES.has(path.basename(file, path.extname(file))),
  );
  const entries = [...pages, "frontend/src/js/app.ts"];

  return Object.fromEntries(
    entries.map((file) => [path.basename(file, path.extname(file)), file]),
  );
};

/*!
 * Локальный плагин (только dev): «красивые» URL для dev-страниц.
 *
 * Middleware vite-plugin-njk-frontmatter отдает страницы .njk только по
 * путям с расширением (/pages/dev-dashboard.html), а его плагин имеет
 * enforce: "pre" — его middleware регистрируется раньше middleware
 * обычных (без enforce) плагинов. Поэтому этот плагин тоже объявлен с
 * enforce: "pre" И В МАССИВЕ РАНЬШЕ njk-плагина: иначе rewrite срабатывает
 * слишком поздно и расширless-URL остаются 404 (проверено).
 *
 * Правила rewrite:
 *   - только GET и путь из ОДНОГО сегмента без точки (ассеты /frontend/...,
 *     /assets/... и т.п. не задеты);
 *   - rewrite только если frontend/src/views/pages/<slug>.njk существует
 *     (проверка на каждый запрос — новые страницы подхватываются без
 *     рестарта сервера);
 *   - /dev-dashboard → /dev-dashboard.html (та же схема, что у плагина);
 *   - apply: "serve" — в production-сборке плагин не участвует.
 */
const njkPrettyUrlsPlugin = (): Plugin => ({
  name: "vite-njk-pretty-urls",
  enforce: "pre",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (!req.url || req.method !== "GET") return next();
      const { pathname, search } = new URL(req.url, "http://localhost");
      const match = pathname.match(/^\/([A-Za-z0-9][A-Za-z0-9_-]*)$/);
      if (!match) return next();
      const slug = match[1];
      const pageFile = path.resolve(
        __dirname,
        "frontend/src/views/pages",
        `${slug}.njk`,
      );
      if (!fs.existsSync(pageFile)) return next();
      req.url = `/${slug}.html${search}`;
      next();
    });
  },
});

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
const injectTagsIntoNjkHtml = (): Plugin => ({
  name: "inject-tags-into-njk-html",
  enforce: "post",
  apply: "build",
  generateBundle(_, bundle) {
    const htmlFiles = Object.values(bundle).filter(
      (file): file is Extract<(typeof bundle)[string], { type: "asset" }> =>
        file.type === "asset" && file.fileName.endsWith(".html"),
    );
    if (htmlFiles.length === 0) {
      return;
    }

    const appChunk = Object.values(bundle).find(
      (file): file is Extract<(typeof bundle)[string], { type: "chunk" }> =>
        file.type === "chunk" &&
        file.isEntry &&
        (file.facadeModuleId?.replace(/\\/g, "/").endsWith("js/app.ts") ?? false),
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
      const rel = (assetPath: string) =>
        path.posix.relative(htmlDir, assetPath) || path.posix.basename(assetPath);

      let source = String(html.source);

      if (appChunk) {
        source = source.replace(
          /src="\/frontend\/src\/js\/app\.ts"/g,
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
const removeOrphanSourcemaps = (): Plugin => ({
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

  /*! --- SMART ASSETS — единственный image-пайплайн проекта ---
  Локальный пакет packages/vite-plugin-smart-assets (workspace). Сканирует
  frontend/raw/ на buildStart (до рендера .njk и компиляции Sass): хеширует
  контент (name.<hash>.<ext>), генерирует webp/avif (quality 80) и
  retina-пары @2x (исходники шире 800px считаются 2x), пишет
  assets-manifest.json + сгенерированную Sass-карту для bgset().
  Разметка <picture> — ЯВНО через макрос ui.picture() (фильтр smartPicture),
  CSS-фоны — через токены smart-asset: (подмена в generateBundle).
  СТАРЫЙ пайплайн (image-optimize + img-to-picture + обертка njkImgToPicture)
  снят с производства на этом этапе (Phase 3).

  !SCOPE: статика — "assets" (dist/assets/img, dist/assets/icons);
  WP-сборка — "" (файлы прямо в <тема>/assets/img — плоская структура,
  требование совместимости с WP-плагинами и strip-avif.js). Один экземпляр
  на конфиг: фильтры Nunjucks и hooks делят одно состояние. */
  const smartAssetsPlugin = smartAssets({ scope: isWpBuild ? "" : "assets" });

  /*! --- ФИЛЬТР NUNJUCKS: SVG-ИКОНКИ ИЗ МАНИФЕСТА (используется макросом ui.icon) ---
  Находит запись SVG в манифесте smart-assets по имени файла в frontend/raw/
  (без расширения) и проецирует ее в HTML через projectSvg пакета:
    • mode inline  — нормализованный <svg> целиком (содержимое из состояния
      плагина — оно посчитано в buildStart, ДО рендера шаблонов);
    • mode sprite  — <svg><use href="sprite.<hash>.svg#symbol"></use></svg>;
    • mode img     — <img> для SVG-иллюстраций/анимаций.
  Записи нет → fail-fast: сборка падает с именем иконки (без «молчаливых»
  дырок в разметке). Возвращаем SafeString — макросу | safe не нужен. */
  const smartSvg = (name: string, options?: AssetOptions | null, className?: string) => {
    const entry = smartAssetsPlugin.svgEntry(name);
    if (!entry) {
      throw new Error(
        `Icon not found: ${name} — нет frontend/raw/${name}.svg ` +
          `(или файл не распознан конвейером SVG; детали выше в логе плагина)`,
      );
    }
    const iconOptions = { ...(options ?? {}) };
    if (className && iconOptions.class === undefined) {
      iconOptions.class = className;
    }
    return safe(projectSvg(entry, iconOptions, smartAssetsPlugin.svgInlineContent(entry)));
  };

  const plugins = [
    // Fontaine должен идти первым: подменяет @font-face на fallback-метрики.
    FontaineTransform.vite({
      // Типы fontaine описывают fallbacks как string[] (stale) — рантайм принимает
      // Record<семейство, фолбэки>; cast к параметру фабрики.
      fallbacks: {
        "JetBrains Mono": ["Courier New", "monospace"],
        Spectral: ["Georgia", "serif"],
        "Spectral SC": ["Georgia", "serif"],
      },
    } as unknown as Parameters<typeof FontaineTransform.vite>[0]),

    /*! --- DEV-ONLY PRETTY URLS (/dev-dashboard → /dev-dashboard.html) --- */
    // Должен стоять В МАССИВЕ ДО nunjucksFrontMatterPlugin — см. комментарий
    // у njkPrettyUrlsPlugin (порядок регистрации middleware критичен).
    njkPrettyUrlsPlugin(),

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
        // SVG-иконки/иллюстрации из манифеста smart-assets (макрос ui.icon в _ui.njk).
        smartSvg,
        // <picture> из состояния smart-assets (макрос ui.picture в _ui.njk).
        smartPicture: (name: string, opts?: Record<string, string>) =>
          safe(smartAssetsPlugin.pictureHtml(name, opts ?? {})),
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
    Плагин vite-plugin-svg-sprite намеренно отключен: спрайты собирает
    smart-assets (mode: sprite → assets/icons/sprite.<hash>.svg), исходники
    иконок живут в frontend/raw/, вывод в шаблонах — макрос ui.icon(). */

    imagetools(),

    /*! --- КАРТИНКИ: SMART ASSETS (экземпляр создан выше, до plugins) ---
    Работает в обоих режимах: build (dist/assets/...) и wordpress
    (<тема>/assets/img — плоско). Изображения в шаблонах — через макрос
    ui.picture(), CSS-фоны — через bgset() + сгенерированную карту путей. */
    smartAssetsPlugin,

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
      // Типы webfont-dl не описывают google/custom (рантайм читает их) —
      // cast к параметру фабрики.
    } as unknown as Parameters<typeof webfontDl>[0]),

    /*! --- PWA (отключен по умолчанию) ---
    Чтобы включить PWA: 1) раскомментируйте импорт vite-plugin-pwa вверху
    файла; 2) раскомментируйте ОДИН из вариантов VitePWA ниже; 3) иконки
    генерируются командой `pnpm favicons:generate` (vite.config.ts —
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

  /*! --- УСЛОВНОЕ ПОДКЛЮЧЕНИЕ АНАЛИЗАТОРА СБОРКИ ---
  Только при ANALYZE=true (pnpm build:stats). Строгое сравнение со строкой:
  любая непустая строка или true в bash превращаются в строку "true",
  поэтому сравниваем именно с ней. stats.html пишется в dist/ — в обычной
  сборке (без ANALYZE) файл не создается, чтобы не засорять прод. */
  if (process.env.ANALYZE === "true") {
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
          ? { app: "frontend/src/js/app.ts" }
          : collectRollupInputs(),
        output: {
          entryFileNames: "js/[name].[hash].js",
          chunkFileNames: "js/chunk.[hash].js",
          assetFileNames: (assetInfo) => {
            // ?ИСПРАВЛЕНО: Заменено устаревшее свойство `assetInfo.name` на `assetInfo.fileName`
            // для соответствия последним версиям Rollup (используется в Vite).
            // Добавлен fallback `|| assetInfo.name` для максимальной обратной совместимости.
            // Rollup-типы больше не содержат legacy fileName/name, но рантайм их
            // кладет (иначе extType был бы undefined и CSS шел бы в корень) —
            // cast к фактической форме объекта, поведение без изменений.
            const legacy = assetInfo as unknown as { fileName?: string; name?: string };
            const extType = (legacy.fileName || legacy.name)!
              .split(".")
              .pop()!;

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
              // Шрифты: dist — в assets/fonts/ (консолидация статики рядом
              // с assets/img и assets/icons от smart-assets/public);
              // WP — ПЛОСКО в fonts/ (outDir уже <тема>/assets/, префикс
              // "assets/" дал бы assets/assets/fonts/).
              return isWpBuild
                ? "fonts/[name].[hash][extname]"
                : "assets/fonts/[name].[hash][extname]";
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