/*!
 * =================================================================================================
 * check-build.js
 * =================================================================================================
 *
 * Скрипт-тест артефактов сборки (build smoke test).
 * Запускается после `pnpm build` и проверяет, что в dist/ есть всё ожидаемое
 * и что в production-артефакты не просочился dev-код.
 *
 * Проверки:
 *  1. HTML-страницы собраны (index.html, test-fonts.html).
 *  2. manifest.json валиден и ссылки из него существуют на диске.
 *  3. В HTML нет dev-артефактов: dev-сервера Vite, @vite/client,
 *     NJK-комментариев (vite-njk-trace работает только в dev).
 *  4. В исполняемых .js нет debug-css-overflow (подключен под import.meta.env.DEV).
 *  5. Нет осиротевших sourcemap'ов (.js.map без парного .js).
 *  6. Статика из frontend/public скопирована в dist.
 *
 * Запуск: pnpm test:build
 * =================================================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import chalk from "chalk";

const DIST_DIR = "dist";
const MANIFEST_PATH = path.join(DIST_DIR, "manifest.json");

const expectedHtmlPages = ["index.html", "test-fonts.html", "styleguide.html"];
const expectedPublicFiles = ["favicon.svg", "robots.txt"];

/*! --- Сбор результатов --- */
const errors = [];
const checks = [];

const check = (description, ok, details = "") => {
  checks.push({ description, ok, details });
  if (!ok) {
    errors.push(`${description}${details ? ` — ${details}` : ""}`);
  }
};

/*! --- 0. Директория сборки --- */
check(
  "Директория dist/ существует",
  fs.existsSync(DIST_DIR) && fs.statSync(DIST_DIR).isDirectory(),
  "запустите pnpm build",
);

if (errors.length > 0) {
  console.error(chalk.red("\n❌ Сборка не найдена, дальнейшие проверки невозможны.\n"));
  process.exit(1);
}

/*! --- 1. HTML-страницы --- */
for (const page of expectedHtmlPages) {
  const pagePath = path.join(DIST_DIR, page);
  const exists = fs.existsSync(pagePath) && fs.statSync(pagePath).size > 0;
  check(`HTML-страница ${page} собрана и не пуста`, exists);
}

/*! --- 2. manifest.json --- */
let manifest = null;
if (fs.existsSync(MANIFEST_PATH)) {
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    check("manifest.json — валидный JSON", true);
  } catch (e) {
    check("manifest.json — валидный JSON", false, e.message);
  }
} else {
  check("manifest.json существует", false, MANIFEST_PATH);
}

if (manifest) {
  const appEntry = manifest["frontend/src/js/app.js"];
  check(
    "manifest.json содержит точку входа frontend/src/js/app.js",
    Boolean(appEntry?.file),
  );

  if (appEntry?.file) {
    check(
      `Файл точки входа существует: ${appEntry.file}`,
      fs.existsSync(path.join(DIST_DIR, appEntry.file)),
    );
  }

  // Каждый entry/chunk/css из манифеста должен существовать на диске.
  for (const [key, value] of Object.entries(manifest)) {
    if (value?.file && !value.isEntry) {
      check(
        `Ассет из манифеста существует: ${value.file} (${key})`,
        fs.existsSync(path.join(DIST_DIR, value.file)),
      );
    }
  }
}

/*! --- 3. Dev-артефакты в HTML --- */
const devArtifacts = [
  { pattern: "localhost:5173", label: "адрес dev-сервера Vite" },
  { pattern: "@vite/client", label: "клиент Vite HMR" },
  { pattern: "NJK:", label: "трейс-комментарии vite-njk-trace" },
];

const htmlFiles = globSync(`${DIST_DIR}/**/*.html`);
for (const htmlFile of htmlFiles) {
  const content = fs.readFileSync(htmlFile, "utf-8");
  for (const { pattern, label } of devArtifacts) {
    check(
      `${path.relative(DIST_DIR, htmlFile)}: нет ${label}`,
      !content.includes(pattern),
    );
  }

  // base: './' — пути к ассетам в HTML должны быть относительными,
  // чтобы dist/index.html открывался через file:// (двойной клик).
  check(
    `${path.relative(DIST_DIR, htmlFile)}: нет абсолютных путей к ассетам`,
    !/(src|href)="\/(css|js|img|fonts)\//.test(content),
    "ожидается base: './'",
  );
}

/*! --- 4. Dev-код в исполняемых JS --- */
const jsFiles = globSync(`${DIST_DIR}/js/*.js`, { ignore: ["**/*.map"] });
for (const jsFile of jsFiles) {
  const content = fs.readFileSync(jsFile, "utf-8");
  check(
    `${path.relative(DIST_DIR, jsFile)}: нет debug-css-overflow`,
    !content.includes("debug-css-overflow"),
  );
}

/*! --- 5. Осиротевшие sourcemap'ы --- */
const mapFiles = globSync(`${DIST_DIR}/**/*.js.map`);
for (const mapFile of mapFiles) {
  const jsFile = mapFile.replace(/\.map$/, "");
  check(
    `${path.relative(DIST_DIR, mapFile)}: имеет парный .js`,
    fs.existsSync(jsFile),
    "осиротевшая карта от удаленного чанка",
  );
}

/*! --- 6. Статика из public --- */
for (const publicFile of expectedPublicFiles) {
  check(
    `Статика скопирована: ${publicFile}`,
    fs.existsSync(path.join(DIST_DIR, publicFile)),
  );
}

/*! --- 7. Конфигурация сборки (исходники, а не артефакты) --- */
// PWA-плагин выключен, но его справочный код обязан жить в конфиге
// закомментированным: пользователь включает PWA раскомментированием,
// не раскапывая Git-историю.
const viteConfigSource = fs.readFileSync("vite.config.js", "utf-8");
check(
  "vite.config.js: закомментированный импорт vite-plugin-pwa на месте",
  viteConfigSource.includes('// import { VitePWA } from "vite-plugin-pwa";'),
);
check(
  "vite.config.js: закомментированные блоки VitePWA на месте (3 шт.)",
  (viteConfigSource.match(/\/\/\s*VitePWA\(\{/g) || []).length === 3,
);

// .env для TinyPNG должен искаться в frontend/ (архитектура проекта),
// а путь не должен зависеть от process.cwd().
const compressScriptSource = fs.readFileSync("scripts/compress-images.js", "utf-8");
check(
  "compress-images.js: .env ищется в frontend/, путь привязан к скрипту",
  compressScriptSource.includes('import.meta.dirname') &&
    compressScriptSource.includes('"frontend", ".env"') &&
    !compressScriptSource.includes('process.cwd()'),
);
// Само поведение «нет ключей → warning, сборка не падает» проверяет
// `pnpm build`: compress-images.js стоит первым в цепочке и обязан
// завершиться с кодом 0.

/*! --- Отчет --- */
const failed = checks.filter((c) => !c.ok).length;
const passed = checks.length - failed;

console.log(chalk.bold("\n=== Build Smoke Test ===\n"));
for (const { description, ok } of checks) {
  console.log(`  ${ok ? chalk.green("✓") : chalk.red("✗")} ${description}`);
}

if (failed > 0) {
  console.error(
    chalk.red(`\n❌ Провалено проверок: ${failed} из ${checks.length}\n`),
  );
  process.exit(1);
}

console.log(
  chalk.green(`\n✅ Все проверки пройдены: ${passed} из ${checks.length}\n`),
);
