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
 *   inline → "<scope>/ui/<имя>.svg" — вычисляется из source С УЧЕТОМ options.scope
 *            (имя без расширения, без подпапок), url игнорируется; файл всё равно
 *            эмитится, чтобы PHP мог его прочитать;
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

import type { ManifestEntry, SvgAssetInput, SvgEntry, SvgManifestFragment, SvgMode } from "../types.ts";

const ERROR_PREFIX = "[svg:build-manifest]";

/** Словарь mode из assignModes (classify.js) — пятое значение = баг конвейера. */
const MODES = new Set<SvgMode>(["inline", "sprite", "img", "error"]);

/** Имя без расширения и без подпапок: "raw/icons/nav/arrow.svg" → "arrow". */
const stemOf = (source: string): string => {
  const file = source.slice(source.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
};

/** file всегда относительный: ведущие слеши срезаются (контракт check-build). */
const toRelative = (url: string): string => String(url).replace(/^\/+/, "");

/** Каталог инлайнов от корня outDir с учетом scope: "assets" → assets/ui, "" (WP) → ui. */
const uiDirOf = (scope: string): string => `${scope ? `${scope}/` : ""}ui`;

/** Один обработанный SVG → запись манифеста. Поля в порядке ТЗ. */
const toEntry = (asset: SvgAssetInput, uiDir: string): SvgEntry => {
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
      ? `${uiDir}/${stemOf(source)}.svg`
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
 * @param {object} [options]
 * @param {string} [options.scope="assets"] Каталог внутри outDir ("" — WP-сборка, плоско):
 *   путь inline-файла в записи вычисляется из source С УЧЕТОМ scope, чтобы совпадать
 *   с реально эмиттенным файлом (uiDirOf) — иначе в WP-сборке file указывал бы
 *   на несуществующий "assets/ui/…".
 * @returns {{ entries: Array<{ source: string, file: string|null, kind: string, mode: string, symbol: string|undefined, hash: string|undefined }> }}
 */
export function buildSvgManifest(
  svgAssets: SvgAssetInput[],
  { scope = "assets" }: { scope?: string } = {},
): SvgManifestFragment {
  if (!Array.isArray(svgAssets)) {
    throw new Error(`${ERROR_PREFIX} ожидался массив svgAssets, пришло ${typeof svgAssets}`);
  }
  const uiDir = uiDirOf(scope);
  const entries = svgAssets
    .map((asset) => toEntry(asset, uiDir))
    .sort((a, b) => a.source.localeCompare(b.source));
  return { entries };
}

/**
 * Сливает SVG-фрагмент с существующим манифестом (чистая: existing не мутируется).
 * Посторонние поля и чужие entries сохраняются; повторный merge с тем же
 * фрагментом не создает дублей (записи заменяются по source).
 *
 * existing — «чужой» манифест (assets-manifest.json плагина, объект Vite-манифеста
 * с произвольными ключами): читаются только entries[].source, остальные поля
 * переносятся как есть ([key: string]: unknown).
 * @param {object} [existing] Манифест сборки (например, assets-manifest.json плагина).
 * @param {{ entries: Array<object> }} [fragment] Фрагмент из buildSvgManifest.
 * @returns {object} Новый объект манифеста.
 */
export function mergeSvgManifest(
  existing?: { entries?: Array<{ source: string }>; [key: string]: unknown } | null,
  fragment?: SvgManifestFragment | null,
): { entries: ManifestEntry[]; [key: string]: unknown } {
  // existing может быть пустым объектом — строгий тип через cast (runtime не менялся).
  const manifest = existing ?? ({} as { entries?: Array<{ source: string }>; [key: string]: unknown });
  const svgEntries = fragment?.entries ?? [];
  const svgBySource = new Map<string, SvgEntry>(svgEntries.map((entry) => [entry.source, entry]));
  // Чужие entries обрабатываются непрозрачно (читается только source) —
  // на выходе типизируются как ManifestEntry[] (cast, runtime не менялся).
  const kept = (manifest.entries ?? []).filter(
    (entry) => !svgBySource.has(entry.source),
  ) as ManifestEntry[];
  return { ...manifest, entries: [...kept, ...svgEntries] };
}
