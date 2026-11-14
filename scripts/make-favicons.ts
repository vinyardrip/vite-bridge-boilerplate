#!/usr/bin/env node
/*!
 * =================================================================================================
 * make-favicons.ts — генерация фавиконок и PWA-иконок из исходника
 * =================================================================================================
 *
 * Пакет @vite-pwa/assets-generator используется ЧЕРЕЗ программный API, а не CLI:
 * его CLI (`pwa-assets-generator`) пишет результат в каталог исходной картинки
 * (dirname(source)), опции «куда положить вывод» у него нет. Здесь исходник и
 * вывод разнесены:
 *
 *   исходник  — frontend/public/favicon.svg (его правит дизайнер/верстальщик);
 *   вывод     — frontend/public/assets/favicons/ (все сгенерированные иконки,
 *               чтобы не засорять корень public/ и корень dist/).
 *
 * public/ копируется в dist как есть → иконки попадают в dist/assets/favicons/,
 * а после `pnpm sync:theme` — в assets/assets/favicons/ темы WordPress.
 *
 * Сгенерированные файлы — АРТЕФАКТЫ (в .gitignore): пересоздаются командой
 * `pnpm favicons:generate`, которая автоматически выполняется перед каждой
 * сборкой (`pnpm build` / `pnpm build:wp`). Готовые иконки руками не кладут.
 *
 * Теги <link> печатаются в консоль для сведения; в шаблоны они вписаны явно:
 *   - фронтенд: frontend/src/views/layouts/_default.njk;
 *   - WordPress: backend/wp-content/themes/my-theme/header.php.
 *
 * =================================================================================================
 */

import { instructions } from "@vite-pwa/assets-generator/api/instructions";
import { generateAssets } from "@vite-pwa/assets-generator/api/generate-assets";
import { generateHtmlMarkup } from "@vite-pwa/assets-generator/api/generate-html-markup";
import { minimal2023Preset } from "@vite-pwa/assets-generator/presets/minimal-2023";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.resolve(__dirname, "..");

/*! --- ПУТИ (исходник и вывод разнесены, см. докблок) --- */
const SOURCE = path.resolve(rootPath, "frontend/public/favicon.svg");
const OUTPUT_DIR = path.resolve(rootPath, "frontend/public/assets/favicons");
// Префикс путей в печатаемых <link> — от корня dist/ (совпадает с публичным
// URL иконок и с путем внутри assets/ темы WP).
const BASE_PATH = "assets/favicons/";
// Имя SVG-фавиконки в OUTPUT_DIR: генератор не пишет SVG-исходник в вывод
// (его CLI рассчитывает, что исходник уже лежит в целевой папке), поэтому
// копируем его сами под постоянным именем — не зависящим от имени файла-исходника.
const SVG_NAME = "favicon.svg";

async function run() {
  console.log(chalk.bold("\n=== Генерация фавиконок (pwa-assets) ===\n"));

  // Fail-fast: без исходника генерировать не из чего.
  if (!existsSync(SOURCE)) {
    console.error(
      chalk.red(
        `❌ Исходник фавиконки не найден: ${path.relative(rootPath, SOURCE)}.\n` +
          "   Положите SVG-логотип в frontend/public/favicon.svg и повторите.",
      ),
    );
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const imageAssets = {
    imageResolver: () => readFile(SOURCE),
    imageName: SOURCE,
    originalName: path.relative(rootPath, SOURCE),
    // minimal-2023: pwa-64/192/512.png, maskable-icon-512x512.png,
    // apple-touch-icon-180x180.png, favicon.ico (48) + SVG-фавиконка.
    preset: minimal2023Preset,
    htmlLinks: { xhtml: false, includeId: false },
    basePath: BASE_PATH,
    resolveSvgName: () => SVG_NAME,
  } as unknown as Parameters<typeof instructions>[0];

  const instructionSet = await instructions(imageAssets);

  await generateAssets(instructionSet, true, OUTPUT_DIR, (message) => {
    console.log(message);
  });

  copyFileSync(SOURCE, path.join(OUTPUT_DIR, SVG_NAME));

  const links = generateHtmlMarkup(instructionSet);
  if (links.length > 0) {
    console.log(chalk.bold("\nТеги <link> для <head> (пути от корня dist):"));
    for (const link of links) {
      console.log(`  ${link}`);
    }
  }

  console.log(
    chalk.green(
      `\n✅ Фавиконки сгенерированы в ${path.relative(rootPath, OUTPUT_DIR)}\n`,
    ),
  );
}

run().catch((error) => {
  console.error(chalk.red("❌ Ошибка генерации фавиконок:"));
  console.error(error);
  process.exit(1);
});
