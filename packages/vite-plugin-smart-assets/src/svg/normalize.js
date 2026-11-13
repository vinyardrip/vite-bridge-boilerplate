/**
 * =================================================================================================
 * normalize — единственная публичная точка входа SVG-нормализации
 * =================================================================================================
 *
 *   normalize(svgSource: string) → { svg: string, meta: { title?: string, desc?: string } }
 *
 * Гарантии (проверяются тестами):
 *   • детерминизм — два вызова на одном входе дают байт-идентичный svg;
 *   • идемпотентность — normalize(normalize(x).svg).svg === normalize(x).svg;
 *   • viewBox гарантирован (или throw);
 *   • id/class/url(#...)/mask/clip-path/<animate*> сохранены;
 *   • единственный цвет → currentColor; градиент и многоцвет — не трогаются;
 *   • width/height и x/y на корне отсутствуют.
 *
 * Контракт: вход — строка; никаких I/O, console.* и глобального состояния;
 * ошибки — только Error с префиксом [svg:normalize]. Всё, что сверх этого
 * (сравнение файлов, классификация, проекции), — снаружи, шагами конвейера.
 * =================================================================================================
 */

import { optimize } from "svgo";

import { extractMeta } from "./extract-meta.js";
import { presetSmart } from "./preset-smart.js";

const ERROR_PREFIX = "[svg:normalize]";

/**
 * @param {string} svgSource Сырой SVG из файла.
 * @returns {{ svg: string, meta: { title?: string, desc?: string } }}
 */
export function normalize(svgSource) {
  const { svg, meta } = extractMeta(svgSource);

  let result;
  try {
    result = optimize(svg, { plugins: presetSmart });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Ошибки кастомных плагинов уже с префиксом — не заворачиваем дважды.
    if (message.startsWith(ERROR_PREFIX)) {
      throw error;
    }
    throw new Error(`${ERROR_PREFIX} ${message}`);
  }

  return { svg: result.data, meta };
}
