/*!
 * =================================================================================================
 * optimize-svg.js
 * =================================================================================================
 *
 * Вспомогательный скрипт для "бережной" оптимизации отдельных SVG-файлов
 * (логотипы, иллюстрации).
 *
 * - Удаляет редакторский мусор, комментарии, метаданные.
 * - СОХРАНЯЕТ цвета (не удаляет fill и stroke).
 * - Использует кеширование для обработки только новых или измененных файлов.
 *
 * =================================================================================================
 */

import { optimize } from "svgo";
import { glob } from "glob";
import path from "path";
import fs from "fs/promises";
import ora from "ora";
import chalk from "chalk";

// --- Конфигурация ---
const SOURCE_DIR = "frontend/src/assets/svg-images"; // !Папка с исходными цветными SVG
const OUTPUT_DIR = "dist/img"; // !Папка для результатов, та же, что использует Vite
const CACHE_FILE = "frontend/.svgo-cache"; // !Файл для кеширования

/*!
 * --- Конфигурация SVGO для "бережной" оптимизации ---
 * Мы используем стандартный пресет, который очень хорош для удаления мусора,
 * но явно отключаем плагины, которые могут повредить цветным иллюстрациям.
 */
const svgoConfig = {
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          // НЕ удаляем атрибуты viewBox, так как они важны для корректного отображения.
          removeViewBox: false,
          // НЕ удаляем размеры, если они заданы. Полезно для некоторых иллюстраций.
          removeDimensions: false,
          // Отключаем плагин, который может удалить нужные нам атрибуты (например, fill="none").
          // Стандартный пресет и так не удаляет fill/stroke с цветами. Эта мера для перестраховки.
          removeUselessStrokeAndFill: false,
        },
      },
    },
  ],
};

/**
 * Загружает кеш обработанных файлов.
 * @returns {Promise<Object>} Объект с кешем.
 */
async function loadCache() {
  try {
    const cacheData = await fs.readFile(CACHE_FILE, "utf-8");
    return JSON.parse(cacheData);
  } catch (error) {
    return {};
  }
}

/**
 * Сохраняет обновленный кеш.
 * @param {Object} cache Объект с кешем.
 */
async function saveCache(cache) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Главная функция для оптимизации SVG.
 */
async function optimizeSvgImages() {
  console.log(chalk.cyan("--- Запуск скрипта оптимизации цветных SVG ---"));

  const spinner = ora("Идет поиск и обработка SVG...").start();
  const filePaths = await glob(`${SOURCE_DIR}/**/*.svg`);

  if (filePaths.length === 0) {
    spinner.info(
      chalk.yellow(`Не найдено SVG для обработки в папке ${SOURCE_DIR}.`),
    );
    console.log(chalk.cyan("--- Скрипт завершил работу ---"));
    return;
  }

  const cache = await loadCache();
  let processedCount = 0;
  let skippedCount = 0;

  // Убедимся, что папка для результатов существует
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const filePath of filePaths) {
    try {
      const stats = await fs.stat(filePath);
      const fileMtime = stats.mtime.getTime();

      // Проверяем кеш: если время модификации файла не изменилось, пропускаем его
      if (cache[filePath] && cache[filePath] === fileMtime) {
        skippedCount++;
        continue;
      }

      spinner.text = `Оптимизирую: ${chalk.yellow(path.basename(filePath))}`;

      const fileContent = await fs.readFile(filePath, "utf-8");
      const result = optimize(fileContent, { path: filePath, ...svgoConfig });

      const outputPath = path.join(OUTPUT_DIR, path.basename(filePath));
      await fs.writeFile(outputPath, result.data);

      // Обновляем кеш для обработанного файла
      cache[filePath] = fileMtime;
      processedCount++;
    } catch (err) {
      spinner.fail(
        chalk.red(`Не удалось обработать ${path.basename(filePath)}.`),
      );
      console.error(err);
    }
  }

  await saveCache(cache);

  spinner.succeed(chalk.green("Обработка SVG завершена."));
  console.log("---");
  console.log(
    `✅ Оптимизировано новых/измененных файлов: ${chalk.green(processedCount)}`,
  );
  console.log(`⏩ Пропущено (без изменений): ${chalk.yellow(skippedCount)}`);
  console.log(chalk.cyan("--- Скрипт завершил работу ---"));
}

optimizeSvgImages();
