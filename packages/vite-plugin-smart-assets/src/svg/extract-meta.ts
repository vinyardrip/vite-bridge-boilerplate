/**
 * =================================================================================================
 * extract-meta — вынимает метаданные файла до svgo
 * =================================================================================================
 *
 * ВСЕ <title>/<desc> В ДОКУМЕНТЕ (на любой глубине — Figma кладет <title>
 * внутрь <g>/<symbol>) вырезаются; в meta попадает ПЕРВЫЙ в порядке
 * документа каждого имени. Почему все, а не только первый: нормализация
 * обязана быть идемпотентной (normalize(normalize(x)) === normalize(x)) —
 * если вырезать только первый, на втором прогоне «второй» станет первым и
 * уйдет в meta, изменив вывод. svgo (preset-default, removeTitle/removeDesc)
 * удалил бы их безвозвратно в любом случае, а первый нужен вызывающей
 * стороне (aria-label инлайн-проекции). Внутри комментариев и CDATA
 * элементы не ищутся (там <title> — не элемент).
 *
 * Контракт:
 *   extractMeta(svgSource: string) → { svg: string, meta: { title?, desc? } }
 *   • найдено → все элементы целиком вырезаны (вместе с вложенными в них
 *     узлами), текст первого (без тегов, trim) в meta;
 *   • не найдено → ключа в meta просто нет (не undefined-значение);
 *   • <title/>/<desc/> без содержимого — вырезаются, meta не получают;
 *   • никакого I/O и полного XML-парсинга: токен-сканер глубины. Незакрытый
 *     <title> захватом не считается — svgo выдаст ошибку парсинга со своим
 *     сообщением.
 * =================================================================================================
 */

const ROOT_TAG_RE = /<svg[\s>]/;

/**
 * @param {string} svgSource
 * @returns {{ svg: string, meta: { title?: string, desc?: string } }}
 */
export function extractMeta(svgSource) {
  const src = String(svgSource);
  const meta = /** @type {{ title?: string, desc?: string }} */ ({});

  const rootMatch = ROOT_TAG_RE.exec(src);
  if (!rootMatch) {
    return { svg: src, meta };
  }

  // Конец открывающего тега корня (атрибуты корня с '>' внутри кавычек —
  // за пределами контракта, достаточно первого '>').
  const rootOpenEnd = src.indexOf(">", rootMatch.index);
  if (rootOpenEnd === -1) {
    return { svg: src, meta };
  }

  /** Вырезки: [{ start, end }] — удаляем от больших индексов к меньшим. */
  const removals = [];
  const found = { title: false, desc: false };
  /** Открытые захваты: { name, start, depth, contentStart } — ждут </title>. */
  const captures = { title: null, desc: null };
  let depth = 0; // 0 — прямые дети корня
  let pos = rootOpenEnd + 1;

  while (pos < src.length) {
    const lt = src.indexOf("<", pos);
    if (lt === -1) {
      break;
    }

    // Комментарий: содержимое не парсим.
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      pos = end === -1 ? src.length : end + 3;
      continue;
    }

    // CDATA: внутри могут быть '<'.
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      pos = end === -1 ? src.length : end + 3;
      continue;
    }

    // Закрывающий тег.
    if (src.startsWith("</", lt)) {
      const gt = src.indexOf(">", lt);
      if (gt === -1) {
        break;
      }
      const nameMatch = /^<\/([a-zA-Z][\w:.-]*)/.exec(src.slice(lt, gt + 1));
      depth -= 1;
      const capture = nameMatch ? captures[nameMatch[1]] : null;
      if (capture && depth === capture.depth) {
        // Парный закрывающий тег захвата: элемент завершен — вырезаем целиком;
        // meta получает только ПЕРВЫЙ capture каждого имени (isMeta).
        if (capture.isMeta) {
          meta[capture.name] = src
            .slice(capture.contentStart, lt)
            .replace(/<[^>]*>/g, "")
            .trim();
        }
        removals.push({ start: capture.start, end: gt + 1 });
        captures[capture.name] = null;
      }
      pos = gt + 1;
      continue;
    }

    // Открывающий тег: имя + self-closing.
    const nameMatch = /^<([a-zA-Z][\w:.-]*)/.exec(src.slice(lt, lt + 64));
    if (!nameMatch) {
      pos = lt + 1;
      continue;
    }
    const name = nameMatch[1];
    const gt = src.indexOf(">", lt);
    if (gt === -1) {
      break;
    }
    const selfClosing = src[gt - 1] === "/";

    if ((name === "title" || name === "desc") && captures[name] === null) {
      if (selfClosing) {
        // <title/> без содержимого — не метаданные, но и не контент: вырезаем.
        removals.push({ start: lt, end: gt + 1 });
        pos = gt + 1;
        continue;
      }
      // <title>/<desc> на ЛЮБОЙ глубине — захват до парного закрытия.
      // Глубину и текст внутри ведёт сам сканер: вложенные теги декрементируют/
      // инкрементируют depth как обычно, парный close завершает захват.
      // meta — только у первого (isMeta фиксируется при старте захвата).
      captures[name] = { name, start: lt, depth, contentStart: gt + 1, isMeta: !found[name] };
      found[name] = true;
      depth += 1;
      pos = gt + 1;
      continue;
    }

    if (!selfClosing) {
      depth += 1;
    }
    pos = gt + 1;
  }

  if (removals.length === 0) {
    return { svg: src, meta };
  }

  let out = src;
  for (const { start, end } of removals.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, start) + out.slice(end);
  }
  return { svg: out, meta };
}
