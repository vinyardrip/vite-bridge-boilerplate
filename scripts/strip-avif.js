#!/usr/bin/env node
/*!
 * =================================================================================================
 * strip-avif.js
 * =================================================================================================
 *
 * Подготовка темы к деплою на шаред-хостинг (Фаза 4).
 *
 * Шаред-хостинг не умеет отдавать/конвертировать AVIF, поэтому перед заливкой
 * из PHP/HTML/CSS темы вырезаются все AVIF-фрагменты. Скрипт работает IN PLACE
 * по папке темы (по умолчанию backend/wp-content/themes/my-theme, можно
 * переопределить первым аргументом).
 *
 * ВАЖНО: репозиторий и локальный DDEV остаются «полными» — AVIF-версии
 * картинок лежат рядом с WebP и продолжают собираться. Если запустить
 * pnpm build && pnpm sync:theme заново, AVIF вернется. Скрипт запускается
 * один раз непосредственно перед заливкой на хостинг.
 *
 * Правила вырезания (из заметок проекта):
 *   1. <source srcset="… .avif …">            — тег целиком
 *   2. background-image: image-set(…avif…)    — декларация целиком
 *   3. ", }" → "}"                            — чистка запятых после вырезки
 *                                               (только в файлах, где были вырезки)
 *
 * Плюс контрольная проверка: если после вырезки в теме остались упоминания
 * AVIF (например, в <img srcset> или <link rel=preload>), скрипт перечислит
 * их с файлами и строками и завершится с ошибкой — деплой с битыми
 * картинками хуже падающей сборки.
 *
 * Использование:
 *   pnpm build:wp-strip-avif
 *   node scripts/strip-avif.js [корень_темы]
 *
 * =================================================================================================
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import chalk from "chalk";

// Корень темы: аргумент командной строки или значение по умолчанию.
const ROOT = process.argv[2] || "backend/wp-content/themes/my-theme";

/*! --- Правила вырезания AVIF-фрагментов --- */
const STRIP_RULES = [
  {
    // 1. Вырезать <source> целиком, если в его srcset есть .avif
    name: "<source> с AVIF в srcset",
    regex: /<source[^>]*\ssrcset=["'][^"']*\.avif(\s[^"']*)?["'][^>]*>/gi,
  },
  {
    // 2. Вырезать декларацию background-image: image-set(...) целиком,
    //    если внутри есть avif.
    //    !ВАЖНО: в заметках регэксп был image-set\([^)]*avif[^)]*\) — он не
    //    работает с url(...) внутри (из-за закрывающей скобки) и с
    //    многострочными значениями. Здесь матчится один уровень вложенных
    //    скобок: (?:[^()]|\([^()]*\))* — покрывает url() и переносы строк.
    name: "background-image: image-set() с AVIF",
    regex: /background-image\s*:\s*image-set\(((?:[^()]|\([^()]*\))*)\)\s*;?/gi,
    // Вырезаем матч только при наличии avif в содержимом image-set().
    shouldStrip: (_match, inner) => /avif/i.test(inner || ""),
  },
];

// 3. Убрать лишние запятые перед закрывающей скобкой (опциональное правило
// из заметок) — применяется только к файлам, где была хотя бы одна вырезка.
const COMMA_CLEANUP = [{ regex: /,\s*}/g, replacement: "}" }];

/*! --- Целевые файлы --- */
// PHP-шаблоны и HTML-страницы (правила 1), CSS темы (правило 2).
const globPatterns = ["**/*.php", "**/*.html", "**/*.css"];

const files = globSync(globPatterns, {
  cwd: ROOT,
  ignore: ["**/node_modules/**"],
})
  .sort()
  .map((file) => path.join(ROOT, file));

if (files.length === 0) {
  console.error(
    chalk.red(
      `❌ В "${ROOT}" не найдено PHP/HTML/CSS файлов. ` +
        `Сначала выполните pnpm build && pnpm sync:theme.`,
    ),
  );
  process.exit(1);
}

console.log(
  chalk.bold(`\n=== Strip AVIF: ${ROOT} (${files.length} файлов) ===\n`),
);

/*! --- Вырезание --- */
let changedFiles = 0;
let totalStrips = 0;

for (const file of files) {
  let src = readFileSync(file, "utf8");
  const appliedRules = [];

  for (const rule of STRIP_RULES) {
    rule.regex.lastIndex = 0;
    let ruleHits = 0;

    src = src.replace(rule.regex, (match, inner) => {
      if (rule.shouldStrip && !rule.shouldStrip(match, inner)) {
        return match;
      }
      ruleHits += 1;
      return "";
    });

    if (ruleHits > 0) {
      appliedRules.push(`${ruleHits} × ${rule.name}`);
      totalStrips += ruleHits;
    }
  }

  if (appliedRules.length === 0) {
    continue;
  }

  // Чистка запятых — только там, где что-то вырезали.
  for (const rule of COMMA_CLEANUP) {
    src = src.replace(rule.regex, rule.replacement);
  }

  writeFileSync(file, src, "utf8");
  changedFiles += 1;
  console.log(`  ${chalk.yellow("✂")} ${file}: ${appliedRules.join("; ")}`);
}

/*! --- Контрольная проверка: не осталось ли упоминаний AVIF --- */
const leftovers = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (/avif/i.test(lines[i])) {
      leftovers.push(`${file}:${i + 1}`);
    }
  }
}

console.log("");
if (leftovers.length > 0) {
  console.error(chalk.red("❌ Остались упоминания AVIF — деплоить нельзя:"));
  for (const leftover of leftovers) {
    console.error(chalk.red(`  • ${leftover}`));
  }
  console.error(
    chalk.red("\n   Добавьте правило вырезания в scripts/strip-avif.js\n"),
  );
  process.exit(1);
}

console.log(
  chalk.green(
    `✅ AVIF-фрагменты вырезаны: ${changedFiles} файл(ов) изменено, ` +
      `${totalStrips} вырезок. Упоминаний AVIF не осталось.\n`,
  ),
);
