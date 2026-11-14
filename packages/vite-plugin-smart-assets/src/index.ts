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

import type {
  Manifest,
  RasterEntry,
  RasterVariant,
  SmartAssetsOptions,
  SmartAssetsPlugin,
  SvgManifestFragment,
  SvgOutput,
} from "./types.ts";
import { mergeSvgManifest } from "./svg/build-manifest.ts";
import { processSvgBatch } from "./svg/pipeline.ts";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

/** Маршрут: расширения → папка внутри scope, тип записи, нужен ли sharp-конвейер. */
interface Route {
  extensions: string[];
  folder: string;
  type: string;
  raster: boolean;
}

/** Маршруты: расширения → папка внутри scope, тип записи, нужен ли sharp-конвейер. */
const ROUTES: Record<string, Route> = {
  img: { extensions: [".jpg", ".jpeg", ".png"], folder: "img", type: "img", raster: true },
};

/** Расширение, которое уходит в SVG-конвейер (pipeline.js), а не в ROUTES. */
const SVG_EXTENSION = ".svg";

/** Исходник шире этого (px) считается 2x-исходником (конвенция «в raw/ кладут 2x»). */
const RETINA_MIN_WIDTH = 800;

/** Длина контентного хеша в имени файла (как у Vite). */
const HASH_LENGTH = 8;

/** Расширение файла → формат sharp для toFormat(). */
const SHARP_FORMAT: Record<string, "jpeg" | "png"> = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
};

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

