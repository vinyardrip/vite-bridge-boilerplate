/*!
 * =================================================================================================
 * convert-images.js
 * =================================================================================================
 *
 * Вспомогательный скрипт для пакетной офлайн-конвертации изображений
 * в современные форматы .webp и .avif.
 * Работает как локальный аналог сторонних онлайн-сервисов.
 *
 * =================================================================================================
 */

import sharp from "sharp";
import { glob } from "glob";
import path from "path";
import fs from "fs/promises";
import ora from "ora";
import chalk from "chalk";

// --- Конфигурация ---
const SOURCE_DIR = "frontend/src/assets/images-convert/source"; // !Папка, куда вы закидываете исходники
const OUTPUT_DIR = "frontend/src/assets/images-convert/result"; // !Папка, где появятся результаты

// Настройки качества для форматов. 80 - хороший баланс между качеством и размером.
const WEBP_QUALITY = 80;
const AVIF_QUALITY = 75; // AVIF обычно требует чуть меньшего качества для того же визуала

/**
 * Главная функция для конвертации изображений.
 */
async function convertImages() {
  console.log(chalk.cyan("--- Запуск скрипта конвертации изображений ---"));

  const spinner = ora("Идет поиск изображений...").start();

  // Убедимся, что папки существуют
  await fs.mkdir(SOURCE_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const filePaths = await glob(`${SOURCE_DIR}/**/*.{png,jpg,jpeg}`);

  if (filePaths.length === 0) {
    spinner.warn(
      chalk.yellow(
        `Не найдено изображений для конвертации в папке ${SOURCE_DIR}.`,
      ),
    );
    console.log(
      chalk.yellow(
        `Пожалуйста, поместите файлы .jpg или .png в эту директорию.`,
      ),
    );
    console.log(chalk.cyan("--- Скрипт завершил работу ---"));
    return;
  }

  let convertedCount = 0;

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const fileBaseName = path.parse(fileName).name; // Имя файла без расширения
    spinner.text = `Конвертирую: ${chalk.yellow(fileName)}`;

    try {
      const image = sharp(filePath);

      // Конвертация в WebP
      await image
        .webp({ quality: WEBP_QUALITY })
        .toFile(path.join(OUTPUT_DIR, `${fileBaseName}.webp`));

      // Конвертация в AVIF
      await image
        .avif({ quality: AVIF_QUALITY })
        .toFile(path.join(OUTPUT_DIR, `${fileBaseName}.avif`));

      convertedCount++;
    } catch (err) {
      spinner.fail(chalk.red(`Не удалось конвертировать ${fileName}.`));
      console.error(err);
    }
  }

  spinner.succeed(chalk.green("Конвертация изображений завершена."));
  console.log("---");
  console.log(
    `✅ Успешно конвертировано файлов: ${chalk.green(convertedCount)}`,
  );
  console.log(`📂 Результаты сохранены в папку: ${chalk.blue(OUTPUT_DIR)}`);
  console.log(chalk.cyan("--- Скрипт завершил работу ---"));
}

convertImages();
