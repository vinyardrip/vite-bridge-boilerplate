/**
 * =================================================================================================
 * classify — классификация SVG: kind (что это) и mode (куда пойдёт)
 * =================================================================================================
 *
 *   classifyOne(normalizedSvg) → { kind, reason }
 *   assignModes(items, thresholds?) → [{ path, kind, mode, reason }]
 *
 * classifyOne — чистое дерево решений над УЖЕ нормализованным SVG (шаг 1).
 * Порядок проверок важен — сначала структурные, потом цветовые:
 *
 *   sprite       — есть <symbol> в любом месте (даже один — это контейнер);
 *   animated     — SMIL (<animate|animateTransform|animateMotion|set|mpath>),
 *                  @keyframes / animation: в <style> (или инлайн-стиле — svgo
 *                  inlineStyles переносит подходящие правила в style-атрибуты),
 *                  либо <script>;
 *   illustration — url(#...) в атрибутах или <style> (градиенты, mask,
 *                  clip-path, filter), либо растровая вставка <image>;
 *   icon         — currentColor в fill/stroke (атрибуты и инлайн-стили), либо
 *                  ≤2 уникальных цветов при маленьком viewBox (0 0 N N, N ≤ 64)
 *                  или размере < 4KB;
 *   unknown      — файл не парсится (parse error: ...) или не подошёл ни под
 *                  одно правило (no classification rule matched).
 *
 * fill="none" — НЕ цвет (stroke-based иконка: none + один цвет = colors 1).
 * Цвета собираются только из атрибутов fill/stroke и инлайн-стилей — та же
 * семантика, что у convertColorsToCurrent (шаг 1); CSS-правила <style> в
 * подсчёт не входят (после normalize соответствующие правила уже перенесены
 * inlineStyles в style-атрибуты).
 *
 * assignModes решает mode по ВЕСОВОМУ агрегату всех иконок: inline повторяется
 * в каждой странице, поэтому важен и raw (DOM-вес), и gzip (передача).
 *
 *   inline:  count ≤ 15 И raw ≤ 30KB И gzip ≤ 15KB — все три; на границе inline;
 *   фиксированные: animated → inline, sprite → sprite, illustration → img,
 *   unknown → error.
 *
 * Контракт: чистые синхронные функции; никакого I/O, console.* и глобального
 * состояния; парсинг — svgo-парсер (lib/parser.js), тот же AST, что в normalize.
 * =================================================================================================
 */

import { parseSvg } from "svgo/lib/parser.js";

import { parseStyleDecls } from "./utils/parse-style.js";

const ERROR_REASON_PREFIX = "parse error";
const ICON_MAX_BYTES = 4 * 1024;
const ICON_MAX_VIEWBOX = 64;

const ANIMATION_ELEMENTS = new Set([
  "animate",
  "animateTransform",
  "animateMotion",
  "set",
  "mpath",
]);

const DEFAULT_THRESHOLDS = {
  count: 15,
  rawBytes: 30 * 1024,
  gzipBytes: 15 * 1024,
};

/** Значение fill/stroke — рабочий цвет? ("" / none / currentColor / url(...) — нет). */
const asColor = (value) => {
  const v = String(value).trim();
  if (v === "" || v === "none" || v === "currentColor" || v.includes("url(")) {
    return null;
  }
  return v.toLowerCase();
};

/** Корневой <svg> AST (может отсутствовать в мусорном входе). */
const svgRoot = (ast) =>
  ast.children.find((child) => child.type === "element" && child.name === "svg");

/** viewBox — маленький прямоугольник "0 0 N N", 0 < N ≤ 64? */
const hasSmallStandardViewBox = (root) => {
  const viewBox = root?.attributes?.viewBox;
  if (typeof viewBox !== "string") {
    return false;
  }
  const parts = viewBox.trim().split(/\s+/);
  if (parts.length !== 4) {
    return false;
  }
  const [x, y, w, h] = parts.map(Number);
  return x === 0 && y === 0 && w > 0 && w === h && w <= ICON_MAX_VIEWBOX;
};

/**
 * Классифицирует один SVG. Чистая, синхронная.
 * @param {string} normalizedSvg Уже прогнанный через normalize().
 * @returns {{ kind: 'sprite'|'animated'|'illustration'|'icon'|'unknown', reason: string }}
 */
