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
  const spinner = ora("Проверяю API ключи...").start();
  for (const key of API_KEYS) {
    try {
      tinify.key = key.trim();
      await promisify(tinify.validate)();
      spinner.succeed(chalk.green("Рабочий API ключ найден и установлен."));
      return true;
    } catch (err) {
      // Игнорируем ошибку и пробуем следующий ключ
    }
  }
  spinner.fail(
    chalk.red("Ошибка: Ни один из предоставленных API ключей не валиден."),
  );
  console.log(
    chalk.yellow("Пожалуйста, проверьте ключи в файле frontend/.env"),
  );
  return false;
}

/**
 * Главная функция для сжатия изображений.
 */
async function compressImages() {
  console.log(chalk.cyan("--- Запуск скрипта сжатия изображений ---"));

  if (API_KEYS.length === 0) {
    console.error(
      chalk.red(
        "Ошибка: Не найдены API ключи в переменной окружения TINYPNG_API_KEYS.",
      ),
    );
    return;
  }

  const isValidKey = await validateAndSetApiKey();
  if (!isValidKey) {
    process.exit(1); // Завершаем скрипт с кодом ошибки
  }

  const spinner = ora("Идет поиск и обработка изображений...").start();
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

      spinner.text = `Сжимаю: ${chalk.yellow(path.basename(imagePath))}`;
      const source = tinify.fromFile(imagePath);
      const outputPath = path.join(OUTPUT_DIR, path.basename(imagePath));
      await promisify(source.toFile).call(source, outputPath);

      // Обновляем кеш с новой датой модификации файла
      cache[imagePath] = fileMtime;
      compressedCount++;
    } catch (err) {
      spinner.fail(chalk.red(`Не удалось сжать ${path.basename(imagePath)}.`));
      console.error(err);
    }
  }

  await saveCache(cache);

  const totalProcessed = compressedCount + skippedCount;
  if (totalProcessed === 0) {
    spinner.info(
      chalk.yellow(
        `Не найдено изображений для обработки в папке ${SOURCE_DIR}.`,
      ),
    );
  } else {
    spinner.succeed(chalk.green("Обработка изображений завершена."));
  }

  console.log("---");
  console.log(
    `✅ Сжато новых/измененных файлов: ${chalk.green(compressedCount)}`,
  );
  console.log(`⏩ Пропущено (без изменений): ${chalk.yellow(skippedCount)}`);
  console.log(chalk.cyan("--- Скрипт завершил работу ---"));
}

compressImages();
