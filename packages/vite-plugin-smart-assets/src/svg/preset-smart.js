/**
 * =================================================================================================
 * preset-smart — пресет svgo конвейера нормализации
 * =================================================================================================
 *
 * Порядок плагинов — ЧАСТЬ КОНТРАКТА (детерминированный вывод), менять
 * нельзя:
 *
 *   1. preset-default с overrides — безопасный минимум дефолтов;
 *   2. synthViewBox            — viewBox гарантирован ДО removeDimensions;
 *   3. removeDimensions        — width/height корня снимаются (размер задает
 *                                проекция через CSS);
 *   4. removeComments, removeMetadata, removeEditorsNSData;
 *   5. sortAttrs               — детерминизм атрибутов (в svgo 3 уже входит
 *                                в preset-default — здесь явно, повторный
 *                                прогон идемпотентен и поведение не меняет);
 *   6. normalizeStyleElement   — канонический CSS внутри <style>;
 *   7. convertColorsToCurrent  — единственный цвет → currentColor (решение
 *                                по всему дереву — поэтому последний).
 *
 * Почему дефолты отключены (overrides):
 *   removeViewBox            — symbol без viewBox = 0×0;
 *   cleanupIds               — рвет url(#...) (градиенты, mask, use);
 *   removeUnknownsAndDefaults— удаляет xmlns:xlink, role по эвристике;
 *   convertPathData          — плавающие пути → нестабильное сравнение файлов;
 *   mergePaths               — меняет порядок заливки при fill-rule="evenodd";
 *   collapseGroups           — ломается при transform/mask/clip-path на группе;
 *   convertColors            — заменяем собственным правилом (current-color);
 *   removeTitle, removeDesc  — удаляют ВСЕ <title>/<desc>, включая вложенные
 *                                в <g>/<symbol> (контент, не метаданные);
 *                                прямые дети корня уже вынул extract-meta.
 *   removeHiddenElems        — считает неиспользуемые <symbol> скрытыми и
 *                                вырезает их; файл-контейнер (kind sprite
 *                                классификатора) без символов теряет смысл.
 *   minifyStyles             — csso дожёвывает осиротевший @media: после
 *                                inlineStyles (вырезавшей совпавшие селекторы)
 *                                медиа-блок выпадает целиком; каскад @media
 *                                обязан выживать. Бонус: hex-цвета не
 *                                переименовываются (#f00 → red).
 * =================================================================================================
 */

import removeDimensions from "svgo/plugins/removeDimensions.js";
import removeComments from "svgo/plugins/removeComments.js";
import removeMetadata from "svgo/plugins/removeMetadata.js";
import removeEditorsNSData from "svgo/plugins/removeEditorsNSData.js";
import sortAttrs from "svgo/plugins/sortAttrs.js";

import synthViewBox from "./plugins/synthViewBox.js";
import normalizeStyleElement from "./plugins/normalizeStyleElement.js";
import convertColorsToCurrent from "./plugins/convertColorsToCurrent.js";

export const presetSmart = [
  {
    name: "preset-default",
    params: {
      overrides: {
        removeViewBox: false,
        cleanupIds: false,
        removeUnknownsAndDefaults: false,
        convertPathData: false,
        mergePaths: false,
        collapseGroups: false,
        convertColors: false,
        removeTitle: false,
        removeDesc: false,
        removeHiddenElems: false,
        minifyStyles: false,
      },
    },
  },
  synthViewBox,
  removeDimensions,
  removeComments,
  removeMetadata,
  removeEditorsNSData,
  sortAttrs,
  normalizeStyleElement,
  convertColorsToCurrent,
];
