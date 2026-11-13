/**
 * =================================================================================================
 * convertColorsToCurrent — единственный цвет → currentColor
 * =================================================================================================
 *
 * Иконка монохромна (все fill/stroke — атрибуты и инлайн-стили — дают
 * РОВНО один цвет) → этот цвет заменяется на currentColor: проекции
 * окрашиваются CSS-свойством color. Многоцвет и градиенты — не трогаем.
 *
 *   • в теле есть ссылка url(#...) (градиент/mask/clip-path — атрибуты или
 *     <style>) → no-op: перекраска сломала бы ссылки и палитру;
 *   • "none" и "currentColor" — не цвета, в множество не входят
 *     (fill="none" + stroke="#333" — корректный монохром-случай);
 *   • множество пустое или больше одного → no-op.
 *
 * Плагин идёт ПОСЛЕДНИМ в пресете: решает по всему дереву целиком,
 * двухпроходно (собрать → решить → заменить). Идемпотентен: на входе с
 * currentColor множество пусто → no-op.
 * =================================================================================================
 */

/** Значение — рабочий цвет? ("" / none / currentColor / url(...) — нет). */
const asColor = (value) => {
  const v = String(value).trim();
  if (v === "" || v === "none" || v === "currentColor" || v.includes("url(")) {
    return null;
  }
  return v.toLowerCase();
};

/** Декларации инлайн-стиля: [{ prop, value }] (порядок сохранён). */
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

const convertColorsToCurrent = {
  name: "convertColorsToCurrent",
  type: "visitor",
  fn: (root) => {
    let hasUrlRef = false;
    const colors = new Set();
    /** { node, name, color } — атрибуты fill/stroke. */
    const attrTargets = [];
    /** { node, prop, color } — инлайн-стили. */
    const styleTargets = [];

    const walk = (node) => {
      for (const child of node.children) {
        if (child.type !== "element") {
          // Текст <style> тоже часть тела: url(#) в CSS-правилах блокирует конвертацию.
          if (child.type === "text" && node.name === "style" && child.value.includes("url(#")) {
            hasUrlRef = true;
          }
          continue;
        }
        for (const [name, value] of Object.entries(child.attributes)) {
          if (String(value).includes("url(#")) {
            hasUrlRef = true;
          }
          if (name === "fill" || name === "stroke") {
            const color = asColor(value);
            if (color !== null) {
              colors.add(color);
              attrTargets.push({ node: child, name, color });
            }
          }
        }
        const styleValue = child.attributes.style;
        if (styleValue !== undefined) {
          for (const decl of parseStyleDecls(styleValue)) {
            if (String(decl.value).includes("url(#")) {
              hasUrlRef = true;
            }
            if (decl.prop === "fill" || decl.prop === "stroke") {
              const color = asColor(decl.value);
              if (color !== null) {
                colors.add(color);
                styleTargets.push({ node: child, prop: decl.prop, color });
              }
            }
          }
        }
        walk(child);
      }
    };
    walk(root);

    if (hasUrlRef || colors.size !== 1) {
      return;
    }
    const [only] = colors;

    for (const target of attrTargets) {
      if (target.color === only) {
        target.node.attributes[target.name] = "currentColor";
      }
    }
    for (const target of styleTargets) {
      if (target.color !== only) {
        continue;
      }
      target.node.attributes.style = parseStyleDecls(target.node.attributes.style)
        .map((decl) =>
          (decl.prop === "fill" || decl.prop === "stroke") && asColor(decl.value) === only
            ? `${decl.prop}:currentColor`
            : `${decl.prop}:${decl.value}`,
        )
        .join(";");
    }
  },
};

export default convertColorsToCurrent;
