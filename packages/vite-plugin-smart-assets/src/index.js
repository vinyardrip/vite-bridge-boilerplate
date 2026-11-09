/**
 * =================================================================================================
 * vite-plugin-smart-assets — Phase 1: базовый роутинг
 * =================================================================================================
 *
 * Сканер каталога-источника (по умолчанию frontend/raw/) с маршрутизацией
 * файлов в ПЛОСКУЮ структуру dist/ и генерацией assets-manifest.json.
 *
 * Маршруты Phase 1:
 *   .jpg/.jpeg/.png → <outDir>/assets/img/    (контентные картинки)
 *   .svg            → <outDir>/assets/icons/  (иконки)
 *
 * Файлы копируются КАК ЕСТЬ (без хеширования и обработки) — обработка
 * (сжатие, конвертация, классификация) придет в следующих фазах. Поддержка
 * подпапок: структура внутри raw/ сохраняется внутри папки маршрута.
 *
 * assets-manifest.json — машиночитаемая карта source → output; по ней
 * сборка/PHP/плагины смогут находить маршрутизированные ассеты без хардкода.
 *
 * Принципы (унаследованы от проекта):
 *   • отсутствие каталога-источника НЕ роняет сборку — предупреждение + пустой
 *     манифест (каталог создается, чтобы было очевидно, куда класть файлы);
 *   • незнакомые расширения пропускаются с предупреждением, а не фейлят билд;
 *   • нулевые runtime-зависимости (только peer vite), рекурсивный скан —
 *     штатный fs.readdirSync({ recursive: true }), Node >= 20.11.
 *
 * Ограничения Phase 1 (осознанные):
 *   • работает только в build (apply: "build") — dev-сервер в следующих фазах;
 *   • emits идут в outDir как есть — в WP-режиме проекта плагин подключается
 *     условно из vite.config.js (там решают, где уместны артефакты).
 * =================================================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

/**
 * Маршруты Phase 1: расширение (lowercase) → { outputDir, type }.
 * В последующих фазах сюда добавятся новые типы и обработка.
 */
const ROUTES = {
  img: { extensions: [".jpg", ".jpeg", ".png"], outputDir: "assets/img" },
  icons: { extensions: [".svg"], outputDir: "assets/icons" },
};

const toPosix = (p) => p.split(path.sep).join("/");

/**
 * Создает Vite-плагин smart-assets.
 *
 * @param {object}  [options]
 * @param {string}  [options.rawDir="frontend/raw"]    Каталог-источник (относительно корня сборки).
 * @param {string}  [options.manifestFile="assets-manifest.json"] Имя манифеста в корне outDir.
 * @returns {import("vite").Plugin}
 */
export function smartAssets(options = {}) {
  const rawDir = options.rawDir ?? "frontend/raw";
  const manifestFile = options.manifestFile ?? "assets-manifest.json";

  return {
    name: "vite-plugin-smart-assets",
    apply: "build",
    generateBundle() {
      // Каталог-источник обязателен: отсутствующий создаем с предупреждением,
      // но сборку НЕ роняем (манифест будет пустым).
      if (!fs.existsSync(rawDir)) {
        fs.mkdirSync(rawDir, { recursive: true });
        console.warn(
          `[smart-assets] каталог "${rawDir}" не найден — создан. ` +
            `Положите ассеты и пересоберите.`,
        );
      }

      // Рекурсивный обход (Node >= 20.11): относительные пути, включая подпапки.
      const found = fs
        .readdirSync(rawDir, { recursive: true })
        .filter((rel) => {
          const abs = path.join(rawDir, rel);
          // Только файлы; скрытые (.gitkeep и т.п.) не маршрутизируем.
          return fs.statSync(abs).isFile() && !path.basename(rel).startsWith(".");
        })
        .sort();

      const entries = [];
      for (const rel of found) {
        const ext = path.extname(rel).toLowerCase();
        const routeKey = Object.keys(ROUTES).find((key) =>
          ROUTES[key].extensions.includes(ext),
        );

        if (!routeKey) {
          console.warn(
            `[smart-assets] пропущен "${toPosix(rel)}": расширение "${ext}" ` +
              `не маршрутизируется (Phase 1)`,
          );
          continue;
        }

        const route = ROUTES[routeKey];
        const abs = path.join(rawDir, rel);
        const output = path.posix.join(route.outputDir, toPosix(rel));

        // Копия как есть: fileName без хеша — предсказуемые пути для манифеста.
        this.emitFile({ type: "asset", fileName: output, source: fs.readFileSync(abs) });

        entries.push({
          source: path.posix.join(toPosix(rawDir), toPosix(rel)),
          output,
          type: routeKey,
          size: fs.statSync(abs).size,
        });
      }

      // Манифест — в корень outDir (рядом с vite-манифестом, но с другим именем).
      const manifest = {
        plugin: "vite-plugin-smart-assets",
        version,
        rawDir: toPosix(rawDir),
        entries,
      };
      this.emitFile({
        type: "asset",
        fileName: manifestFile,
        source: JSON.stringify(manifest, null, 2),
      });

      const summary = Object.entries(ROUTES)
        .map(([key, route]) => {
          const count = entries.filter((e) => e.type === key).length;
          return `${count} ${key} → ${route.outputDir}`;
        })
        .join(", ");
      console.log(
        `[smart-assets] ${entries.length} файл(ов): ${summary}; ` +
          `манифест: ${manifestFile}`,
      );
    },
  };
}

export default smartAssets;
