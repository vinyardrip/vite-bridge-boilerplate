/**
 * =================================================================================================
 * Ambient-типы для глубоких импортов svgo (внутренности без бандл-деклараций)
 * =================================================================================================
 *
 * svgo 3.3.5 — CJS с типами только для главной точки входа (lib/svgo.d.ts) и
 * типов AST (lib/types.d.ts, резолвится по смежности к lib/types.js).
 * Пакет импортирует внутренности: парсер, сериализатор и 5 встроенных
 * плагинов — для них здесь declare module. AST-типы — из svgo/lib/types.js.
 * =================================================================================================
 */

type BuiltinPluginModule = {
  name: string;
  description?: string;
  fn: import("svgo/lib/types.js").Plugin<unknown>;
};

declare module "svgo/lib/parser.js" {
  export function parseSvg(
    root: string,
    filePath?: string,
  ): import("svgo/lib/types.js").XastRoot;
}

declare module "svgo/lib/stringifier.js" {
  export function stringifySvg(
    node: import("svgo/lib/types.js").XastNode,
    options?: import("svgo/lib/types.js").StringifyOptions,
  ): string;
}

declare module "svgo/plugins/removeDimensions.js" {
  const plugin: BuiltinPluginModule;
  export default plugin;
}

declare module "svgo/plugins/removeComments.js" {
  const plugin: BuiltinPluginModule;
  export default plugin;
}

declare module "svgo/plugins/removeMetadata.js" {
  const plugin: BuiltinPluginModule;
  export default plugin;
}

declare module "svgo/plugins/removeEditorsNSData.js" {
  const plugin: BuiltinPluginModule;
  export default plugin;
}

declare module "svgo/plugins/sortAttrs.js" {
  const plugin: BuiltinPluginModule;
  export default plugin;
}
