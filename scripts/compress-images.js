// /scripts/compress-images.js

import tinify from "tinify";
import dotenv from "dotenv";
import { glob } from "glob";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import ora from "ora";
import chalk from "chalk";

// --- Конфигурация ---
// Загружаем переменные окружения из /frontend/.env
dotenv.config({ path: path.resolve(process.cwd(), "frontend", ".env") });

const SOURCE_DIR = "frontend/src/assets/images"; // Папка с исходными изображениями
const OUTPUT_DIR = "frontend/src/assets/images-tiny"; // Папка для сжатых изображений
const CACHE_FILE = "frontend/.tinypng-cache"; // Файл для кеширования, чтобы не сжимать повторно

const API_KEYS = (process.env.TINYPNG_API_KEYS || "")
  .split(",")
  .filter(Boolean);
// --- Конец Конфигурации ---

// Промисифицируем функции для удобной работы с async/await
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

/**
 * Загружает кеш сжатых файлов из JSON-файла.
 * @returns {Promise<Object>} Объект с кешем.
 */
async function loadCache() {
  try {
    const cacheData = await readFile(CACHE_FILE, "utf-8");
    return JSON.parse(cacheData);
  } catch (error) {
    // Если файл не найден или пуст, возвращаем пустой объект
    return {};
  }
}

/**
 * Сохраняет обновленный кеш в JSON-файл.
 * @param {Object} cache Объект с кешем.
 */
async function saveCache(cache) {
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Проверяет API ключ и устанавливает его, если он валиден.
 * @returns {Promise<boolean>} true, если валидный ключ найден и установлен, иначе false.
 */
async function validateAndSetApiKey() {
  const spinner = ora("Validating API keys...").start();
  for (const key of API_KEYS) {
    try {
      tinify.key = key.trim();
      await promisify(tinify.validate)();
      spinner.succeed(chalk.green("[compress-images] Working API key found."));
      return true;
    } catch (err) {
      // Игнорируем ошибку и пробуем следующий ключ
    }
  }
  spinner.warn(
    chalk.yellow(
      "[compress-images] Warning: No valid TinyPNG API keys found. Skipping image compression.",
    ),
  );
  return false;
}

/**
 * Главная функция для сжатия изображений.
 */
async function compressImages() {
  if (API_KEYS.length === 0) {
    console.error(
      chalk.red(
        "[compress-images] Error: No API keys found in TINYPNG_API_KEYS environment variable.",
      ),
    );
    return;
  }

  const isValidKey = await validateAndSetApiKey();
  if (!isValidKey) {
    // Сжатие — best-effort оптимизация: если ключи не прошли проверку
    // (отозваны, нет сети и т.д.), НЕ прерываем сборку, а пропускаем шаг.
    return;
  }

  const spinner = ora("[compress-images] Searching for images...").start();
  const imagePaths = await glob(`${SOURCE_DIR}/**/*.{png,jpg,jpeg}`);
  const cache = await loadCache();
  let compressedCount = 0;
  let skippedCount = 0;

  if (!fs.existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }

  for (const imagePath of imagePaths) {
    try {
      const stats = await stat(imagePath);
      const fileMtime = stats.mtime.getTime();

      // Проверяем, есть ли файл в кеше и не изменился ли он
      if (cache[imagePath] && cache[imagePath] === fileMtime) {
        skippedCount++;
        continue; // Пропускаем файл, если он не изменился
      }

      spinner.text = `[compress-images] Compressing: ${chalk.yellow(path.basename(imagePath))}`;
      const source = tinify.fromFile(imagePath);
      const outputPath = path.join(OUTPUT_DIR, path.basename(imagePath));
      await promisify(source.toFile).call(source, outputPath);

      // Обновляем кеш с новой датой модификации файла
      cache[imagePath] = fileMtime;
      compressedCount++;
    } catch (err) {
      spinner.fail(
        chalk.red(`[compress-images] Failed to compress ${path.basename(imagePath)}.`),
      );
      console.error(err);
    }
  }

  await saveCache(cache);
  spinner.stop();

  const totalProcessed = compressedCount + skippedCount;
  if (totalProcessed === 0) {
    console.log(
      chalk.yellow(
        `[compress-images] Info: No images found in ${SOURCE_DIR}.`,
      ),
    );
  } else if (process.env.VERBOSE) {
    console.log(
      `[compress-images] Compressed: ${chalk.green(compressedCount)}, skipped (unchanged): ${chalk.yellow(skippedCount)}`,
    );
  }

  console.log(
    chalk.green("[compress-images] Done: Image compression check completed."),
  );
}

compressImages();
