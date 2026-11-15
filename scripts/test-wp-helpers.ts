#!/usr/bin/env node
/*!
 * =================================================================================================
 * test-wp-helpers.js
 * =================================================================================================
 *
 * Тест PHP-хелперов динамических картинок (inc/helpers.php темы).
 *
 * Логика — чисто PHP/WP (wp_get_upload_dir, file_exists по uploads), поэтому
 * гоняется НЕ через Playwright, а внутри DDEV через WP-CLI: `wp eval-file`
 * загружает WordPress целиком, и mock-тест (tests/helpers-eval.php) проверяет
 * реальную функцию темы на mock-HTML с фикстурами в uploads.
 *
 * Требуется: запущенный DDEV-проект boiler-vite (см. README «Бэкенд»).
 * !dpx видит проект только из каталога с .ddev — запуск строго из backend/.
 *
 * Запуск: pnpm test:wp
 * =================================================================================================
 */

import { spawnSync } from "node:child_process";
import chalk from "chalk";

const EVAL_FILE = "wp-content/themes/my-theme/tests/helpers-eval.php";
const DDEV_CWD = "backend"; // .ddev лежит в backend/ — dpx видит проект только оттуда

let result = spawnSync("dpx", ["ddev", "wp", "eval-file", EVAL_FILE], {
  cwd: DDEV_CWD,
  encoding: "utf8",
});

// dpx нет в PATH — пробуем прямой ddev (он тоже видит проект из backend/).
if (result.error) {
  result = spawnSync("ddev", ["wp", "eval-file", EVAL_FILE], {
    cwd: DDEV_CWD,
    encoding: "utf8",
  });
}

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
if (output) {
  console.log(output);
}

if (result.error) {
  console.error(
    chalk.red(`\n❌ Не удалось запустить WP-CLI: ${result.error.message}`),
  );
  console.error(
    chalk.yellow(
      "   Нужен запущенный DDEV-проект (docker up): cd backend && dpx ddev start",
    ),
  );
  process.exit(1);
}

// Успех считается только по маркеру из теста: exit 0 без ALL PASS — аномалия.
if (result.status !== 0 || !output.includes("ALL PASS")) {
  console.error(
    chalk.red(
      `\n❌ Тест PHP-хелперов провален (exit ${result.status ?? "null"})`,
    ),
  );
  process.exit(1);
}

console.log(chalk.green("\n✅ PHP-хелперы динамических картинок работают\n"));
