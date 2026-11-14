/**
 * =================================================================================================
 * types — общие типы пакета (миграция на TypeScript)
 * =================================================================================================
 *
 * Ключевые сущности конвейера (контракты ТЗ миграции):
 *   SvgEntry       — запись SVG в assets-manifest.json (build-manifest.ts);
 *   AssetOptions   — options проекции projectSvg (project.ts);
 *   ClassifyResult — результат classifyOne (classify.ts).
 *
 * Растровые записи манифеста (RasterEntry) и входные типы модулей — рядом,
 * чтобы сигнатуры модулей ссылались на один источник правды.
 * =================================================================================================
 */

import type { Plugin as SvgoPlugin } from "svgo/lib/types.js";
import type { Plugin as VitePlugin } from "vite";

/*! --- SVG-конвейер --- */

/** kind классификатора (classify.ts). */
export type SvgKind = "sprite" | "animated" | "illustration" | "icon" | "unknown";

/** mode assignModes (classify.ts): куда пойдет SVG. */
export type SvgMode = "inline" | "sprite" | "img" | "error";

/** Метаданные, вынутые extractMeta до svgo. */
export interface SvgMeta {
  title?: string;
  desc?: string;
}

/** Результат classifyOne: kind и причина решения. */
export interface ClassifyResult {
  kind: SvgKind;
  reason: string;
}

/** Вход assignModes: измеренная (по нормализованному контенту) иконка. */
export interface AssignItem {
  path: string;
  kind: SvgKind;
  size: number;
  gzipSize: number;
}

/** Пороги агрегата inline vs sprite (assignModes). */
export interface AssignThresholds {
  count?: number;
  rawBytes?: number;
  gzipBytes?: number;
}

/** Выход assignModes: { path, kind } + решенный mode. */
export interface AssignResult {
  path: string;
  kind: SvgKind;
  mode: SvgMode;
  reason: string;
}

/**
 * Запись SVG в assets-manifest.json (ключ верстальщиков — source).
 * file всегда относителен корню outDir; у error — null; symbol — только у sprite.
 */
export interface SvgEntry {
  source: string;
  file: string | null;
  kind: SvgKind;
  mode: SvgMode;
  symbol?: string;
  hash?: string;
}

/** Вход buildSvgManifest: обработанный SVG (выход classify/assignModes + пути). */
export interface SvgAssetInput {
  source: string;
  kind: SvgKind;
  mode: SvgMode;
  url?: string | null;
  hash?: string;
  symbol?: string;
}

/** Фрагмент манифеста из buildSvgManifest. */
export interface SvgManifestFragment {
  entries: SvgEntry[];
}

/** Эмиссия конвейера: имя файла от корня outDir + готовый контент. */
export interface SvgOutput {
  fileName: string;
  content: string;
}

/*! --- Растровый конвейер --- */

/** Один вариант (формат/дескриптор srcset) растрового исходника. */
export interface RasterVariant {
  path: string;
  format: string;
  descriptor: "1x" | "2x";
  width: number | null;
  height: number | null;
}

/** Запись растра в assets-manifest.json. */
export interface RasterEntry {
  source: string;
  type: string;
  hash: string;
  size: number;
  output?: string;
  retina?: boolean;
  width?: number | null;
  height?: number | null;
  variants: RasterVariant[];
}

/** Элемент массива entries манифеста: растр или SVG. */
export type ManifestEntry = RasterEntry | SvgEntry;

/** assets-manifest.json целиком (индексная подпись — JSON-объект с посторонними полями). */
export interface Manifest {
  plugin: string;
  version: string;
  rawDir: string;
  entries: ManifestEntry[];
  [key: string]: unknown;
}

/*! --- Проекция (project.ts) --- */

/**
 * Options проекции projectSvg: alt/class/width/height из ТЗ + остальные
 * атрибуты (loading, aria-*, style, data-* — идут как есть).
 */
export interface AssetOptions {
  alt?: string;
  class?: string;
  width?: number;
  height?: number;
  loading?: string;
  [key: string]: string | number | boolean | undefined;
}

/*! --- Плагин --- */

/** Options фабрики smartAssets(). */
export interface SmartAssetsOptions {
  rawDir?: string;
  scope?: string;
  manifestFile?: string;
  generatedScssFile?: string;
}

/** Options pictureHtml(): готовая <picture>-разметка растрового ассета. */
export interface PictureOptions {
  alt?: string;
  imgClass?: string;
  loading?: string;
  decoding?: string;
}

/**
 * Кастомный svgo-плагин пресета (svgo 3 — visitor-плагин; поле type
 * сохранено для читаемости, рантайм svgo его не читает).
 */
export interface SmartPlugin {
  name: string;
  type: "visitor";
  fn: SvgoPlugin<void>;
}

/**
 * Публичный API плагина: vite-хуки + методы для Nunjucks-фильтров
 * (vite.config проекта: smartSvg/smartPicture/ui.picture).
 */
export interface SmartAssetsPlugin extends VitePlugin {
  entry(name: string): RasterEntry | undefined;
  svgEntry(name: string): SvgEntry | undefined;
  svgInlineContent(entry: SvgEntry): string | null;
  pictureHtml(name: string, options?: PictureOptions): string;
}
