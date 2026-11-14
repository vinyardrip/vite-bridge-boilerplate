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
