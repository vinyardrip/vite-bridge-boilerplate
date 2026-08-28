/*!
 * =================================================================================================
 * scripts/plugins/vite-html-asset-inject.js
 * =================================================================================================
 * Кастомный build-only Vite-плагин: инжекция собранных ассетов в финальный HTML.
 *
 * vite-plugin-njk-frontmatter отдаёт страницы как "сырые" HTML-ассеты
 * (this.emitFile), минуя transformIndexHtml. Поэтому вручную:
 *  1) убираем dev-скрипт Vite HMR client (на случай, если он останется в HTML);
 *  2) заменяем dev-ссылку на /src/js/app.js реальным бандлом;
 *  3) подключаем собранный CSS в <head>.
 *
 * Плагин регистрируется ПОСЛЕ nunjucks-плагина (см. vite.config.js), поэтому
 * generateBundle отработает после эмиссии HTML-ассетов.
 */

import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

/**
 * Помощник: реврайтинг ссылок на исходные ассеты (/src/...) в собранные.
 * njk-плагин эмитит HTML через emitFile, минуя transformIndexHtml, поэтому
 * Vite сам НЕ переписывает в нём ссылки на картинки — иначе в продакшн-HTML
 * попали бы "сырые" пути вида /src/assets/.... Здесь мы хешируем файл,
 * эмитим его как img/[name].[hash][extname] и подставляем относительный путь.
 *
 * @param {object}   ctx
 * @param {string}   ctx.html            Исходный HTML-код страницы
 * @param {string}   ctx.sourceRoot      Папка с исходниками (root Vite) — от неё резолвим /src/... пути
 * @param {(opts: object) => void} ctx.emitFile  Rollup emitFile (обёртка this.emitFile)
 * @param {Set<string>}    ctx.emittedAssetNames  Имена уже эмитированных ассетов (по страницам)
 * @param {Map<string, Buffer>} ctx.assetCache    Кеш содержимого по абсолютному пути
 * @returns {string} HTML с переписанными ссылками на ассеты
 */
