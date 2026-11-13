/**
 * =================================================================================================
 * utils/parse-style — общий парсер инлайн-стиля (единственный источник)
 * =================================================================================================
 *
 *   parseStyleDecls(styleValue: string) → [{ prop, value }]
 *
 * Значение style-атрибута → массив деклараций { prop, value } в порядке
 * появления: prop в нижнем регистре и без пробелов, value как есть (trim),
 * декларации без ':' и с пустым prop отбрасываются. Пользователей трое:
 * convertColorsToCurrent (шаг 1), classify (шаг 4), prefix (шаг 3) —
 * одинаковая семантика разбора обязательна, иначе шаги разойдутся в том,
 * что считается fill/stroke-декларацией.
 * =================================================================================================
 */

/**
 * @param {string} styleValue
 * @returns {Array<{ prop: string, value: string }>}
 */
export const parseStyleDecls = (styleValue) =>
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
