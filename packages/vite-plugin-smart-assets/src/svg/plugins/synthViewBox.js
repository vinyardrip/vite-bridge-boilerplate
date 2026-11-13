/**
 * =================================================================================================
 * synthViewBox — гарантирует viewBox на корневом <svg>
 * =================================================================================================
 *
 * Первый кастомный плагин пресета, вызывается ДО removeDimensions:
 *
 *   • есть непустой viewBox            → no-op;
 *   • есть width/height (числа > 0,
 *     суффикс px допустим)             → viewBox = "0 0 {width} {height}";
 *   • иначе                            → throw: без размеров SVG дальше по
 *                                        конвейеру не поедет ни в каком виде.
 *
 * Не вычисляет bbox по содержимому и не угадывает 24×24 — осознанное
 * решение: никаких скрытых эвристик.
 * =================================================================================================
 */

/** Длина SVG: число с опциональной экспонентой и опциональным суффиксом px. */
const LENGTH_RE = /^\s*([0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\s*(?:px)?\s*$/;

/** @param {string | undefined} value @returns {number | null} Число > 0 или null. */
const parseLength = (value) => {
  if (value === undefined) {
    return null;
  }
  const match = LENGTH_RE.exec(String(value));
  if (!match) {
    return null;
  }
  const num = Number.parseFloat(match[1]);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const synthViewBox = {
  name: "synthViewBox",
  type: "visitor",
  fn: () => ({
    element: {
      enter: (node, parentNode) => {
        if (node.name !== "svg" || parentNode.type !== "root") {
          return;
        }
        if (node.attributes.viewBox && node.attributes.viewBox.trim() !== "") {
          return;
        }
        const width = parseLength(node.attributes.width);
        const height = parseLength(node.attributes.height);
        if (width !== null && height !== null) {
          node.attributes.viewBox = `0 0 ${width} ${height}`;
          return;
        }
        throw new Error(
          "[svg:normalize] cannot determine size: no viewBox and no width/height.\n" +
            "Fix the source file or add viewBox manually.",
        );
      },
    },
  }),
};

export default synthViewBox;