export function classifyOne(normalizedSvg) {
  const source = String(normalizedSvg);

  let ast;
  try {
    ast = parseSvg(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "unknown", reason: `${ERROR_REASON_PREFIX}: ${message}` };
  }

  let hasSymbol = false;
  let hasSmil = false;
  let hasScript = false;
  let hasImage = false;
  let hasUrlRef = false;
  let hasInlineAnimation = false;
  let hasCurrentColor = false;
  const colors = new Set();
  const styleTexts = [];

  const visit = (node) => {
    for (const child of node.children) {
      // Текст <style> — CSS: часть тела (в CDATA тоже).
      if (child.type === "text" || child.type === "cdata") {
        if (node.name === "style") {
          styleTexts.push(String(child.value));
        }
        continue;
      }
      if (child.type !== "element") {
        continue;
      }
      const name = child.name;
      if (name === "symbol") {
        hasSymbol = true;
      }
      if (ANIMATION_ELEMENTS.has(name)) {
        hasSmil = true;
      }
      if (name === "script") {
        hasScript = true;
      }
      if (name === "image") {
        hasImage = true;
      }

      for (const [attrName, attrValue] of Object.entries(child.attributes)) {
        const value = String(attrValue);
        if (value.includes("url(#")) {
          hasUrlRef = true;
        }
        if (attrName === "style") {
          if (value.includes("animation:")) {
            hasInlineAnimation = true;
          }
          for (const decl of parseStyleDecls(value)) {
            if (decl.prop !== "fill" && decl.prop !== "stroke") {
              continue;
            }
            const trimmed = String(decl.value).trim();
            if (trimmed === "currentColor") {
              hasCurrentColor = true;
            } else {
              const color = asColor(trimmed);
              if (color !== null) {
                colors.add(color);
              }
            }
          }
        } else if (attrName === "fill" || attrName === "stroke") {
          const trimmed = value.trim();
          if (trimmed === "currentColor") {
            hasCurrentColor = true;
          } else {
            const color = asColor(trimmed);
            if (color !== null) {
              colors.add(color);
            }
          }
        }
      }
      visit(child);
    }
  };
  visit(ast);

  // --- дерево решений: сначала структурные правила, потом цветовые ---
  if (hasSymbol) {
    return { kind: "sprite", reason: "contains <symbol>" };
  }

  const css = styleTexts.join("\n");
  if (hasSmil) {
    return { kind: "animated", reason: "SMIL" };
  }
  if (css.includes("@keyframes")) {
    return { kind: "animated", reason: "keyframes" };
  }
  if (css.includes("animation:") || hasInlineAnimation) {
    return { kind: "animated", reason: "css-animation" };
  }
  if (hasScript) {
    return { kind: "animated", reason: "script" };
  }

  if (hasUrlRef) {
    return { kind: "illustration", reason: "contains url(#...)" };
  }
  if (hasImage) {
    return { kind: "illustration", reason: "contains <image>" };
  }

  if (hasCurrentColor) {
    return { kind: "icon", reason: "currentColor" };
  }

  const colorCount = colors.size;
  if (colorCount <= 2) {
    const compact =
      hasSmallStandardViewBox(svgRoot(ast)) ||
      Buffer.byteLength(source, "utf8") < ICON_MAX_BYTES;
    if (compact) {
      return { kind: "icon", reason: `${colorCount} colors + small/standard viewBox` };
    }
    return { kind: "illustration", reason: "multi-color with large viewBox" };
  }
  if (colorCount > 2) {
    return { kind: "illustration", reason: `${colorCount} colors` };
  }
  return { kind: "unknown", reason: "no classification rule matched" };
}

/**
 * Для набора классифицированных иконок решает mode (inline/sprite)
 * с учётом порогов. Не-иконки получают фиксированный mode.
 * @param {Array<{path: string, kind: string, size: number, gzipSize: number}>} items
 * @param {{ count?: number, rawBytes?: number, gzipBytes?: number }} [thresholds]
 * @returns {Array<{path: string, kind: string, mode: 'inline'|'sprite'|'img'|'error', reason: string}>}
 */
export function assignModes(items, thresholds) {
  const limits = { ...DEFAULT_THRESHOLDS, ...(thresholds ?? {}) };

  let count = 0;
  let rawTotal = 0;
  let gzipTotal = 0;
  for (const item of items) {
    if (item.kind !== "icon") {
      continue;
    }
    count += 1;
    rawTotal += Number(item.size) || 0;
    gzipTotal += Number(item.gzipSize) || 0;
  }

  const withinThresholds =
    count <= limits.count && rawTotal <= limits.rawBytes && gzipTotal <= limits.gzipBytes;
  const totals = `count=${count}, raw=${rawTotal}B, gzip=${gzipTotal}B`;

  return items.map((item) => {
    const base = { path: item.path, kind: item.kind };
    switch (item.kind) {
      case "icon":
        return withinThresholds
          ? { ...base, mode: "inline", reason: `within inline thresholds (${totals})` }
          : { ...base, mode: "sprite", reason: `exceeds inline thresholds (${totals})` };
      case "animated":
        return { ...base, mode: "inline", reason: "fixed: animated goes inline" };
      case "sprite":
        return { ...base, mode: "sprite", reason: "fixed: sprite stays sprite" };
      case "illustration":
        return { ...base, mode: "img", reason: "fixed: illustration goes img" };
      default:
        return { ...base, mode: "error", reason: "fixed: unknown is an error" };
    }
  });
}
