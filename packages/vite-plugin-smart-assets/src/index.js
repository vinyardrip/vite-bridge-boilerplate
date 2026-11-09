/**
 * =================================================================================================
 * vite-plugin-smart-assets — Phase 2: роутинг + sharp-обработка
 * =================================================================================================
 *
 * Сканер каталога-источника (по умолчанию frontend/raw/) с маршрутизацией
 * файлов в ПЛОСКУЮ структуру dist/ и генерацией assets-manifest.json.
 *
 * Маршруты и обработка:
 *   .jpg/.jpeg/.png → <outDir>/assets/img/ + sharp-варианты рядом:
 *       test.jpg → test.jpg (оригинал как есть) + test.webp + test.avif
 *       (качество 80 у обоих, нативное разрешение, альфа PNG сохраняется).
 *       Расширение ЗАМЕНЯЕТСЯ (test.webp, а не test.jpg.webp) — плоская
 *       структура и предсказуемые пути (конвенция проекта).
 *   .svg            → <outDir>/assets/icons/ как есть (вектор, конвертация не нужна).
 *
 * assets-manifest.json — машиночитаемая карта source → output. У растровых
 * записей есть поле variants { original, webp, avif } с путями всех трех
 * форматов; у svg поле variants отсутствует (конвертировать нечего).
 *
 * Принципы (унаследованы от проекта):
 *   • ошибка sharp на одном файле НЕ роняет сборку — предупреждение, файл
 *     копируется оригиналом, запись манифеста остается без вариантов;
 *   • отсутствие каталога-источника НЕ роняет сборку — предупреждение + пустой
 *     манифест (каталог создается, чтобы было очевидно, куда класть файлы);
 *   • коллизии имен (raw/foo.jpg дал бы foo.webp при уже маршрутизированном
 *     raw/foo.webp) разрешаются в пользу файла-источника, вариант пропускается
 *     с предупреждением;
 *   • зависимости: только sharp (см. package.json), peer — vite.
 *
 * Ограничения Phase 2 (осознанные):
 *   • работает только в build (apply: "build") — dev-сервер в следующих фазах;
 *   • варианты генерируются в нативном разрешении без ресайза — retina-пары
 *     и srcset придут в следующих фазах;
 *   • emits идут в outDir как есть — в WP-режиме проекта плагин подключается
 *     условно из vite.config.js (там решают, где уместны артефакты).
 * =================================================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import sharp from "sharp";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

/**
 * Маршруты: расширение (lowercase) → { outputDir, type }.
 * raster=true — для файла генерируются sharp-варианты (webp/avif).
 */
const ROUTES = {
  img: { extensions: [".jpg", ".jpeg", ".png"], outputDir: "assets/img", type: "img", raster: true },
  icons: { extensions: [".svg"], outputDir: "assets/icons", type: "icons", raster: false },
};

/** sharp-варианты растра: имя формата = метод sharp, качество по конвенции проекта (80). */
const RASTER_VARIANTS = [
  { format: "webp", quality: 80 },
  { format: "avif", quality: 80 },
];

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
    async generateBundle() {
      // Каталог-источник обязателен: отсутствующий создаем с предупреждением,
      // но сборку НЕ роняем (манифест будет пустым).
      if (!fs.existsSync(rawDir)) {
        fs.mkdirSync(rawDir, { recursive: true });
        console.warn(
          `[smart-assets] каталог "${rawDir}" не найден — создан. ` +
            `Положите ассеты и пересоберите.`,
        );
      }

      // Занятые выходные пути: оригиналы маршрутизируемых файлов + варианты.
      // Нужен для разрешения коллизий (см. принципы выше).
      const usedOutputs = new Set();

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
      let generatedVariants = 0;

      for (const rel of found) {
        const ext = path.extname(rel).toLowerCase();
        const routeKey = Object.keys(ROUTES).find((key) =>
          ROUTES[key].extensions.includes(ext),
        );

        if (!routeKey) {
          console.warn(
            `[smart-assets] пропущен "${toPosix(rel)}": расширение "${ext}" ` +
              `не маршрутизируется (Phase 2)`,
          );
          continue;
        }

        const route = ROUTES[routeKey];
        const abs = path.join(rawDir, rel);
        const output = path.posix.join(route.outputDir, toPosix(rel));

        // Коллизия с уже занятым именем (например, raw/foo.webp против
        // варианта foo.jpg → foo.webp): источник важнее сгенерированного.
        if (usedOutputs.has(output)) {
          console.warn(
            `[smart-assets] пропущен "${toPosix(rel)}": выходное имя "${output}" ` +
              `уже занято`,
          );
          continue;
        }

        const source = fs.readFileSync(abs);
        this.emitFile({ type: "asset", fileName: output, source });
        usedOutputs.add(output);

        const entry = {
          source: path.posix.join(toPosix(rawDir), toPosix(rel)),
          output,
          type: route.type,
          size: source.length,
        };

        // Phase 2: sharp-варианты для растра (webp/avif рядом с оригиналом).
        if (route.raster) {
          entry.variants = { original: output };
          for (const { format, quality } of RASTER_VARIANTS) {
            const variantOutput = path.posix.join(
              route.outputDir,
              toPosix(rel).slice(0, -ext.length) + `.${format}`,
            );

            if (usedOutputs.has(variantOutput)) {
              console.warn(
                `[smart-assets] вариант ${format} для "${toPosix(rel)}" пропущен: ` +
                  `имя "${variantOutput}" уже занято`,
              );
              continue;
            }

            try {
              const buffer = await sharp(source)[format]({ quality }).toBuffer();
              this.emitFile({ type: "asset", fileName: variantOutput, source: buffer });
              usedOutputs.add(variantOutput);
              entry.variants[format] = variantOutput;
              generatedVariants += 1;
            } catch (error) {
              // Файл не конвертируется (битый/экзотический) — это не повод
              // валить сборку: оригинал уже отдался, варианты не критичны.
              console.warn(
                `[smart-assets] вариант ${format} для "${toPosix(rel)}" не создан: ` +
                  `${error.message}`,
              );
            }
          }
        }

        entries.push(entry);
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

      const summary = Object.values(ROUTES)
        .map((route) => {
          const count = entries.filter((e) => e.type === route.type).length;
          return `${count} ${route.type} → ${route.outputDir}`;
        })
        .join(", ");
      console.log(
        `[smart-assets] ${entries.length} файл(ов): ${summary}; ` +
          `+${generatedVariants} webp/avif вариантов; манифест: ${manifestFile}`,
      );
    },
  };
}

export default smartAssets;
