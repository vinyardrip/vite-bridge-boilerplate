/**
 * =================================================================================================
 * vite-plugin-smart-assets — Phase 3: роутинг + sharp + хеширование + retina
 * =================================================================================================
 *
 * Единственная точка входа для картинок проекта: сканирует каталог-источник
 * (по умолчанию frontend/raw/), обрабатывает sharp'ом, хеширует и раздает
 * по маршрутам в outDir + пишет assets-manifest.json.
 *
 * Маршруты:
 *   .jpg/.jpeg/.png → [scope/]img/  + варианты webp/avif (quality 80, альфа PNG
 *                     сохраняется) + retina-пара для широких исходников;
 *   .svg            → SVG-конвейер (svg/pipeline.js, шаг 8): normalize →
 *                     classify → inline ([scope/]ui/) / sprite
 *                     ([scope/]icons/sprite.<hash>.svg) / img
 *                     ([scope/]img/<stem>.<hash>.svg).
 *
 * ИМЕНА: `name.<hash>.<ext>` и `name.<hash>@2x.<ext>` — hash это первые 8 hex
 * символов sha256 ИСХОДНОГО файла (у всех вариантов одного источника хеш общий,
 * поэтому серия переезжает вместе при изменении любой части).
 *
 * RETINA: исходник шире RETINA_MIN_WIDTH считается 2x-исходником (конвенция
 * проекта «в raw/ кладут 2x»). Тогда:
 *   • `name.<hash>@2x.<ext>` — исходные байты без перекодирования;
 *   • `name.<hash>.<ext>` — 1x, ресайз до половины ширины (+ webp/avif от него);
 *   • манифест помечает варианты дескрипторами srcset "1x"/"2x".
 * Исходники <= порога — одна серия (нативное разрешение, дескриптор "1x").
 *
 * ИНТЕГРАЦИЯ С ШАБЛОНАМИ И SCSS (тайминг — главное):
 * вся обработка происходит в `buildStart` (ДО рендера Nunjucks и компиляции
 * Sass, которые идут в фазе transform):
 *
 *   1. Nunjucks: проект регистрирует фильтр-обертку над pictureHtml() —
 *      макрос ui.picture() рендерит готовую <picture>-разметку из состояния.
 *
 *   2. SCSS: плагин пишет сгенерированный файл (по умолчанию
 *      frontend/src/scss/generated/_smart-assets-map.scss) с картой путей и
 *      функцией smart-asset-url($name, $format). Миксин bgset() зовет её, а не
 *      пишет url() путями сборочных артефактов напрямую — Vite пытается
 *      резолвить url() в CSS на этапе transform, а файлов еще нет.
 *      • build: функция возвращает ТОКЕН url(smart-asset:name:format) —
 *        схемо-подобный URL, который Vite не трогает; generateBundle заменяет
 *        токены на реальные относительные пути в каждом .css-артефакте;
 *      • dev: функция возвращает абсолютный /<scope>/... — их отдает
 *        middleware из памяти (сборки в dev нет).
 *
 *   3. dev-сервер: configureServer считает состояние на старте, раздает файлы
 *      из памяти и следит за raw/ (watcher) — при изменениях пересчитывает и
 *      посылает full-reload.
 *
 * assets-manifest.json: { plugin, version, rawDir, entries: [...] }. У растра:
 * { source, output, type, hash, retina, width, height, size, variants:
 *   [ { path, format, descriptor, width, height } ] } (format — исходное
 * расширение + webp/avif; descriptor "1x"/"2x" — готовые srcset-дескрипторы).
 * У SVG (шаг 8): { source, file, kind, mode, symbol?, hash } — фрагмент
 * processSvgBatch смержен в общий entries через mergeSvgManifest.
 *
 * Принципы (унаследованы от проекта):
 *   • ошибка sharp на одном файле НЕ роняет сборку — предупреждение + файл
 *     маршрутизируется оригиналом без вариантов;
 *   • отсутствие каталога-источника НЕ роняет сборку — предупреждение;
 *   • коллизии выходных имен разрешаются в пользу файла-источника;
 *   • dotfiles (.gitkeep) не маршрутизируются; подпапки raw/ сохраняются.
 *
 * Ограничения Phase 3 (осознанные): ресайз только по ширине, без w-дескрипторов
 * srcset/sizes и без ролей (bg/icon/content); <picture> из pictureHtml
 * рассчитан на страницы в корне outDir (текущая конвенция проекта).
 * =================================================================================================
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

import sharp from "sharp";

import { mergeSvgManifest } from "./svg/build-manifest.js";
import { processSvgBatch } from "./svg/pipeline.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

/** Маршруты: расширения → папка внутри scope, тип записи, нужен ли sharp-конвейер. */
const ROUTES = {
  img: { extensions: [".jpg", ".jpeg", ".png"], folder: "img", type: "img", raster: true },
};

