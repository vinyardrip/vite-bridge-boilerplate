/**
 * =================================================================================================
 * Типы для зависимостей без бандл-деклараций (конфиги на корне проекта)
 * =================================================================================================
 */

declare module "rollup-plugin-visualizer" {
  import type { Plugin } from "vite";

  export interface VisualizerOptions {
    filename?: string;
    title?: string;
    template?: string;
    open?: boolean;
    gzipSize?: boolean;
    brotliSize?: boolean;
    [key: string]: unknown;
  }

  export function visualizer(options?: VisualizerOptions): Plugin;
}

declare module "critical" {
  /** Опции inline-critical (передаются в подобъекте inline опции generate()). */
  export interface CriticalInlineOptions {
    /** Явная точка вставки <style> (обход баги flatten в inline-critical@12.1.0). */
    selector?: string;
    [key: string]: unknown;
  }

  export interface CriticalOptions {
    /** boolean | объект опций inline-critical (валидатор critical: Joi.object().unknown(true)). */
    inline?: boolean | CriticalInlineOptions;
    base?: string;
    src?: string;
    dimensions?: Array<{ height: number; width: number }>;
    ignore?: { atrule?: string[]; [key: string]: unknown };
    [key: string]: unknown;
  }

  export interface CriticalResult {
    html: string;
    css?: string;
    [key: string]: unknown;
  }

  export function generate(options: CriticalOptions): Promise<CriticalResult>;
}
