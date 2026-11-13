/**
 * =================================================================================================
 * extract-meta — вынимает метаданные файла до svgo
 * =================================================================================================
 *
 * Прямые дочерние <title>/<desc> корневого <svg> — метаданные файла: svgo
 * (preset-default, removeTitle/removeDesc) удаляет их безвозвратно, а они
 * нужны вызывающей стороне (aria-label инлайн-проекции). Вложенные
 * <title>/<desc> внутри <g>/<symbol>/<mask>... — часть содержимого, их НЕ
 * трогаем (в пресете removeTitle/removeDesc отключены по этой же причине).
 *
 * Контракт:
 *   extractMeta(svgSource: string) → { svg: string, meta: { title?, desc? } }
 *   • найдено → элемент вырезан из строки, текст (trim) в meta;
 *   • не найдено → ключа в meta просто нет (не undefined-значение);
 *   • никакого I/O и полного XML-парсинга: токен-сканер глубины с пропусками
 *     комментариев и CDATA (в них <title> — не элемент).
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
  let pos = rootOpenEnd + 1;
  let depth = 0; // 0 — прямые дети корня

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
      depth -= 1;
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

    // Прямой ребёнок корня <title>/<desc> (первый каждый) — захватить целиком.
    if (depth === 0 && (name === "title" || name === "desc") && !found[name]) {
      if (selfClosing) {
        // <title/> без содержимого — не метаданные, но и не контент: вырезаем,
        // чтобы не осталось пустых элементов после отключённого removeTitle.
        removals.push({ start: lt, end: gt + 1 });
        found[name] = true;
        pos = gt + 1;
        continue;
      }
      const close = src.indexOf(`</${name}`, gt + 1);
      if (close === -1) {
        pos = gt + 1;
        continue; // незакрытый — svgo выдаст ошибку парсинга со своим сообщением
      }
      const closeEnd = src.indexOf(">", close);
      const afterClose = closeEnd === -1 ? src.length : closeEnd + 1;
      const inner = src.slice(gt + 1, close);
      // Разметки внутри title/desc не ждём — текст как есть.
      meta[name] = inner.replace(/<[^>]*>/g, "").trim();
      removals.push({ start: lt, end: afterClose });
      found[name] = true;
      // Сканируем ЗА вырезанным элементом: его закрывающий тег не должен
      // декрементировать глубину.
      pos = afterClose;
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
