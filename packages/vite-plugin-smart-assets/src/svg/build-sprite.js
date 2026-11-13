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
 * Префиксация (коллизии при склейке) живет в prefix.js (шаг 3, prefixSvg) —
 * она же нужна инлайн-иконкам; buildSymbol вызывает prefixSvg(content, name)
 * и конвертирует префиксированный корень в <symbol>. Требования (id/class,
 * url(#), href, селекторы и @keyframes в <style>) см. в докблоке prefix.js.
 *
 * Ошибки — Error с префиксом [svg:build-sprite] (fail-fast, как normalize):
 * дубликат имени, невалидное имя (должно начинаться с буквы или "_", далее
 * буквы/цифры/"-"/"_"), нет viewBox у корня, нечитаемый XML.
 * =================================================================================================
 */

import { parseSvg } from "svgo/lib/parser.js";
import { stringifySvg } from "svgo/lib/stringifier.js";

import { prefixSvg } from "./prefix.js";

const ERROR_PREFIX = "[svg:build-sprite]";

/** Имя иконки идет в id и CSS-префикс — должно быть валидным идентификатором. */
const NAME_RE = /^[A-Za-z_][\w-]*$/;

const SPRITE_ROOT_TAG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden" aria-hidden="true">';

/** Одна иконка → XML <symbol id="[name]" viewBox="...">...</symbol>. */
const buildSymbol = ({ name, content }) => {
  // Свой парсинг ДО prefixSvg: сообщения об ошибках остаются в домене
  // build-sprite (Блок F спека ассертит [svg:build-sprite] + icon "name").
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

  // Префиксация (шаг 3). Повторный парсинг внутри prefixSvg и здесь —
  // осознанно: prefixSvg самостоятельный контракт (string → string), вход
  // уже валиден, цена — пару микросекунд на KB-размерах иконок.
  const prefixed = prefixSvg(String(content), name);

  let symbolAst;
  try {
    symbolAst = parseSvg(prefixed);
  } catch (error) {
    // Непобедимо для валидного входа (уже дважды распарсен), но fail-fast честнее.
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_PREFIX} icon "${name}": ${message}`);
  }

  // Корень → символ: атрибуты <svg> отбрасываются, переносится только viewBox.
  const symbol = symbolAst.children.find(
    (child) => child.type === "element" && child.name === "svg",
  );
  symbol.name = "symbol";
  symbol.attributes = { id: name, viewBox: viewBox.trim() };

  return stringifySvg(symbolAst);
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
