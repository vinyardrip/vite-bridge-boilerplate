/**
 * =================================================================================================
 * pipeline — оркестратор SVG-конвейера (шаг 8, часть 1: сборка)
 * =================================================================================================
 *
 *   processSvgBatch(filePaths, { rawDir?, scope? }) →
 *     Promise<{ outputs: Array<{ fileName, content }>, manifest: { entries: [...] } }>
 *
 * Принимает абсолютные пути к SVG-файлам, читает их и прогоняет через
 * полный конвейер: normalize (шаг 1) → classifyOne (шаг 4) → assignModes
 * (агрегат порогов по иконкам) → проекции (шаги 3/5) → buildSvgManifest
 * (шаг 6). I/O здесь — только чтение входных файлов; эмиссию в dist делает
 * плагин (index.js, this.emitFile) по outputs.
 *
 * outputs (пути относительно корня outDir, scope учтён: WP-сборка шлёт ""):
 *   mode inline  → "ui/<name>.svg"              — нормализованный и
 *                                                 префиксированный контент
 *                                                 (prefixSvg, имя = basename
 *                                                 без расширения);
 *   mode sprite  → "icons/sprite.<hash8>.svg"   — единый спрайт из всех
 *                                                 sprite-иконок пакета
 *                                                 (buildSprite);
 *   mode img     → "img/<stem>.<hash8>.svg"     — оптимизированный
 *                                                 (нормализованный) SVG
 *                                                 иллюстрации; подпапки raw/
 *                                                 сохраняются в stem.
 *
 * manifest — фрагмент buildSvgManifest: source ("<rawDir>/<путь внутри>",
 * ключ верстальщиков), file (из outputs), kind, mode, symbol (только у
 * sprite), hash. hash = хэш ЭМИТИРУЕМОГО контента: у sprite-иконок — хэш
 * спрайта (совпадает с именем файла, как в примере формата шага 6), у
 * inline/img — их собственный файл.
 *
 * Размеры для порогов (raw/gzip) меряются по НОРМАЛИЗОВАННОМУ контенту —
 * именно он инлайнится в страницы (DOM-вес); пролог/комментарии исходника
 * веса не несут.
 *
 * fail-fast [svg:pipeline]: любая ошибка (не читается, normalize, kind
 * unknown → mode error, невалидное имя, дубликат имени инлайна) роняет
 * пакет с указанием source — «молча пропустить» нельзя (ошибочные политики
 * спеки: unknown/битый XML роняют билд). Ошибки нижних шагов пробрасываются
 * с их префиксами ([svg:normalize], [svg:prefix], [svg:build-sprite]) и
 * контекстом файла.
 * =================================================================================================
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

import { normalize } from "./normalize.js";
import { classifyOne, assignModes } from "./classify.js";
import { prefixSvg } from "./prefix.js";
import { buildSprite } from "./build-sprite.js";
import { buildSvgManifest } from "./build-manifest.js";

const ERROR_PREFIX = "[svg:pipeline]";
const HASH_LENGTH = 8;

const toPosix = (p) => p.split(path.sep).join("/");

/** 8-символьный контентный хэш (конвенция проекта, как в index.js). */
const contentHash = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex").slice(0, HASH_LENGTH);

const gzipByteLength = (buffer) => zlib.gzipSync(buffer).length;

