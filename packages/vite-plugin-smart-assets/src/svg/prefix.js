/**
 * =================================================================================================
 * prefix — универсальная префиксация идентификаторов SVG (шаг 3)
 * =================================================================================================
 *
 *   prefixSvg(svgContent, prefix) → string (SVG с префиксированными идентификаторами)
 *
 * Вынесено из build-sprite (шаг 5) для переиспользования: в спрайте иконки
 * склеиваются в один файл, а инлайн-иконки попадают на одну страницу — и там
 * и там коллизии id/классов/@keyframes между иконками недопустимы
 * (две иконки с id="g1" ломают друг другу градиенты).
 *
 * Префикс ("user" → "user-g1") получают:
 *   • атрибуты id и class, ссылки url(#...) в любых атрибутах;
 *   • href="#..." / xlink:href="#..." (use-ссылки, не data:/http);
 *   • <style>: селекторы классов и id, имена @keyframes и ссылки на них в
 *     декларациях animation/-webkit-animation(-name), url(#...) в значениях.
 * Селекторы обрабатываются структурно (prelude{body}): hex-цвета (#fff) и
 * числа (.5px) в значениях деклараций НЕ трогаются — точка/решётка меняются
 * только в селекторных частях.
 *
 * Ссылки на keyframes переименовываются только для имен из СОБРАННОГО набора
 * этой иконки (собираются ДО переименования) — чужие @keyframes не трогаются.
 *
 * Корневые атрибуты <svg> НЕ префиксуются: в спрайте они всё равно
 * отбрасываются (root → symbol), а в инлайне root-class мержится через
 * projectSvg (options.class). Префиксуется содержимое иконки.
 *
 * Вход — нормализованный SVG (шаг 1: без пролога/комментариев). Выход —
 * детерминированный: два вызова на одном входе дают байт-идентичный результат.
 *
 * Ошибки — Error с префиксом [svg:prefix] (fail-fast, как normalize):
 * невалидный prefix (должен начинаться с буквы или "_", далее буквы/цифры/
 * "-"/"_" — имя идет в id и CSS-префикс), нечитаемый XML, нет корневого <svg>.
 * =================================================================================================
 */

import { parseSvg } from "svgo/lib/parser.js";
import { stringifySvg } from "svgo/lib/stringifier.js";

import { parseStyleDecls } from "./utils/parse-style.js";

const ERROR_PREFIX = "[svg:prefix]";

/** Префикс идет в id и CSS-префикс — должен быть валидным идентификатором. */
const NAME_RE = /^[A-Za-z_][\w-]*$/;

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
 * Замены @keyframes/url(#) выполняются ОДНОКРАТНО до структурного обхода:
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

/** Корневой <svg> AST (может отсутствовать в мусорном входе). */
const svgRoot = (ast) =>
  ast.children.find((child) => child.type === "element" && child.name === "svg");

/** Обход AST с префиксацией. Мутирует ast; ключframes собираются до обхода. */
const prefixAst = (ast, prefix) => {
  const root = svgRoot(ast);
  if (root === undefined) {
    throw new Error(`${ERROR_PREFIX} no <svg> root element`);
  }
  const keyframes = collectKeyframes(
    root.children
      .filter((child) => child.type === "element" && child.name === "style")
      .flatMap((style) => style.children.filter((c) => c.type === "text" || c.type === "cdata"))
      .map((node) => String(node.value))
      .join("\n"),
  );
  walk(root, prefix, keyframes);
  return ast;
};

/**
 * Префиксирует идентификаторы SVG. Чистая, синхронная, детерминированная.
 * @param {string} svgContent Нормализованный SVG (шаг 1).
 * @param {string} prefix Валидный идентификатор (имя иконки).
 * @returns {string}
 */
export function prefixSvg(svgContent, prefix) {
  const name = String(prefix);
  if (!NAME_RE.test(name)) {
    throw new Error(`${ERROR_PREFIX} invalid prefix "${name}"`);
  }

  let ast;
  try {
    ast = parseSvg(String(svgContent));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_PREFIX} unparseable XML (${message})`);
  }

  prefixAst(ast, name);
  return stringifySvg(ast);
}
