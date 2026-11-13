/**
 * =================================================================================================
 * project — проекция записи манифеста SVG в HTML (шаг 7)
 * =================================================================================================
 *
 *   projectSvg(entry, options?, inlineContent?) → string
 *
 * Вход — запись манифеста из buildSvgManifest (шаг 6): { source, file, kind,
 * mode, symbol, hash }. Выход — готовая HTML-строка для шаблонизатора
 * (Nunjucks-фильтр оборачивает её в | safe).
 *
 * По mode:
 *   inline   — инлайн-содержимое (inlineContent, dev/build передают файл).
 *              Атрибуты корневого <svg>: class СЛИВАЕТСЯ с существующим
 *              (как у svgIcon-фильтра), aria-hidden="true" — если не передан
 *              options["aria-label"] (помеченная иконка не должна скрываться
 *              от a11y-дерева; явный options["aria-hidden"] сильнее дефолта),
 *              focusable="false" (IE/старый Edge). Остальные options
 *              (style, data-*, …) идут как атрибуты. viewBox и внутренности
 *              не трогаются — вход должен быть нормализован (шаг 1), пролог
 *              сюда не доходит.
 *   sprite   — <svg …><use href="{file}#{symbol}"></use></svg>; href всегда
 *              без ведущего слеша (file из манифеста относительный, срезаем
 *              на всякий случай — контракт check-build). symbol обязателен:
 *              use без id — мусорный атрибут.
 *   img      — <img src="{file}" loading="lazy" alt="[options.alt || '']"
 *              [width] [height] class="…">; alt у img всегда есть (alt="" =
 *              декоративная), width/height/class — только если переданы.
 *              loading переопределяется options.loading.
 *   error    — "" + console.warn (файл пропущен: unknown не рендерится).
 *
 * Options сильнее дефолтов: явное значение в options заменяет дефолт
 * (loading, focusable, aria-hidden). Не-primitive значения сериализуются
 * String()'ом; строковые значения экранируются (&<>"' — alt с кавычкой не
 * должен ломать разметку). undefined/null/false — атрибут не выводится,
 * true — голый булев атрибут (hidden и т.п.).
 *
 * Ошибки — Error с префиксом [svg:project] (fail-fast, как во всем пакете):
 * inline без содержимого или с нечитаемым XML, sprite без symbol/file,
 * неизвестный mode. Пустая строка — ТОЛЬКО легальный пропуск mode: error.
 * =================================================================================================
 */

import { parseSvg } from "svgo/lib/parser.js";
import { stringifySvg } from "svgo/lib/stringifier.js";

const ERROR_PREFIX = "[svg:project]";

/** Экранирование значения атрибута в ручной сборке (AST-сериализация экранирует сама). */
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

/** file из манифеста и так относительный, но контракт check-build — без ведущего слеша. */
const toRelative = (file) => String(file).replace(/^\/+/, "");

/** Пары [name, value] → строка атрибутов (undefined/null/false скипаются, true — голый атрибут). */
const renderAttrs = (pairs) =>
  pairs
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([name, value]) => (value === true ? name : `${name}="${escapeHtml(value)}"`))
    .join(" ");

/** Общие для inline/sprite атрибуты-дефолты: aria-hidden (если нет aria-label) + focusable. */
const iconDefaults = (options) => {
  const { "aria-label": ariaLabel, "aria-hidden": ariaHidden, focusable } = options ?? {};
  return {
    "aria-hidden": ariaHidden ?? (ariaLabel === undefined ? "true" : undefined),
    focusable: focusable ?? "false",
  };
};

const mergeClass = (existing, extra) =>
  [existing, extra].filter((part) => typeof part === "string" && part !== "").join(" ") || undefined;

/** inline: атрибуты поверх корня AST (AST-сериализация сама экранирует значения). */
const projectInline = (entry, options, inlineContent) => {
  if (typeof inlineContent !== "string" || inlineContent.trim() === "") {
    throw new Error(`${ERROR_PREFIX} "${entry.source}": mode "inline" требует inlineContent`);
  }

  let ast;
  try {
    ast = parseSvg(inlineContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_PREFIX} "${entry.source}": нечитаемый XML (${message})`);
  }
  const root = ast.children.find((child) => child.type === "element" && child.name === "svg");
  if (root === undefined) {
    throw new Error(`${ERROR_PREFIX} "${entry.source}": нет корневого <svg>`);
  }

  const { class: cls, ...rest } = options ?? {};
  const defaults = iconDefaults(options);

  const mergedClass = mergeClass(root.attributes.class, cls);
  if (mergedClass !== undefined) {
    root.attributes.class = mergedClass;
  }
  for (const [name, value] of Object.entries({ ...rest, ...defaults })) {
    if (value !== undefined && value !== null && value !== false) {
      root.attributes[name] = String(value);
    }
  }

  return stringifySvg(ast);
};

/** sprite: обертка <svg> + <use href="file#symbol">. */
const projectSprite = (entry, options) => {
  if (!entry.file) {
    throw new Error(`${ERROR_PREFIX} "${entry.source}": mode "sprite" без file в записи`);
  }
  if (!entry.symbol) {
    throw new Error(`${ERROR_PREFIX} "${entry.source}": mode "sprite" без symbol в записи`);
  }

  const { class: cls, ...restOptions } = options ?? {};
  const defaults = iconDefaults(options);

  const attrs = renderAttrs([
    ["class", cls],
    ["aria-hidden", defaults["aria-hidden"]],
    ["focusable", defaults.focusable],
    ...Object.entries(restOptions),
  ]);
  const href = `${toRelative(entry.file)}#${entry.symbol}`;

  return `<svg${attrs ? ` ${attrs}` : ""}><use href="${href}"></use></svg>`;
};

/** img: <img src loading alt [width] [height] class …>. */
const projectImg = (entry, options) => {
  if (!entry.file) {
    throw new Error(`${ERROR_PREFIX} "${entry.source}": mode "img" без file в записи`);
  }

  const {
    alt,
    width,
    height,
    class: cls,
    loading,
    ...restOptions
  } = options ?? {};

  const attrs = renderAttrs([
    ["src", toRelative(entry.file)],
    ["loading", loading ?? "lazy"],
    ["alt", alt ?? ""],
    ["width", width],
    ["height", height],
    ["class", cls],
    ...Object.entries(restOptions),
  ]);

  return `<img ${attrs}>`;
};

/**
 * Проецирует запись манифеста SVG в HTML-строку. Чистая, кроме mode: error
 * (console.warn — единственный легальный побочный эффект).
 * @param {{ source: string, file?: string|null, kind: string, mode: string, symbol?: string, hash?: string }} entry
 * @param {object} [options] class, alt, width, height, loading, aria-label, style, data-* …
 * @param {string|null} [inlineContent] Нормализованный SVG (только для mode: "inline").
 * @returns {string}
 */
export function projectSvg(entry, options = {}, inlineContent = null) {
  switch (entry.mode) {
    case "inline":
      return projectInline(entry, options, inlineContent);
    case "sprite":
      return projectSprite(entry, options);
    case "img":
      return projectImg(entry, options);
    case "error":
      console.warn(`${ERROR_PREFIX} "${entry.source}" пропущен: mode "error" (unknown SVG)`);
      return "";
    default:
      throw new Error(`${ERROR_PREFIX} "${entry.source}": неизвестный mode "${entry.mode}"`);
  }
}