const wrap = (context, error) => {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${ERROR_PREFIX} "${context}": ${message}`);
};

/**
 * Обрабатывает пакет SVG-файлов. Читает файлы, считает метаданные, решает
 * mode, строит outputs и фрагмент манифеста.
 * @param {string[]} filePaths Абсолютные пути к SVG-файлам.
 * @param {{ rawDir?: string, scope?: string }} [options]
 *   rawDir — корень исходников (source в манифесте = rawDir + путь внутри);
 *   scope  — каталог внутри outDir ("assets" → assets/ui/…, "" → ui/… в WP).
 * @returns {Promise<{ outputs: Array<{ fileName: string, content: string }>, manifest: object }>}
 */
export async function processSvgBatch(filePaths, { rawDir = "", scope = "assets" } = {}) {
  const dir = scope ? `${scope}/` : "";
  const rawDirAbs = rawDir ? path.resolve(rawDir) : "";

  /*! 1) чтение + normalize + classify. Ошибки — fail-fast с контекстом файла. */
  const items = [];
  for (const absPath of filePaths ?? []) {
    const abs = String(absPath);
    const relWithin = rawDirAbs
      ? toPosix(path.relative(rawDirAbs, abs))
      : path.basename(abs);
    const relSource = rawDir
      ? `${toPosix(rawDir)}/${relWithin}`
      : toPosix(abs);

    let source;
    try {
      source = await fs.readFile(abs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${ERROR_PREFIX} "${relSource}": файл не читается (${message})`);
    }

    let normalized;
    try {
      normalized = normalize(source.toString("utf8"));
    } catch (error) {
      throw wrap(relSource, error);
    }

    items.push({
      relWithin,
      relSource,
      content: normalized.svg,
      ...classifyOne(normalized.svg),
    });
  }

  /*! 2) метаданные (по нормализованному контенту) + mode-решение по пакету. */
  const measured = items.map((item) => ({
    path: item.relSource,
    kind: item.kind,
    size: Buffer.byteLength(item.content, "utf8"),
    gzipSize: gzipByteLength(Buffer.from(item.content, "utf8")),
  }));
  const modes = assignModes(measured);

  /*! 3) проекции: inline/img сразу, sprite-кандидаты копятся на спрайт. */
  const outputs = [];
  const svgAssets = [];
  const spriteIcons = [];
  const usedInline = new Set();

  items.forEach((item, index) => {
    const mode = modes[index].mode;
    // Имя = basename (без подпапок): оно идет в id символа и CSS-префикс.
    const name = path.basename(item.relWithin, path.extname(item.relWithin));

    if (mode === "inline") {
      let content;
      try {
        content = prefixSvg(item.content, name);
      } catch (error) {
        throw wrap(item.relSource, error);
      }
      const fileName = `${dir}ui/${name}.svg`;
      if (usedInline.has(fileName)) {
        throw new Error(
          `${ERROR_PREFIX} "${item.relSource}": дубликат имени инлайна "${fileName}" ` +
            `(basename в raw/ должен быть уникален)`,
        );
      }
      usedInline.add(fileName);
      outputs.push({ fileName, content });
      svgAssets.push({
        source: item.relSource,
        kind: item.kind,
        mode,
        url: fileName,
        hash: contentHash(Buffer.from(content, "utf8")),
      });
      return;
    }

    if (mode === "sprite") {
      spriteIcons.push({ name, content: item.content, relSource: item.relSource, kind: item.kind });
      return;
    }

    if (mode === "img") {
      const hash = contentHash(Buffer.from(item.content, "utf8"));
      const stem = item.relWithin.slice(0, -path.extname(item.relWithin).length);
      const fileName = `${dir}img/${stem}.${hash}.svg`;
      outputs.push({ fileName, content: item.content });
      svgAssets.push({
        source: item.relSource,
        kind: item.kind,
        mode,
        url: fileName,
        hash,
      });
      return;
    }

    // mode "error" (kind unknown / не подошел ни под одно правило) — роняет пакет.
    throw new Error(
      `${ERROR_PREFIX} "${item.relSource}": kind "${item.kind}" (${item.reason}) — ` +
        `unknown SVG роняет билд (ошибочные политики спеки)`,
    );
  });

  /*! 4) спрайт из всех sprite-иконок пакета + их записи манифеста. */
  if (spriteIcons.length > 0) {
    let xml;
    try {
      xml = buildSprite(spriteIcons);
    } catch (error) {
      throw wrap(spriteIcons.map((icon) => icon.name).join(", "), error);
    }
    const hash = contentHash(Buffer.from(xml, "utf8"));
    const spriteUrl = `${dir}icons/sprite.${hash}.svg`;
    outputs.push({ fileName: spriteUrl, content: xml });
    for (const icon of spriteIcons) {
      svgAssets.push({
        source: icon.relSource,
        kind: icon.kind,
        mode: "sprite",
        url: spriteUrl,
        hash,
        symbol: icon.name,
      });
    }
  }

  /*! 5) фрагмент манифеста (записи сортируются по source внутри). */
  const manifest = buildSvgManifest(svgAssets);
  return { outputs, manifest };
}
