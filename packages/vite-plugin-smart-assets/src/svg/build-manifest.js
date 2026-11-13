/**
 * =================================================================================================
 * build-manifest — SVG-фрагмент манифеста (entries) и его слияние с общим манифестом
 * =================================================================================================
 *
 *   buildSvgManifest(svgAssets) → { entries: [{ source, file, kind, mode, symbol, hash }] }
 *   mergeSvgManifest(existing, fragment) → новый объект манифеста
 *
 * buildSvgManifest — чистый форматировщик: превращает обработанные SVG-ассеты
 * (выход classify/assignModes + пути сборки) в записи манифеста. Возвращается
 * ФРАГМЕНТ { entries: [...] }, который затем смержен с общим манифестом сборки
 * (assets-manifest.json плагина, массив entries) — сам модуль I/O не делает,
 * чтение/запись на диске остаются у плагина (generateBundle), как у classify и
 * build-sprite (чистые функции без fs).
 *
 * Поля записи (ключ для верстальщиков — source, путь исходника):
 *   source — исходный путь ("raw/icons/user.svg");
 *   file   — путь артефакта от корня outDir, ВСЕГДА относительный, без ведущего
 *            "/" ("assets/icons/sprite.a1b2c3d4.svg") — это контракт check-build;
 *            ведущие слеши url срезаются, а не пробрасываются дальше;
 *   kind   — "icon" | "animated" | "sprite" | "illustration" (classify);
 *   mode   — "inline" | "sprite" | "img" | "error" (assignModes);
 *   symbol — id символа в спрайте, только у mode: "sprite"; у остальных — undefined;
 *   hash   — 8-символьный контентный хеш (конвенция проекта).
 *
 * Правила file по mode:
 *   inline → "assets/ui/<имя>.svg" — вычисляется из source (имя без расширения,
 *            без подпапок), url игнорируется; файл всё равно эмитится в dist,
 *            чтобы PHP мог его прочитать;
 *   sprite/img → file из url (путь спрайта / оптимизированного SVG);
 *   error → file: null — unknown-файл не обрабатывается и не эмитится.
 *
 * Записи сортируются по source (детерминизм, как символы в buildSprite и
 * entries растра в плагине) — два вызова на одном наборе дают одинаковый массив.
 *
 * mergeSvgManifest(existing, fragment) — чистое слияние: возвращает НОВЫЙ
 * объект, существующий не мутируется. Все посторонние поля манифеста
 * (plugin, version, rawDir, …) и чужие entries (растр, JS/CSS) сохраняются
 * как были; SVG-запись с уже существующим source ЗАМЕНЯЕТ старую (идемпотентность
 * повторной сборки, source — ключ), остальные добавляются в конец.
 *
 * Ошибки — Error с префиксом [svg:build-manifest] (fail-fast, как в соседних
 * модулях): svgAssets не массив, пустой source, неизвестный mode (модуль tightly
 * связан со словарем assignModes — пятое значение означает баг выше по конвейеру).
 * =================================================================================================
 */

const ERROR_PREFIX = "[svg:build-manifest]";
const UI_DIR = "assets/ui";

/** Словарь mode из assignModes (classify.js) — пятое значение = баг конвейера. */
const MODES = new Set(["inline", "sprite", "img", "error"]);

/** Имя без расширения и без подпапок: "raw/icons/nav/arrow.svg" → "arrow". */
const stemOf = (source) => {
  const file = source.slice(source.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
};

/** file всегда относительный: ведущие слеши срезаются (контракт check-build). */
const toRelative = (url) => String(url).replace(/^\/+/, "");

/** Один обработанный SVG → запись манифеста. Поля в порядке ТЗ. */
const toEntry = (asset) => {
  const source = String(asset.source ?? "");
  if (source === "") {
    throw new Error(`${ERROR_PREFIX} запись без source (исходный путь — ключ манифеста)`);
  }
  const mode = asset.mode;
  if (!MODES.has(mode)) {
    throw new Error(`${ERROR_PREFIX} "${source}": неизвестный mode "${mode}"`);
  }

  const file =
    mode === "inline"
      ? `${UI_DIR}/${stemOf(source)}.svg`
      : mode === "error" || asset.url === undefined || asset.url === null
        ? null
        : toRelative(asset.url);

  return {
    source,
    file,
    kind: asset.kind,
    mode,
    symbol: mode === "sprite" ? asset.symbol : undefined,
    hash: asset.hash,
  };
};

/**
 * Формирует SVG-фрагмент манифеста. Чистая, синхронная.
 * @param {Array<{ source: string, kind: string, mode: string, url?: string, hash?: string, symbol?: string }>} svgAssets
 * @returns {{ entries: Array<{ source: string, file: string|null, kind: string, mode: string, symbol: string|undefined, hash: string|undefined }> }}
 */
export function buildSvgManifest(svgAssets) {
  if (!Array.isArray(svgAssets)) {
    throw new Error(`${ERROR_PREFIX} ожидался массив svgAssets, пришло ${typeof svgAssets}`);
  }
  const entries = svgAssets.map(toEntry).sort((a, b) => a.source.localeCompare(b.source));
  return { entries };
}

/**
 * Сливает SVG-фрагмент с существующим манифестом (чистая: existing не мутируется).
 * Посторонние поля и чужие entries сохраняются; повторный merge с тем же
 * фрагментом не создает дублей (записи заменяются по source).
 * @param {object} [existing] Манифест сборки (например, assets-manifest.json плагина).
 * @param {{ entries: Array<object> }} [fragment] Фрагмент из buildSvgManifest.
 * @returns {object} Новый объект манифеста.
 */
export function mergeSvgManifest(existing, fragment) {
  const manifest = existing ?? {};
  const svgEntries = fragment?.entries ?? [];
  const svgBySource = new Map(svgEntries.map((entry) => [entry.source, entry]));
  const kept = (manifest.entries ?? []).filter((entry) => !svgBySource.has(entry.source));
  return { ...manifest, entries: [...kept, ...svgEntries] };
}
