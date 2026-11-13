/**
 * =================================================================================================
 * build-sprite — сборка иконок в единый sprite.svg
 * =================================================================================================
 *
 *   buildSprite([{ name, content }, ...]) → string (XML файла sprite.svg)
 *
 * Вход — нормализованные SVG (шаг 1: viewBox гарантирован, <style> каноничен,
 * комментарии вырезаны). Выход — детерминированный XML: два вызова на одном
 * наборе дают байт-идентичный файл; символы отсортированы по id (алфавит).
 *
 * Безопасный корень спрайта: width/height=0 + position:absolute — иначе
 * старые Safari роняют градиенты; display="none" НЕ используется по той же
 * причине (display:none ломает <use> в части браузеров).
 *
 * Префиксация (коллизии при склейке): каждый идентификатор получает префикс
 * имени иконки ("user" → "user-grad"):
 *   • атрибуты id и class, ссылки url(#...) в любых атрибутах;
 *   • href="#..." / xlink:href="#..." (use-ссылки, не data:/http);
 *   • <style>: селекторы классов и id, имена @keyframes и ссылки на них в
 *     декларациях animation/-webkit-animation(-name), url(#...) в значениях.
 * Селекторы обрабатываются структурно (prelude{body}): hex-цвета (#fff) и
 * числа (.5px) в значениях деклараций НЕ трогаются — точка/решётка меняются
 * только в селекторных частях.
 *
 * Ошибки — Error с префиксом [svg:build-sprite] (fail-fast, как normalize):
 * дубликат имени, невалидное имя (должно начинаться с буквы или "_", далее
 * буквы/цифры/"-"/"_"), нет viewBox у корня, нечитаемый XML.
 * =================================================================================================
 */

import { parseSvg } from "svgo/lib/parser.js";
import { stringifySvg } from "svgo/lib/stringifier.js";

const ERROR_PREFIX = "[svg:build-sprite]";

/** Имя иконки идет в id и CSS-префикс — должно быть валидным идентификатором. */
const NAME_RE = /^[A-Za-z_][\w-]*$/;

const SPRITE_ROOT_TAG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden" aria-hidden="true">';

/** Декларации инлайн-стиля: [{ prop, value }] (семантика convertColorsToCurrent). */
const parseStyleDecls = (styleValue) =>
  String(styleValue)
    .split(";")
    .map((decl) => {
      const idx = decl.indexOf(":");
      if (idx === -1) {
        return null;
      }
      return { prop: decl.slice(0, idx).trim().toLowerCase(), value: decl.slice(idx + 1).trim() };
    })
    .filter((decl) => decl !== null && decl.prop !== "");

const prefixIdent = (ident, prefix) => `${prefix}-${ident}`;

