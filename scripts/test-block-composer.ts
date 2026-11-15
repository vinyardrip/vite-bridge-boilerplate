#!/usr/bin/env node
/*!
 * =================================================================================================
 * test-block-composer.ts
 * =================================================================================================
 *
 * Обертка над интеграционным тестом Block Composer (см. tests/block-composer-eval.php).
 *
 * Тест гоняется внутри DDEV через WP-CLI (`wp eval-file`): WordPress загружается
 * целиком, поэтому функции темы, cfs_next-движок и WP_Query доступны напрямую.
 *
 * Требуется запущенный DDEV-проект grand-mebel (docker up).
 * Запуск: pnpm test:php
 * =================================================================================================
 */

import { spawnSync } from "node:child_process";
import chalk from "chalk";

// Внутри контейнера /var/www/html = КОРЕНЬ репозитория (docroot backend монтируется
// целиком), поэтому путь к eval-файлу — с префиксом backend/.
const EVAL_FILE = "backend/wp-content/themes/my-theme/tests/block-composer-eval.php";
// Правило проекта: ТОЛЬКО `dpx ddev <command>` — голый ddev запрещён.
// Флаг --here работает в текущей папке (root репо), не трогая другие проекты.
const DDEV_CWD = ".";

const result = spawnSync("dpx", ["ddev", "wp", "eval-file", EVAL_FILE, "--here"], {
  cwd: DDEV_CWD,
  encoding: "utf8",
});

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
      "   Нужен запущенный DDEV-проект (docker up): ddev start",
    ),
  );
  process.exit(1);
}

// Успех считается только по маркеру из теста: exit 0 без ALL PASS — аномалия.
if (result.status !== 0 || !output.includes("ALL PASS")) {
  console.error(chalk.red("\n❌ Block Composer: тесты провалены"));
  process.exit(1);
}

console.log(chalk.green("\n✅ Block Composer: ALL PASS"));
