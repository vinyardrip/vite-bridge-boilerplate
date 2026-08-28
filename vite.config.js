import { defineConfig } from "vite";
import path from "node:path";
import { rmSync } from "node:fs";

// Direct PostCSS Imports
import postcssSortMediaQueries from "postcss-sort-media-queries";
import autoprefixer from "autoprefixer";

import { resolveBuildTarget } from "./scripts/build-target.js";
import { getTemplatePlugins } from "./scripts/plugins/templates.js";
import { getAssetPlugins } from "./scripts/plugins/assets.js";
import { getPwaPlugins } from "./scripts/plugins/pwa.js";
import { htmlAssetInjectPlugin } from "./scripts/plugins/vite-html-asset-inject.js";
import { pictureTransformPlugin } from "./scripts/plugins/vite-plugin-picture-transform.js";
import viteNjkTrace from "vite-njk-trace";

export default defineConfig(({ command, mode }) => {
  const isDev = mode === "development";
  const isServe = command === "serve";
  const projectRoot = path.resolve(import.meta.dirname);

  // Resolve Target Directory (e.g., .../themes/<project-name>/assets OR dist/)
  const target = resolveBuildTarget();
  const finalOutDir = target.dir;

  // Custom Targeted Cleanup Plugin
  const selectiveCleanPlugin = () => ({
    name: "vite-selective-clean",
    apply: "build",
    buildStart() {
      console.log(`[Build] Target mode: ${target.mode} (${target.source})`);
      console.log(`[Selective Clean] Wiping managed assets in: ${finalOutDir}`);

      const MANAGED_DIRS = ["js", "css", "img", "fonts", "favicons", ".vite"];
      const MANAGED_FILES = ["manifest.json", "registerSW.js", "sw.js", "robots.txt"];

      MANAGED_DIRS.forEach(d => rmSync(path.join(finalOutDir, d), { recursive: true, force: true }));
      MANAGED_FILES.forEach(f => rmSync(path.join(finalOutDir, f), { force: true }));
    }
  });

  return {
    base: "./",
    root: "frontend",
    publicDir: path.resolve(projectRoot, "frontend/public"),
    server: { host: true },

    plugins: [
      viteNjkTrace({ projectRoot, pagesDir: "frontend/src/views/pages" }),
      ...getTemplatePlugins(isServe, { projectRoot, pagesDir: "frontend/src/views/pages" }),
      ...getAssetPlugins(),
      ...getPwaPlugins(isDev),
      pictureTransformPlugin({ sourceRoot: path.resolve(projectRoot, "frontend") }),
      htmlAssetInjectPlugin({ sourceRoot: path.resolve(projectRoot, "frontend") }),
      selectiveCleanPlugin(),
    ],

    // Inline PostCSS Configuration
    css: {
      devSourcemap: true,
      postcss: {
        plugins: [
          postcssSortMediaQueries({ sort: "desktop-first" }),
          autoprefixer()
        ]
      },
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
          loadPaths: [path.resolve(projectRoot, "frontend/src/scss")],
        },
      },
    },

    // Direct Build to Dynamic Target
    build: {
      outDir: finalOutDir,
      emptyOutDir: false, // ⚠️ CRITICAL: Prevents Vite from nuking the outDir (safeguards WP files)
      manifest: true,
      sourcemap: true,
      rollupOptions: {
        input: {
          index: path.resolve(projectRoot, "frontend/src/views/pages/index.njk"),
          "test-fonts": path.resolve(projectRoot, "frontend/src/views/pages/test-fonts.njk"),
          app: path.resolve(projectRoot, "frontend/src/js/app.js"),
        },
        output: {
          entryFileNames: "js/[name].[hash].js",
          chunkFileNames: "js/chunk.[hash].js",
          assetFileNames: (assetInfo) => {
            const name =
              assetInfo.fileName ||
              assetInfo.name ||
              (Array.isArray(assetInfo.names) ? assetInfo.names[0] : "") ||
              "";
            if (!name) return "assets/[name].[hash][extname]";
            const extType = name.split(".").pop();
            if (!extType) return "[name].[hash][extname]";
            if (/css/i.test(extType)) return "css/app.[hash].css";
            if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp|avif/i.test(extType))
              return "img/[name].[hash][extname]";
            if (/woff|woff2|eot|ttf|otf/i.test(extType))
              return "fonts/[name].[hash][extname]";
            return "[name].[hash][extname]";
          },
          manualChunks(id) {
            if (id.includes("node_modules")) return "vendor";
          },
        },
      },
    },
  };
});