const ID_SELECTOR_RE = /#([\w-]+)/g;
const CLASS_SELECTOR_RE = /\.(-?[A-Za-z_][\w-]*)/g;
const URL_REF_RE = /url\(\s*(['"]?)#([\w-]+)\1\s*\)/g;

const replaceUrlRefs = (text, prefix) =>
  text.replace(URL_REF_RE, (m, quote, name) => `url(${quote}#${prefixIdent(name, prefix)}${quote})`);

/** Имена @keyframes в CSS-тексте (до переименования). */
const collectKeyframes = (css) => {
  const names = new Set();
  for (const match of String(css).matchAll(/@keyframes\s+([\w-]+)/g)) {
    names.add(match[1]);
  }
  return names;
};

/**
 * Ссылки на keyframes в значениях animation/-webkit-animation(-name):
 * первый токен каждой comma-части переименовывается, только если он входит
 * в собранный набор @keyframes (точность вместо слепой замены).
 */
const renameAnimationRefs = (declarations, prefix, keyframes) =>
  declarations.map((decl) => {
    if (keyframes.size === 0 || !/^(?:-webkit-)?animation(?:-name)?$/.test(decl.prop)) {
      return decl;
    }
    const value = decl.value
      .split(",")
      .map((part) => {
        const trimmed = part.trim();
        const ident = /^([\w-]+)/.exec(trimmed);
        return ident !== null && keyframes.has(ident[1])
          ? trimmed.replace(/^([\w-]+)/, (m) => prefixIdent(m, prefix))
          : trimmed;
      })
      .join(",");
    return { prop: decl.prop, value };
  });

/** Значение style-атрибута (инлайн-стиль): animation-ссылки + пересборка. */
const prefixStyleDeclarations = (styleValue, prefix, keyframes) =>
  renameAnimationRefs(parseStyleDecls(styleValue), prefix, keyframes)
    .map((decl) => `${decl.prop}:${decl.value}`)
    .join(";");

/** Селекторная часть правила: классы и id получают префикс. */
const prefixSelectors = (prelude, prefix) =>
  prelude
    .replace(CLASS_SELECTOR_RE, (m, name) => `.${prefixIdent(name, prefix)}`)
    .replace(ID_SELECTOR_RE, (m, name) => `#${prefixIdent(name, prefix)}`);

/** Leaf-тело (декларации, hex-цвета и числа не трогаются): animation-ссылки. */
const prefixDeclarations = (body, prefix, keyframes) =>
  renameAnimationRefs(parseStyleDecls(body), prefix, keyframes)
    .map((decl) => `${decl.prop}:${decl.value}`)
    .join(";");

/**
 * CSS-текст: селекторы (до '{', на любой глубине вложенности @media/@keyframes)
 * получают префикс; тела-декларации — только animation-ссылки.
 *
 * Замены @keyframes/url(#) выполняются ОДНОКратно до структурного обхода:
 * рекурсия prefixBlocks идёт по уже обработанному тексту и их не повторяет
 * (иначе получилось бы user-user-spin).
 */
const prefixCss = (css, prefix, keyframes) => {
  const once = replaceUrlRefs(
    String(css).replace(/@keyframes\s+([\w-]+)/g, (m, name) => `@keyframes ${prefixIdent(name, prefix)}`),
    prefix,
  );
  return prefixBlocks(once, prefix, keyframes);
};

const prefixBlocks = (css, prefix, keyframes) => {
  const replaced = css;
  const out = [];
  let pos = 0;
  while (pos < replaced.length) {
    const open = replaced.indexOf("{", pos);
    if (open === -1) {
      out.push(replaced.slice(pos));
      break;
    }
    let depth = 1;
    let close = open + 1;
    while (close < replaced.length && depth > 0) {
      if (replaced[close] === "{") {
        depth += 1;
      } else if (replaced[close] === "}") {
        depth -= 1;
      }
      close += 1;
    }
    const prelude = replaced.slice(pos, open);
    const body = replaced.slice(open + 1, close - 1);
    out.push(prefixSelectors(prelude, prefix), "{");
    out.push(
      body.includes("{")
        ? prefixBlocks(body, prefix, keyframes)
        : prefixDeclarations(body, prefix, keyframes),
    );
    out.push("}");
    pos = close;
  }
  return out.join("");
};

/** Префиксация атрибутов одного элемента (мутирует node.attributes). */
const prefixAttributes = (node, prefix, keyframes) => {
  for (const [attrName, attrValue] of Object.entries(node.attributes)) {
    let value = String(attrValue);
    value = replaceUrlRefs(value, prefix);
    if (attrName === "class") {
      value = value.trim().split(/\s+/).map((cls) => prefixIdent(cls, prefix)).join(" ");
    } else if (attrName === "id") {
      value = prefixIdent(value, prefix);
    } else if (attrName === "style") {
      value = prefixStyleDeclarations(value, prefix, keyframes);
    } else if ((attrName === "href" || attrName === "xlink:href") && /^#[\w-]+$/.test(value.trim())) {
      value = `#${prefixIdent(value.trim().slice(1), prefix)}`;
    }
    node.attributes[attrName] = value;
  }
};

const walk = (node, prefix, keyframes) => {
  for (const child of node.children) {
    if (child.type === "element") {
      prefixAttributes(child, prefix, keyframes);
      if (child.name === "style") {
        // CSS-текст <style>: селекторы, keyframes, url(#) — структурный проход.
        for (const inner of child.children) {
          if (inner.type === "text" || inner.type === "cdata") {
            inner.value = prefixCss(String(inner.value), prefix, keyframes);
          }
        }
      }
      walk(child, prefix, keyframes);
    }
  }
};

/** Одна иконка → XML <symbol id="[name]" viewBox="...">...</symbol>. */
const buildSymbol = ({ name, content }) => {
  let ast;
  try {
    ast = parseSvg(String(content));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_PREFIX} icon "${name}": ${message}`);
  }

  const svg = ast.children.find((child) => child.type === "element" && child.name === "svg");
  if (svg === undefined) {
    throw new Error(`${ERROR_PREFIX} icon "${name}": no <svg> root element`);
  }
  const viewBox = svg.attributes.viewBox;
  if (typeof viewBox !== "string" || viewBox.trim() === "") {
    throw new Error(`${ERROR_PREFIX} icon "${name}": no viewBox (normalize guarantees one)`);
  }

  // Имена keyframes собираются ДО переименования — по ним правятся ссылки.
  const keyframes = collectKeyframes(
    svg.children
      .filter((child) => child.type === "element" && child.name === "style")
      .flatMap((style) => style.children.filter((c) => c.type === "text" || c.type === "cdata"))
      .map((node) => String(node.value))
      .join("\n"),
  );

  walk(svg, name, keyframes);

  // Корень → символ: атрибуты <svg> отбрасываются, переносится только viewBox.
  svg.name = "symbol";
  svg.attributes = { id: name, viewBox: viewBox.trim() };

  return stringifySvg(ast);
};

/**
 * Собирает иконки в XML файла sprite.svg. Чистая, синхронная, детерминированная.
 * @param {Array<{ name: string, content: string }>} icons
 * @returns {string}
 */
export function buildSprite(icons) {
  const names = new Set();
  const symbols = [];

  for (const icon of icons ?? []) {
    const name = String(icon.name);
    if (!NAME_RE.test(name)) {
      throw new Error(`${ERROR_PREFIX} invalid icon name "${name}"`);
    }
    if (names.has(name)) {
      throw new Error(`${ERROR_PREFIX} duplicate icon name "${name}"`);
    }
    names.add(name);
    symbols.push({ id: name, xml: buildSymbol(icon) });
  }

  symbols.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return `${SPRITE_ROOT_TAG}${symbols.map((s) => s.xml).join("")}</svg>`;
}