function rewriteSourceAssetRefs({
  html,
  sourceRoot,
  emitFile,
  emittedAssetNames,
  assetCache,
}) {
  // Глобальный матчинг ЛЮБОГО пути /src/... независимо от аттрибута:
  // src, srcset (несколько URL через запятую), data-src, href,
  // inline style="background:url(...)" и т.п.
  return html.replace(/\/src\/[^"'\s,)]+/g, (url, offset, source) => {
    // Пропускаем /src/, являющийся ЧАСТЬЮ внешнего URL
    // (https://host/src/... или //host/src/...): реврайтить можно только
    // пути, начинающиеся с корня Vite.
    const before = offset > 0 ? source[offset - 1] : "";
    if (before === ":" || (before === "/" && source[offset - 2] === "/")) {
      return url;
    }
    // Не превращаем dev-скрипт /src/js/app.js в картинку: он заменяется
    // отдельным шагом ниже. Если он досюда дошёл — шаг замены не сработал,
    // и лучше оставить ссылку как есть (с предупреждением), чем
    // хешировать JS как img/....
    if (/\.(?:js|css)(?:[?#]|$)/i.test(url)) {
      console.warn(
        `[vite-html-asset-inject] Dev source reference detected in HTML asset rewrite: "${url}" — check app.js replacement in _default.njk.`,
      );
      return url;
    }
    // Отбрасываем query-строку/фрагмент (?v=2, #hash)
    const cleanUrl = url.split(/[?#]/, 1)[0];
    // URL /src/... резолвится от корня Vite (frontend/), поэтому убираем
    // только ведущий слеш: /src/assets/x.jpg -> frontend/src/assets/x.jpg
    const absPath = path.resolve(sourceRoot, cleanUrl.slice(1));
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      // Warn loudly (as in the other plugin guards) so a broken asset
      // link never ships to production silently.
      console.warn(
        `[vite-html-asset-inject] Could not bundle asset "${url}" — file not found: ${absPath}. Reference will be left as-is.`,
      );
      return url;
    }
    const ext = path.extname(absPath);
    const base = path.basename(absPath, ext);
    let content = assetCache.get(absPath);
    if (content === undefined) {
      content = fs.readFileSync(absPath);
      assetCache.set(absPath, content);
    }
    const hash = createHash("sha256").update(content).digest("hex").slice(0, 8);
    const fileName = `img/${base}.${hash}${ext}`;
    if (!emittedAssetNames.has(fileName)) {
      emittedAssetNames.add(fileName);
      emitFile({ type: "asset", fileName, source: content });
    }
    return `./${fileName}`;
  });
}

/**
 * Фабрика build-only плагина инжекции собранных ассетов в HTML.
 *
 * @param {object}  options
 * @param {string}  options.sourceRoot  Корень Vite (папка frontend/) — от него
 *                                      резолвятся /src/... пути в HTML.
 * @returns {import('vite').Plugin}
 */
export function htmlAssetInjectPlugin({ sourceRoot }) {
  return {
    name: "vite-html-asset-inject",
    generateBundle(_options, bundle) {
      // Помощник: реврайтинг ссылок на исходные ассеты (/src/...) в собранные.
      const emittedAssetNames = new Set();
      // Кеш содержимого по абсолютному пути: один и тот же файл читается
      // один раз, даже если на него ссылаются несколько страниц.
      const assetCache = new Map();
      const rewrite = (html) =>
        rewriteSourceAssetRefs({
          html,
          sourceRoot,
          emitFile: (opts) => this.emitFile(opts),
          emittedAssetNames,
          assetCache,
        });

      // Чанк, собранный из frontend/src/js/app.js
      const appChunk = Object.values(bundle).find(
        (out) =>
          out.type === "chunk" &&
          out.facadeModuleId &&
          out.facadeModuleId.replace(/\\/g, "/").endsWith("/frontend/src/js/app.js"),
      );

      // Все собранные CSS-файлы
      const cssFiles = Object.values(bundle)
        .filter((out) => out.type === "asset" && /\.css$/.test(out.fileName))
        .map((out) => out.fileName);

      // Guard against "silent" style loss: if the bundle has no CSS file
      // (e.g. the '../scss/app.scss' import was removed from app.js), warn
      // loudly instead of shipping unstyled pages.
      if (cssFiles.length === 0) {
        console.warn(
          "[vite-html-asset-inject] No CSS files in the bundle — check the styles import in frontend/src/js/app.js.",
        );
      }

      for (const [fileName, out] of Object.entries(bundle)) {
        if (out.type !== "asset" || !fileName.endsWith(".html")) continue;
        if (typeof out.source !== "string") continue;

        let html = out.source;

        // 1. Dev-only скрипт HMR-клиента
        html = html.replace(
          /<script type="module" src="http:\/\/localhost:5173\/@vite\/client"><\/script>/gi,
          "",
        );

        // 2. Dev-ссылка на исходник app.js -> собранный чанк
        //    (относительный путь, т.к. base: './'). Регэксп устойчив к
        //    форматированию (Prettier и т.п.): не требует точного совпадения
        //    всей строки, а лишь type="module" + src="/src/js/app.js".
        if (appChunk) {
          const devScriptRe =
            /<script\s+type="module"\s+src="\/src\/js\/app\.js"\s*><\/script>/i;
          if (devScriptRe.test(html)) {
            html = html.replace(
              devScriptRe,
              `<script type="module" crossorigin src="./${appChunk.fileName}"></script>`,
            );
          } else {
            // Fail loud rather than silently shipping a dev URL in production HTML.
            console.warn(
              `[vite-html-asset-inject] ${fileName}: dev reference to app.js not found — check the layout (_default.njk).`,
            );
          }
        } else {
          console.warn(
            "[vite-html-asset-inject] App chunk not found (frontend/src/js/app.js) — check rollupOptions.input.",
          );
        }

        // 3. Inject the favicon set and bundled CSS into <head>
        //    (relative paths, since base: './').
        //    The favicon set (favicon.svg, favicon.ico, favicon-32x32.png,
        //    apple-touch-icon.png, icon-192.png, icon-512.png) is generated
        //    by scripts/generate-favicons.js into favicons/ of the build
        //    target AFTER `vite build` — tags reference these deterministic
        //    file names (all inside favicons/, build root stays clean).
        //    IMPORTANT: this list must stay in sync with the icons config
        //    in scripts/generate-favicons.js (favicons/android/appleIcon).
        //    The PWA manifest is emitted separately at the build root by
        //    vite-plugin-pwa (see scripts/plugins/pwa.js).
        const faviconTags = [
          `<link rel="icon" type="image/svg+xml" href="favicons/favicon.svg">`,
          `<link rel="icon" type="image/png" sizes="32x32" href="favicons/favicon-32x32.png">`,
          `<link rel="shortcut icon" href="favicons/favicon.ico">`,
          `<link rel="apple-touch-icon" sizes="180x180" href="favicons/apple-touch-icon.png">`,
          `<link rel="icon" type="image/png" sizes="192x192" href="favicons/icon-192.png">`,
          `<link rel="icon" type="image/png" sizes="512x512" href="favicons/icon-512.png">`,
          `<link rel="manifest" href="manifest.json">`,
          `<meta name="theme-color" content="#3b4b66">`,
        ].map((tag) => `    ${tag}`);
        const cssLinks = cssFiles.map(
          (file) => `    <link rel="stylesheet" href="./${file}">`,
        );
        const headExtras = [...faviconTags, ...cssLinks];
        if (headExtras.length > 0) {
          html = html.replace(
            "</head>",
            `${headExtras.join("\n")}\n  </head>`,
          );
        }

        // 4. Реврайтинг исходных путей ассетов (/src/...) на собранные.
        //    Выполняется ПОСЛЕ замены dev-скрипта app.js, чтобы не зацепить
        //    ссылку <script src="/src/js/app.js">.
        html = rewrite(html);

        out.source = html;
      }
    },
  };
}
