import { defineConfig } from "vite";
import nunjucks from "@vituum/vite-plugin-nunjucks";
import svgSprite from "vite-plugin-svg-sprite";
import { imagetools } from "vite-plugin-imagetools"; // <-- 1. ДОБАВЛЕН ИМПОРТ

export default defineConfig(({ command }) => ({
  plugins: [
    nunjucks({
      root: "./src/views",
      data: ["./src/data/**/*.json"],
      fm: true,
      globals: {
        site: {
          production: command === "build",
        },
      },
    }),
    svgSprite({
      symbolId: "icon-[name]",
    }),
    imagetools(), // <-- 2. ДОБАВЛЕН ПЛАГИН
  ],

  build: {
    outDir: "dist",
    manifest: true,
    rollupOptions: {
      output: {
        entryFileNames: "js/[name].[hash].js",
        chunkFileNames: "js/chunk.[hash].js",
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name.split(".").pop();
          if (/css/i.test(extType)) {
            return "css/app.[hash].css";
          }
          if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp|avif/i.test(extType)) {
            return "img/[name].[hash][extname]";
          }
          if (/woff|woff2|eot|ttf|otf/i.test(extType)) {
            return "fonts/[name].[hash][extname]";
          }
          return "[name].[hash][extname]";
        },
        manualChunks(id) {
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
}));
