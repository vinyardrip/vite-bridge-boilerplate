/**
 * =================================================================================================
 * normalizeStyleElement — канонический формат CSS внутри <style>
 * =================================================================================================
 *
 * Нормализует ТОЛЬКО пробелы: разные форматирования одного и того же CSS
 * (однострочник / многострочник) дают байт-идентичный вывод — фундамент
 * стабильного сравнения файлов. Имена селекторов, порядок правил и
 * деклараций, имена @keyframes — НЕ трогаются (каскад и префиксация —
 * предмет более поздних шагов конвейера; @media-блоки обрабатываются
 * рекурсивно той же канонизацией).
 *
 * Формат: `sel{prop:value;prop2:value2}` — правило за правилом без
 * разделителей; комментарии CSS вырезаются (несемантичны, minifyStyles из
 * preset-default обычно уже удалил их до нас).
 * =================================================================================================
 */

/** Сжать пробельные серии к одному пробелу и обрезать края.
 * @param {string} value @returns {string} */
const collapse = (value) => value.replace(/\s+/g, " ").trim();

/** Сплит по ';' вне скобок (url(data:...;...) и функции). @param {string} text */
const splitTopLevel = (text) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    }
    if (ch === ";" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") {
    parts.push(current);
  }
  return parts;
};

/** Канонизация блока деклараций: `prop:value;...` (порядок сохранён). */
const normalizeDeclarations = (block) =>
  splitTopLevel(block)
    .map((decl) => {
      const idx = decl.indexOf(":");
      if (idx === -1) {
        return collapse(decl);
      }
      const prop = collapse(decl.slice(0, idx)).toLowerCase();
      const value = collapse(decl.slice(idx + 1));
      return value === "" ? null : `${prop}:${value}`;
    })
    .filter((decl) => decl !== null)
    .join(";");

/**
 * Канонизация CSS-текста: qualified rules и at-rules, вложенные блоки
 * (@media, @supports, @keyframes) — рекурсивно. Имена сохраняются.
 * @param {string} css @returns {string}
 */
const normalizeCss = (css) => {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let pos = 0;

  while (pos < src.length) {
    // Пропуск пробелов между правилами (первый непробельный символ).
    const nextNonSpace = /\S/.exec(src.slice(pos));
    if (nextNonSpace === null) {
      break;
    }
    pos += nextNonSpace.index;

    const open = src.indexOf("{", pos);
    const nextSemicolon = src.indexOf(";", pos);
    // At-rule без блока (@charset, @import): до ';'.
    if (src[pos] === "@" && (nextSemicolon !== -1 && (open === -1 || nextSemicolon < open))) {
      const end = nextSemicolon + 1;
      out.push(collapse(src.slice(pos, end - 1)) + ";");
      pos = end;
      continue;
    }
    if (open === -1) {
      break;
    }

    const prelude = collapse(src.slice(pos, open));
    // Парная '}' с учётом вложенности.
    let depth = 1;
    let close = open + 1;
    while (close < src.length && depth > 0) {
      if (src[close] === "{") {
        depth += 1;
      } else if (src[close] === "}") {
        depth -= 1;
      }
      close += 1;
    }
    const body = src.slice(open + 1, close - 1);

    // Вложенный блок (@media/@supports/@keyframes/...) — рекурсия, иначе декларации.
    const inner = body.includes("{") ? normalizeCss(body) : normalizeDeclarations(body);
    out.push(inner === "" ? `${prelude}{}` : `${prelude}{${inner}}`);
    pos = close;
  }

  return out.join("");
};

const normalizeStyleElement = {
  name: "normalizeStyleElement",
  type: "visitor",
  fn: () => ({
    element: {
      enter: (node) => {
        if (node.name !== "style") {
          return;
        }
        const textNode = node.children.find((child) => child.type === "text");
        if (!textNode) {
          return;
        }
        textNode.value = normalizeCss(String(textNode.value));
      },
    },
  }),
};

export default normalizeStyleElement;
