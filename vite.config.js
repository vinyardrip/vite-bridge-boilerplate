import { defineConfig } from "vite";
import nunjucks from "@vituum/vite-plugin-nunjucks";
import path from "path";
import siteData from "./src/data/site.json";
import svgSprite from "vite-plugin-svg-sprite";

export default defineConfig(({ command }) => ({
  // Добавляем `root` и `publicDir` для корректной работы Vite из корня
  root: path.resolve(__dirname, "frontend"),
  publicDir: "public",

  plugins: [
    nunjucks({
      root: "./src", // Этот root остается для Nunjucks
      data: [
        "./src/data/**/*.json",
        (file) => ({
          page: file.data,
        }),
      ],
      context: {
        site: { ...siteData, production: command === "build" },
      },
      frontmatter: true,
    }),
    svgSprite({
      symbolId: "icon-[name]",
      // Указываем путь к иконкам относительно `root`, определенного выше
      include: "src/assets/icons/**/*.svg",
    }),
  ],

  build: {
    // Путь для сборки теперь будет относительно `root`
    outDir: path.resolve(__dirname, "frontend/dist"),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      output: {
        entryFileNames: "js/[name].[hash].js",
        chunkFileNames: "js/chunk.[hash].js",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || "";
          const ext = path.extname(name);
          const extType = ext.slice(1);

          if (/css/i.test(extType)) {
            return `css/app.[hash][extname]`;
          }
          if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp|avif/i.test(extType)) {
            return `img/[name].[hash][extname]`;
          }
          if (/woff|woff2|eot|ttf|otf/i.test(extType)) {
            return `fonts/[name].[hash][extname]`;
          }
          return `[name].[hash][extname]`;
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
