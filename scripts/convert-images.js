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
  const spinner = ora("[convert-images] Searching for images...").start();

  // Убедимся, что папки существуют
  await fs.mkdir(SOURCE_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const filePaths = await glob(`${SOURCE_DIR}/**/*.{png,jpg,jpeg}`);

  if (filePaths.length === 0) {
    spinner.warn(
      chalk.yellow(
        `[convert-images] Info: No images found in ${SOURCE_DIR}. Place .jpg or .png files there to convert.`,
      ),
    );
    return;
  }

  let convertedCount = 0;

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const fileBaseName = path.parse(fileName).name; // Имя файла без расширения
    spinner.text = `[convert-images] Converting: ${chalk.yellow(fileName)}`;

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
      spinner.fail(
        chalk.red(`[convert-images] Failed to convert ${fileName}.`),
      );
      console.error(err);
    }
  }

  spinner.stop();
  console.log(
    chalk.green(
      `[convert-images] Done: ${convertedCount} file(s) converted. Output: ${OUTPUT_DIR}`,
    ),
  );
}

convertImages();