/** Современные форматы, генерируемые рядом с оригиналом (качество — конвенция проекта). */
const MODERN_FORMATS: Array<{ format: "webp" | "avif"; quality: number }> = [
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

const toPosix = (p: string) => p.split(path.sep).join("/");

const escapeHtml = (value: unknown) =>
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

const contentHash = (buffer: Uint8Array) =>
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
 * @param {SmartAssetsOptions} [options]
 */
export function smartAssets(options: SmartAssetsOptions = {}): SmartAssetsPlugin {
  const rawDir = options.rawDir ?? "frontend/raw";
  const scope = options.scope ?? "assets";
  const manifestFile = options.manifestFile ?? "assets-manifest.json";
  const generatedScssFile =
    options.generatedScssFile ?? "frontend/src/scss/generated/_smart-assets-map.scss";

  /**
   * Корень дискового кеша sharp-вариантов: по умолчанию
   * node_modules/.cache/smart-assets (относительно корня Vite —
   * резолвится в configResolved, до buildStart/configureServer).
   * Кеш персистентен между запусками dev-сервера и сборок: старт
   * больше не перекодирует неизменившиеся исходники sharp'ом
   * (на этом проекте: ~10 c → <1 c; AVIF-энкод — главный тормоз).
   */
  let cacheRoot = "";

  const dirFor = (route: Route) => (scope ? `${scope}/` : "") + route.folder;

  /** command из configResolved: "build" → токены, "serve" → абсолютные dev-URL. */
  let command: "build" | "serve" = "build";

  /** Состояние: считается в buildStart/configureServer, читается фильтрами и generateBundle. */
  const state: {
    ready: boolean;
    manifest: Manifest | null;
    /** output path → Buffer (эмиты в build + dev-middleware). */
    files: Map<string, Uint8Array>;
    /** имя без расширения → entry (API pictureHtml/entry). */
    byName: Map<string, RasterEntry>;
    /** SVG-конвейер (шаг 8): [{ fileName, content }] + фрагмент манифеста. */
    svgOutputs: SvgOutput[];
    svgManifest: SvgManifestFragment;
  } = {
    ready: false,
    manifest: null,
    files: new Map(),
    byName: new Map(),
    svgOutputs: [],
    svgManifest: { entries: [] },
  };

  /*! --- Дисковый кеш sharp-вариантов (персистентен между запусками) --- */

  /** Запись кеша одного растрового исходника. */
  interface RasterCacheRecord {
    /** Полный sha256 ИСХОДНИКА — ключ релевантности. */
    hash: string;
    /** Выходные пути зависят от scope/rawDir — валидны только при совпадении. */
    scope: string;
    rawDir: string;
    pluginVersion: string;
    entry: RasterEntry;
  }

  /** Индекс кеша: relPosix исходника → запись. Читается с диска лениво. */
  let cacheIndex: Record<string, RasterCacheRecord> | null = null;
  let cacheDirty = false;
  let cacheHits = 0;
  let cacheMisses = 0;

  const fullSourceHash = (buffer: Uint8Array) =>
    crypto.createHash("sha256").update(buffer).digest("hex");

  function loadCacheIndex(): Record<string, RasterCacheRecord> {
    if (cacheIndex) {
      return cacheIndex;
    }
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(cacheRoot, "cache.json"), "utf8"),
      ) as { sources?: Record<string, RasterCacheRecord> };
      cacheIndex = raw.sources ?? {};
    } catch {
      // Нет кеша/битый JSON — работаем как с пустым (первый прогон).
      cacheIndex = {};
    }
    return cacheIndex;
  }

  /** Файл кеша варианта: путь от корня outDir кодируется в одно имя (см. encodeURIComponent). */
  const cacheVariantFile = (variantPath: string) =>
    path.join(cacheRoot, "files", encodeURIComponent(variantPath));

  /** Чтение варианта из кеша; null — файл отсутствует/нечитаем (ветка трактуется как промах). */
  function readCachedVariant(variantPath: string): Buffer | null {
    try {
      return fs.readFileSync(cacheVariantFile(variantPath));
    } catch {
      return null;
    }
  }

  /** Сохранение варианта на диск кеша (каталог создается лениво). */
  function writeVariantToCache(variantPath: string, buffer: Uint8Array): void {
    const file = cacheVariantFile(variantPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
  }

  /*!
   * Полный цикл: скан raw/ → хеш → retina-решение → sharp-варианты → состояние
   * + сгенерированная Sass-карта. Идемпотентно (state.ready).
   * Возвращает манифест (для writeGeneratedScss — единый источник типов).
   */
  async function ensureProcessed(): Promise<Manifest> {
    if (state.ready) {
      // Инвариант: ready=true ⟺ state.manifest установлен (invalidate сбрасывает оба).
      return state.manifest!;
    }

    if (!fs.existsSync(rawDir)) {
      fs.mkdirSync(rawDir, { recursive: true });
      console.warn(
        `[smart-assets] каталог "${rawDir}" не найден — создан. ` +
          `Положите ассеты и пересоберите.`,
      );
    }

    const manifest: Manifest = {
      plugin: "vite-plugin-smart-assets",
      version,
      rawDir: toPosix(rawDir),
      entries: [],
    };
    const usedOutputs = new Set<string>();
    const processedRasters = new Set<string>();
    let variantCount = 0;
    let retinaCount = 0;

    const found = fs
      .readdirSync(rawDir, { recursive: true, encoding: "utf8" })
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
      const fullHash = fullSourceHash(source);
      const relPosix = toPosix(rel);
      processedRasters.add(relPosix);
      // Успешность sharp-прохода: ошибку sharp не кешируем — файл
      // перекодируется при следующем запуске (см. сохранение кеша ниже).
      let sharpOk = false;
      const dir = dirFor(route);
      const stem = relPosix.slice(0, -ext.length); // "sub/hero" — подпапки сохраняются
      const nameFor = (suffix: string, format: string) => `${dir}/${stem}${suffix}.${format}`;

      const variants: RasterVariant[] = [];
      const entry: RasterEntry = {
        source: path.posix.join(toPosix(rawDir), relPosix),
        type: route.type,
        hash,
        size: source.length,
        variants,
      };
      const addVariant = (
        fileName: string,
        format: string,
        descriptor: "1x" | "2x",
        width: number | null,
        height: number | null,
        buffer: Uint8Array,
      ): void => {
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
        //
        // !КЕШ: неизменившийся исходник (полный sha256 + те же scope/rawDir/
        // версия плагина + все файлы вариантов на диске в кеш-каталоге)
        // восстанавливается из node_modules/.cache/smart-assets — sharp
        // не запускается. Хит завершает итерацию досрочно (continue),
        // чтобы не трогать отлаженный sharp-путь ниже.
        const cachedRecord = loadCacheIndex()[relPosix];
        const cacheValid =
          !!cachedRecord &&
          cachedRecord.hash === fullHash &&
          cachedRecord.scope === scope &&
          cachedRecord.rawDir === toPosix(rawDir) &&
          cachedRecord.pluginVersion === version &&
          cachedRecord.entry.variants.length > 0 &&
          cachedRecord.entry.variants.every((v) =>
            fs.existsSync(cacheVariantFile(v.path)),
          );

        if (cacheValid && cachedRecord) {
          for (const v of cachedRecord.entry.variants) {
            addVariant(
              v.path,
              v.format,
              v.descriptor,
              v.width,
              v.height,
              readCachedVariant(v.path)!,
            );
          }
          entry.retina = cachedRecord.entry.retina;
          // primary всегда существует: серия "1x" исходного формата попадает
          // в кеш только из успешного sharp-прохода (см. ветку промаха ниже).
          const primary = variants.find(
            (v) => v.format === ext.slice(1) && v.descriptor === "1x",
          );
          entry.width = primary!.width;
          entry.height = primary!.height;
          entry.output = primary!.path;
          variantCount += variants.length - 1;
          if (entry.retina) {
            retinaCount += 1;
          }
          cacheHits += 1;

          // Хвост итерации — дублирован из-за досрочного continue (см. выше).
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
          continue;
        }

        // Промах кеша (или валидация не прошла) — полный sharp-проход.
        try {
          const meta = await sharp(source).metadata();
          const retina = meta.width! > RETINA_MIN_WIDTH;
          const oneWidth = retina ? Math.max(1, Math.round(meta.width! / 2)) : meta.width!;
          const dims = (width: number) => ({
            width,
            height: Math.round((width * meta.height!) / meta.width!),
          });

          const encode = async (
            format: "webp" | "avif",
            width: number | null,
          ): Promise<Buffer> => {
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
          // primary всегда существует: серия "1x" исходного формата добавлена выше.
          entry.width = primary!.width;
          entry.height = primary!.height;
          entry.output = primary!.path;
          variantCount += variants.length - 1;
          if (retina) {
            retinaCount += 1;
          }
          sharpOk = true;
        } catch (error) {
          // Принцип проекта: один битый файл не роняет сборку.
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `[smart-assets] "${relPosix}" не обработан sharp (${message}) — ` +
              `маршрутизирую оригинал без вариантов`,
          );
          const output = nameFor(`.${hash}`, ext.slice(1));
          addVariant(output, ext.slice(1), "1x", null, null, source);
          entry.output = output;
        }
      }

      entry.variants = variants;

      // !КЕШ (промах): успешный sharp-проход сохраняется на диск — файлы
      // вариантов + запись индекса с полным хешем исходника. Ошибка sharp
      // НЕ кешируется (sharpOk=false) — файл перекодируется при следующем
      // запуске. Апгрейд sharp может дать иные байты — осознанно не ключуем
      // версию sharp (настройки кодека в MODERN_FORMATS не менялись).
      if (sharpOk) {
        for (const v of variants) {
          const buffer = state.files.get(v.path);
          if (buffer) {
            writeVariantToCache(v.path, buffer);
          }
        }
        loadCacheIndex()[relPosix] = {
          hash: fullHash,
          scope,
          rawDir: toPosix(rawDir),
          pluginVersion: version,
          entry: structuredClone(entry),
        };
        cacheDirty = true;
        cacheMisses += 1;
      }

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
      const svgResult: { outputs: SvgOutput[]; manifest: SvgManifestFragment } =
        await processSvgBatch(
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

    // !КЕШ: prune записей удаленных исходников + сохранение индекса
    // (одна запись на диск за прогон). Файлы-сироты в cache/files/ не
    // удаляются — при возврате файла в raw/ они переиспользуются.
    const index = loadCacheIndex();
    let pruned = false;
    for (const key of Object.keys(index)) {
      if (!processedRasters.has(key)) {
        delete index[key];
        pruned = true;
      }
    }
    if (cacheDirty || pruned) {
      fs.mkdirSync(cacheRoot, { recursive: true });
      fs.writeFileSync(
        path.join(cacheRoot, "cache.json"),
        JSON.stringify({ version: 1, sources: index }, null, 2),
        "utf8",
      );
    }

    manifest.entries.sort((a, b) => a.source.localeCompare(b.source));
    state.manifest = manifest;
    state.ready = true;

    const imgEntries = manifest.entries.filter((e) => "type" in e && e.type === "img").length;
    const svgCount = state.svgManifest.entries.length;
    console.log(
      `[smart-assets] ${manifest.entries.length + svgCount} файл(ов) из ${toPosix(rawDir)}: ` +
        `${imgEntries} img (+${variantCount} вариантов, ${retinaCount} retina), ` +
        `${svgCount} svg (inline/sprite/img по конвейеру)`,
    );
    if (cacheHits + cacheMisses > 0) {
      console.log(
        `[smart-assets] кеш raster: ${cacheHits}/${cacheHits + cacheMisses} из дискового кеша` +
          (cacheMisses > 0
            ? ` (перекодировано ${cacheMisses})`
            : " (перекодирования не было)"),
      );
    }
    return manifest;
  }

  /*!
   * Сгенерированный SCSS для bgset(): карта «имя → формат → путь относительно
   * корня outDir» + функция smart-asset-url($name, $format). Функция знает режим:
   * build возвращает ТОКЕН url(smart-asset:name:format) (Vite не резолвит
   * схемо-подобные URL; generateBundle подставит реальные пути), serve —
   * абсолютный /<scope>/... (отдает middleware).
   */
  function writeGeneratedScss(manifest: Manifest) {
    const rasterEntries = manifest.entries.filter(
      (e): e is RasterEntry => "type" in e && e.type === "img" && e.variants.length > 0,
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
      const manifest = await ensureProcessed();
      writeGeneratedScss(manifest);
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
  function replaceCssTokens(source: string | Uint8Array, cssFileName: string): string {
    return String(source).replace(CSS_TOKEN_RE, (match: string, _quote: string, name: string, format: string) => {
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

  const plugin: SmartAssetsPlugin = {
    name: "vite-plugin-smart-assets",

    configResolved(config) {
      command = config.command;
      cacheRoot = path.resolve(
        config.root,
        options.cacheDir ?? "node_modules/.cache/smart-assets",
      );
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
      const onChange = async (file: string) => {
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
   * API для Nunjucks-фильтров (vite.config.js): запись SVG-манифеста по имени
   * файла в raw/ без расширения (подпапка — через слеш: "icons/user").
   * Состояние посчитано в buildStart/configureServer — ДО рендера шаблонов
   * (фаза transform), поэтому записи доступны в момент вызова фильтра.
   * @param {string} name
   * @returns {object|undefined} Запись { source, file, kind, mode, symbol?, hash }.
   */
  svgEntry(name) {
    const source = `${toPosix(rawDir)}/${name}.svg`;
    return state.svgManifest.entries.find((entry) => entry.source === source);
  },

  /*!
   * API для Nunjucks-фильтров (vite.config.js): нормализованный inline-SVG
   * (mode: "inline") по записи манифеста — содержимое из state.svgOutputs.
   * Для sprite/img вернет null: им инлайн-контент не нужен.
   * @param {object} entry Запись из svgEntry().
   * @returns {string|null}
   */
  svgInlineContent(entry) {
    if (!entry?.file) {
      return null;
    }
    return state.svgOutputs.find(({ fileName }) => fileName === entry.file)?.content ?? null;
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