/** Расширение, которое уходит в SVG-конвейер (pipeline.js), а не в ROUTES. */
const SVG_EXTENSION = ".svg";

/** Исходник шире этого (px) считается 2x-исходником (конвенция «в raw/ кладут 2x»). */
const RETINA_MIN_WIDTH = 800;

/** Длина контентного хеша в имени файла (как у Vite). */
const HASH_LENGTH = 8;

/** Расширение файла → формат sharp для toFormat(). */
const SHARP_FORMAT = { ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png" };

const MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

/** Современные форматы, генерируемые рядом с оригиналом (качество — конвенция проекта). */
const MODERN_FORMATS = [
  { format: "webp", quality: 80 },
  { format: "avif", quality: 80 },
];

/** Форматы, попадающие в <img>-фолбэк pictureHtml (не в <source>). */
const FALLBACK_FORMATS = new Set(["jpg", "jpeg", "png"]);

/** Токен в CSS до подстановки: url(smart-asset:hero:avif) — схемо-подобный URL, Vite его не резолвит.
 *  Vite ребейзит неизвестный url() относительно каталога sass-исходника, поэтому
 *  в собранном CSS перед схемой может быть путь-префикс (url(generated/smart-asset:…)) —
 *  жадный префикс [./w/-] допускает его (и отсутствие), схема остается якорем. */
const CSS_TOKEN_RE = /url\((['"]?)[.\w/-]*?smart-asset:([a-zA-Z0-9._-]+):([a-z0-9]+)\1\)/g;

const toPosix = (p) => p.split(path.sep).join("/");

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

const contentHash = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex").slice(0, HASH_LENGTH);

/**
 * Создает Vite-плагин smart-assets.
 *
 * @param {object}  [options]
 * @param {string}  [options.rawDir="frontend/raw"]   Каталог-источник (относительно корня сборки).
 * @param {string}  [options.scope="assets"]          Каталог внутри outDir для маршрутов
 *                                                    (статика: "assets" → dist/assets/img; WP-сборка
 *                                                    проекта передает "" → <тема>/assets/img, плоско).
 * @param {string}  [options.manifestFile="assets-manifest.json"] Имя манифеста в корне outDir.
 * @param {string}  [options.generatedScssFile="frontend/src/scss/generated/_smart-assets-map.scss"]
 *                                                    Куда писать Sass-карту путей + smart-asset-url().
 * @returns {import("vite").Plugin & { entry(name: string): object|undefined, pictureHtml(name: string, opts?: object): string }}
 */
export function smartAssets(options = {}) {
  const rawDir = options.rawDir ?? "frontend/raw";
  const scope = options.scope ?? "assets";
  const manifestFile = options.manifestFile ?? "assets-manifest.json";
  const generatedScssFile =
    options.generatedScssFile ?? "frontend/src/scss/generated/_smart-assets-map.scss";

  const dirFor = (route) => (scope ? `${scope}/` : "") + route.folder;

  /** command из configResolved: "build" → токены, "serve" → абсолютные dev-URL. */
  let command = "build";

  /** Состояние: считается в buildStart/configureServer, читается фильтрами и generateBundle. */
  const state = {
    ready: false,
    manifest: null,
    /** output path → Buffer (эмиты в build + dev-middleware). */
    files: new Map(),
    /** имя без расширения → entry (API pictureHtml/entry). */
    byName: new Map(),
    /** SVG-конвейер (шаг 8): [{ fileName, content }] + фрагмент манифеста. */
    svgOutputs: [],
    svgManifest: { entries: [] },
  };

  /*!
   * Полный цикл: скан raw/ → хеш → retina-решение → sharp-варианты → состояние
   * + сгенерированная Sass-карта. Идемпотентно (state.ready).
   */
  async function ensureProcessed() {
    if (state.ready) {
      return;
    }

    if (!fs.existsSync(rawDir)) {
      fs.mkdirSync(rawDir, { recursive: true });
      console.warn(
        `[smart-assets] каталог "${rawDir}" не найден — создан. ` +
          `Положите ассеты и пересоберите.`,
      );
    }

    const manifest = {
      plugin: "vite-plugin-smart-assets",
      version,
      rawDir: toPosix(rawDir),
      entries: [],
    };
    const usedOutputs = new Set();
    let variantCount = 0;
    let retinaCount = 0;

    const found = fs
      .readdirSync(rawDir, { recursive: true })
      .filter((rel) => {
        const abs = path.join(rawDir, rel);
        // Только файлы; скрытые (.gitkeep и т.п.) не маршрутизируем.
        return fs.statSync(abs).isFile() && !path.basename(rel).startsWith(".");
      })
      .sort();

    // SVG уходит в свой конвейер (шаг 8), остальное — в растровые маршруты.
    const svgFiles = found.filter((rel) => path.extname(rel).toLowerCase() === SVG_EXTENSION);
    const rasterFiles = found.filter((rel) => path.extname(rel).toLowerCase() !== SVG_EXTENSION);

    for (const rel of rasterFiles) {
      const ext = path.extname(rel).toLowerCase();
      const routeKey = Object.keys(ROUTES).find((key) =>
        ROUTES[key].extensions.includes(ext),
      );

      if (!routeKey) {
        console.warn(
          `[smart-assets] пропущен "${toPosix(rel)}": расширение "${ext}" не маршрутизируется`,
        );
        continue;
      }

      const route = ROUTES[routeKey];
      const abs = path.join(rawDir, rel);
      const source = fs.readFileSync(abs);
      const hash = contentHash(source);
      const relPosix = toPosix(rel);
      const dir = dirFor(route);
      const stem = relPosix.slice(0, -ext.length); // "sub/hero" — подпапки сохраняются
      const nameFor = (suffix, format) => `${dir}/${stem}${suffix}.${format}`;

      const entry = {
        source: path.posix.join(toPosix(rawDir), relPosix),
        type: route.type,
        hash,
        size: source.length,
      };
      const variants = [];
      const addVariant = (fileName, format, descriptor, width, height, buffer) => {
        if (usedOutputs.has(fileName)) {
          console.warn(
            `[smart-assets] вариант ${format} (${descriptor}) для "${relPosix}" пропущен: ` +
              `имя "${fileName}" уже занято`,
          );
          return;
        }
        state.files.set(fileName, buffer);
        usedOutputs.add(fileName);
        variants.push({ path: fileName, format, descriptor, width, height });
      };

      if (!route.raster) {
        // SVG: копия как есть (с хешем), конвертация не нужна.
        const output = nameFor(`.${hash}`, ext.slice(1));
        addVariant(output, ext.slice(1), "1x", null, null, source);
        entry.output = output;
      } else {
        // Растр: sharp-метаданные → retina-решение → серии форматов.
        try {
          const meta = await sharp(source).metadata();
          const retina = meta.width > RETINA_MIN_WIDTH;
          const oneWidth = retina ? Math.max(1, Math.round(meta.width / 2)) : meta.width;
          const dims = (width) => ({
            width,
            height: Math.round((width * meta.height) / meta.width),
          });

          const encode = async (format, width) => {
            let pipeline = sharp(source);
            if (width) {
              pipeline = pipeline.resize({ width });
            }
            const { quality } =
              MODERN_FORMATS.find((f) => f.format === format) ?? { quality: 80 };
            return pipeline.toFormat(format, { quality }).toBuffer();
          };

          // Серия исходного формата: 2x — исходные байты без перекодирования,
          // 1x — ресайз с перекодированием (только при retina-исходнике).
          if (retina) {
            const two = dims(meta.width);
            addVariant(
              nameFor(`.${hash}@2x`, ext.slice(1)),
              ext.slice(1),
              "2x",
              two.width,
              two.height,
              source,
            );
          }
          const one = dims(oneWidth);
          const oneBuffer = retina
            ? await sharp(source)
                .resize({ width: oneWidth })
                .toFormat(SHARP_FORMAT[ext], { quality: 80 })
                .toBuffer()
            : source;
          addVariant(
            nameFor(`.${hash}`, ext.slice(1)),
            ext.slice(1),
            "1x",
            one.width,
            one.height,
            oneBuffer,
          );

          // Современные форматы: 2x — от полного исходника, 1x — с ресайза.
          for (const { format } of MODERN_FORMATS) {
            if (retina) {
              const two = dims(meta.width);
              addVariant(
                nameFor(`.${hash}@2x`, format),
                format,
                "2x",
                two.width,
                two.height,
                await encode(format, null),
              );
            }
            const oneDims = dims(oneWidth);
            addVariant(
              nameFor(`.${hash}`, format),
              format,
              "1x",
              oneDims.width,
              oneDims.height,
              await encode(format, retina ? oneWidth : null),
            );
          }

          const primary = variants.find(
            (v) => v.format === ext.slice(1) && v.descriptor === "1x",
          );
          entry.retina = retina;
          entry.width = primary.width;
          entry.height = primary.height;
          entry.output = primary.path;
          variantCount += variants.length - 1;
          if (retina) {
            retinaCount += 1;
          }
        } catch (error) {
          // Принцип проекта: один битый файл не роняет сборку.
          console.warn(
            `[smart-assets] "${relPosix}" не обработан sharp (${error.message}) — ` +
              `маршрутизирую оригинал без вариантов`,
          );
          const output = nameFor(`.${hash}`, ext.slice(1));
          addVariant(output, ext.slice(1), "1x", null, null, source);
          entry.output = output;
        }
      }

      entry.variants = variants;
      manifest.entries.push(entry);

      const byName = path.basename(relPosix, ext);
      if (state.byName.has(byName)) {
        console.warn(
          `[smart-assets] дубликат basename "${byName}" в ${toPosix(rawDir)} — ` +
            `фильтры smartPicture/bgset будут находить только первый`,
        );
      } else {
        state.byName.set(byName, entry);
      }
    }

    // SVG-конвейер (шаг 8): normalize → classify → inline/sprite/img + манифест.
    if (svgFiles.length > 0) {
      const svgResult = await processSvgBatch(
        svgFiles.map((rel) => path.join(rawDir, rel)),
        { rawDir, scope },
      );
      state.svgOutputs = svgResult.outputs;
      state.svgManifest = svgResult.manifest;
      // В общий files: generateBundle эмитит, dev-middleware раздает
      // (полный ре-ран при изменении raw/ уже делает onChange → invalidate).
      for (const { fileName, content } of svgResult.outputs) {
        state.files.set(fileName, Buffer.from(content, "utf8"));
      }
    }

    manifest.entries.sort((a, b) => a.source.localeCompare(b.source));
    state.manifest = manifest;
    state.ready = true;

    const imgEntries = manifest.entries.filter((e) => e.type === "img").length;
    const svgCount = state.svgManifest.entries.length;
    console.log(
      `[smart-assets] ${manifest.entries.length + svgCount} файл(ов) из ${toPosix(rawDir)}: ` +
        `${imgEntries} img (+${variantCount} вариантов, ${retinaCount} retina), ` +
        `${svgCount} svg (inline/sprite/img по конвейеру)`,
    );
  }

  /*!
   * Сгенерированный SCSS для bgset(): карта «имя → формат → путь относительно
   * корня outDir» + функция smart-asset-url($name, $format). Функция знает режим:
   * build возвращает ТОКЕН url(smart-asset:name:format) (Vite не резолвит
   * схемо-подобные URL; generateBundle подставит реальные пути), serve —
   * абсолютный /<scope>/... (отдает middleware).
   */
  function writeGeneratedScss() {
    const rasterEntries = state.manifest.entries.filter(
      (e) => e.type === "img" && e.variants.length > 0,
    );
    const body = rasterEntries
      .map((entry) => {
        const formats = entry.variants.filter((v) => v.descriptor === "1x");
        const lines = formats.map((v) => `    "${v.format}": "${v.path}",`).join("\n");
        return `  "${path.basename(entry.source, path.extname(entry.source))}": (\n${lines}\n  ),`;
      })
      .join("\n");

    const urlBody =
      command === "serve"
        ? `  $formats: map.get($smart-assets-map, $name);\n` +
          `  @if not $formats {\n` +
          `    @warn "[smart-assets] bgset: ассет ` +
          `'#{$name}' не найден в frontend/raw/";\n` +
          `    @return url("about:blank");\n` +
          `  }\n` +
          `  @return url("/" + map.get($formats, $format));`
        : `  @if not map.has-key($smart-assets-map, $name) {\n` +
          `    @warn "[smart-assets] bgset: ассет ` +
          `'#{$name}' не найден в frontend/raw/";\n` +
          `  }\n` +
          `  @return url(smart-asset:#{$name}:#{$format});`;

    const content =
      `// !GENERATED: vite-plugin-smart-assets v${version} — не редактировать,\n` +
      `// перезаписывается при старте сборки/dev-сервера (buildStart/configureServer).\n` +
      `// Пути относительно КОРНЯ outDir. Функция smart-asset-url() зависит от режима:\n` +
      `// build — токен smart-asset: (подменяется в generateBundle), serve — /${scope}/...\n` +
      `@use "sass:map";\n\n` +
      (body ? `$smart-assets-map: (\n${body}\n);\n\n` : `$smart-assets-map: ();\n\n`) +
      `@function smart-asset-url($name, $format) {\n${urlBody}\n}\n`;

    fs.mkdirSync(path.dirname(generatedScssFile), { recursive: true });
    fs.writeFileSync(generatedScssFile, content, "utf8");
  }

  async function ensureReady() {
    if (!state.ready) {
      await ensureProcessed();
      writeGeneratedScss();
    }
  }

  /*! Сброс для dev-ватчера: пересчитать при изменениях в raw/. */
  function invalidate() {
    state.ready = false;
    state.manifest = null;
    state.files.clear();
    state.byName.clear();
    state.svgOutputs = [];
    state.svgManifest = { entries: [] };
  }

  /*!
   * Подмена токенов url(smart-asset:name:format) на реальные пути в собранных
   * CSS-артефактах. Путь вычисляется ОТНОСИТЕЛЬНО каталога css-файла
   * (css/app.*.css → ../assets/img/...; в WP-сборке → ../img/...).
   */
  function replaceCssTokens(source, cssFileName) {
    return String(source).replace(CSS_TOKEN_RE, (match, _quote, name, format) => {
      const entry = state.byName.get(name);
      const variant = entry?.variants.find(
        (v) => v.format === format && v.descriptor === "1x",
      );
      if (!variant) {
        console.warn(
          `[smart-assets] CSS-токен "${name}:${format}" не разрешен (нет ассета/формата) — ` +
            `остался в ${cssFileName}`,
        );
        return match;
      }
      const rel = path.posix.relative(path.posix.dirname(cssFileName), variant.path);
      return `url("${rel}")`;
    });
  }

  const plugin = {
    name: "vite-plugin-smart-assets",

    configResolved(config) {
      command = config.command;
    },

    async buildStart() {
      // Считаем все ДО рендера Nunjucks и компиляции Sass (фаза transform).
      await ensureReady();
    },

    async configureServer(server) {
      // Dev: сборки нет — считаем на старте, раздаем файлы из памяти,
      // следим за raw/ (пересчет + full-reload при изменениях).
      await ensureReady();

      const prefix = `/${scope}/`;
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0]);
        if (!url.startsWith(prefix)) {
          next();
          return;
        }
        const key = url.slice(1);
        const buffer = state.files.get(key);
        if (!buffer) {
          next();
          return;
        }
        res.setHeader(
          "Content-Type",
          MIME[path.extname(key).slice(1)] ?? "application/octet-stream",
        );
        res.setHeader("Cache-Control", "no-cache");
        res.end(buffer);
      });

      server.watcher.add(path.resolve(rawDir));
      const onChange = async (file) => {
        if (!path.resolve(file).startsWith(path.resolve(rawDir))) {
          return;
        }
        console.log(`[smart-assets] изменение в ${toPosix(rawDir)} — пересчитываю`);
        invalidate();
        await ensureReady();
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", onChange);
      server.watcher.on("change", onChange);
      server.watcher.on("unlink", onChange);
    },

    async generateBundle(_options, bundle) {
      await ensureReady();

      // Файлы (растр + SVG-конвейер) + манифест.
      for (const [fileName, buffer] of state.files) {
        this.emitFile({ type: "asset", fileName, source: buffer });
      }
      this.emitFile({
        type: "asset",
        fileName: manifestFile,
        source: JSON.stringify(mergeSvgManifest(state.manifest, state.svgManifest), null, 2),
      });

      // Подмена CSS-токенов (после эмитов — обычный паттерн проекта,
      // как injectTagsIntoNjkHtml: правим source готовых ассетов).
      for (const file of Object.values(bundle)) {
        if (file.type === "asset" && file.fileName.endsWith(".css")) {
          file.source = replaceCssTokens(file.source, file.fileName);
        }
      }
    },

    /*!
     * API для Nunjucks-фильтров (vite.config.js): запись манифеста по имени
     * файла в raw/ без расширения.
     * @param {string} name
     */
    entry(name) {
      return state.byName.get(name);
    },

    /*!
     * Готовая <picture>-разметка по имени ассета: <source> AVIF/WebP с
     * retina-парами (srcset 1x/2x) + <img>-фолбэк исходного формата с
     * размерами 1x (анти-CLS) и alt. Замена снятого njkImgToPicture:
     * разметка теперь ЯВНАЯ — шаблон зовет макрос, а не полагается на
     * постобработку HTML.
     * @param {string} name Имя файла в raw/ без расширения.
     * @param {object} [opts] { alt, imgClass, loading, decoding }
     */
    pictureHtml(name, { alt = "", imgClass = "", loading = "lazy", decoding = "async" } = {}) {
      const entry = state.byName.get(name);
      if (!entry || entry.type !== "img") {
        console.warn(
          `[smart-assets] smartPicture: ассет "${name}" не найден в ${toPosix(rawDir)}`,
        );
        return `<!-- smart-assets: ассет "${name}" не найден -->`;
      }

      // <source> современными форматами, AVIF первым (браузер берет первый
      // поддерживаемый), srcset с 1x/2x-дескрипторами.
      const sources = [];
      for (const format of ["avif", "webp"]) {
        const list = entry.variants.filter((v) => v.format === format);
        if (list.length === 0) {
          continue;
        }
        const srcset = list.map((v) => `${v.path} ${v.descriptor}`).join(", ");
        sources.push(`<source type="${MIME[format]}" srcset="${srcset}">`);
      }

      // <img>-фолбэк исходного формата (со своим srcset при retina-паре).
      const fallback = entry.variants.filter((v) => FALLBACK_FORMATS.has(v.format));
      const srcsetAttr =
        fallback.length > 1
          ? ` srcset="${fallback.map((v) => `${v.path} ${v.descriptor}`).join(", ")}"`
          : "";
      const classAttr = imgClass ? ` class="${escapeHtml(imgClass)}"` : "";
      const sizeAttrs =
        entry.width && entry.height
          ? ` width="${entry.width}" height="${entry.height}"`
          : "";

      return (
        `<picture>${sources.join("")}` +
        `<img${classAttr} src="${fallback[0].path}"${srcsetAttr}${sizeAttrs} ` +
        `loading="${escapeHtml(loading)}" decoding="${escapeHtml(decoding)}" ` +
        `alt="${escapeHtml(alt)}">` +
        `</picture>`
      );
    },
  };

  return plugin;
}

export default smartAssets;
