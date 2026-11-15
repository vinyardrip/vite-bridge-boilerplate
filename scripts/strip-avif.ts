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
 *   3. background-image: url(… .avif …)       — декларация целиком (каскад
 *                                               миксина bgset: после вырезки
 *                                               image-set остается плоский
 *                                               url-каскад с .avif строкой)
 *   4. ", }" → "}"                            — чистка запятых после вырезки
 *                                               (только в файлах, где были вырезки)
 *
 * Плюс (плоская структура img/ — все форматы лежат РЯДОМ, img/name.hash.avif):
 *   5. файлы *.avif в теме (рекурсивно)        — удаляются (сироты после
 *                                               вырезки ссылок; шаред-хостинг
 *                                               не должен таскать AVIF-байты)
 *   6. manifest.json: записи с file=*.avif     — удаляются целиком, а из
 *                                               массивов assets других записей
 *                                               вырезаются .avif-пути (get_asset()
 *                                                   возвращает file как есть —
 *                                               ссылки на удаленные файлы стали
 *                                               бы битыми)
 *   7. assets-manifest.json: avif-варианты     — вырезаются из variants
 *                                               растровых записей (theme_picture()
 *                                               строит <source image/avif> из них;
 *                                               файлы уже удалены правилом 5)
 *
 * Плюс контрольная проверка: если после вырезки в теме остались ФАЙЛОВЫЕ
 * ссылки на .avif (php/html/css + оба манифеста, регэксп /\.avif\b/ — голые
 * слова «AVIF» в тексте и ключи формата в коде ссылками не считаются),
 * скрипт перечислит их с файлами и строками и завершится с ошибкой —
 * деплой с битыми картинками хуже падающей сборки.
 *
 * tests/ исключены из сканирования — dev-артефакты (tests/test_helpers.php
 * содержит фикстурные .avif URL), на деплой они не попадают.
 *
 * Использование:
 *   pnpm build:wp-strip-avif
 *   tsx scripts/strip-avif.ts [корень_темы]
 *
 * Статический вариант (копия dist → dist-wp/ без AVIF, оригинал не трогается):
 * scripts/strip-avif-dist.js (pnpm strip-avif:dist). Общие правила вырезки
 * вынесены в strip-avif-rules.ts — правятся в одном месте.
 *
 * =================================================================================================
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import chalk from "chalk";

import { COMMA_CLEANUP, STRIP_RULES } from "./strip-avif-rules.ts";

// Корень темы: аргумент командной строки или значение по умолчанию.
const ROOT = process.argv[2] || "backend/wp-content/themes/my-theme";

/*! --- Целевые файлы --- */
// PHP-шаблоны и HTML-страницы (правило 1), CSS темы (правила 2/3).
// tests/ исключены: это dev-артефакты (например, tests/test_helpers.php
// содержит фикстурные ".avif" URL — они не деплоятся и вырезке не подлежат).
const globPatterns = ["**/*.php", "**/*.html", "**/*.css"];

const files = globSync(globPatterns, {
  cwd: ROOT,
  ignore: ["**/node_modules/**", "**/tests/**"],
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
  const appliedRules: string[] = [];

  for (const rule of STRIP_RULES) {
    rule.regex.lastIndex = 0;
    let ruleHits = 0;

    src = src.replace(rule.regex, (match: string, inner: string) => {
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

/*! --- Удаление файлов *.avif (правило 5, плоская img/) ---
После вырезки ссылок в php/html/css файлы-сироты удаляются: деплой не
должен таскать AVIF-байты, которые никто не запросит (а на шаред-хостинге
AVIF мог бы и не отдаться). Удаляем рекурсивно все *.avif от корня темы —
все варианты в плоской img/ лежат РЯДОМ с webp/jpg (см. assetFileNames
в vite.config.ts), подпапок форматов нет и появиться не должно. */
const avifFiles = globSync("**/*.avif", { cwd: ROOT }).sort();
let deletedFiles = 0;
for (const file of avifFiles) {
  unlinkSync(path.join(ROOT, file));
  deletedFiles += 1;
  console.log(`  ${chalk.yellow("🗑")} ${file}`);
}

/*! --- Чистка manifest.json (правило 6) ---
get_asset() (inc/enqueue-assets.php) возвращает manifest[entry].file как
есть — после удаления файлов ссылки на *.avif стали бы битыми. Записи с
avif-файлом вырезаем целиком (ключ и src тоже указывают на avif), а из
массивов assets других записей (например, у точки входа app.js) убираем
avif-пути. Манифест лежит в assets/ темы (корень outDir сборки WP) —
именно его читает get_asset(): get_template_directory() . '/assets/manifest.json'. */
const manifestPath = path.join(ROOT, "assets", "manifest.json");
let manifestCleaned = false;
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    { file?: string; src?: string; assets?: string[] } | undefined
  >;
  for (const [key, entry] of Object.entries(manifest)) {
    if (/\.avif$/i.test(entry?.file ?? "")) {
      delete manifest[key];
      manifestCleaned = true;
    } else if (Array.isArray(entry?.assets)) {
      const filtered = entry.assets.filter((f) => !/\.avif$/i.test(f));
      if (filtered.length !== entry.assets.length) {
        entry.assets = filtered;
        manifestCleaned = true;
      }
    }
  }
  if (manifestCleaned) {
    // Формат как у самого Vite: pretty-print 2 пробела, без перевода строки.
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    console.log(
      `  ${chalk.yellow("✂")} manifest.json: avif-записи удалены`,
    );
  }
}

/*! --- Чистка assets-manifest.json (smart-assets) ---
theme_picture() (inc/assets-helpers.php) на живой теме строит <source
type="image/avif"> из variants записи — после удаления *.avif-файлов
(правило 5) это были бы ссылки на сироты. Вырезаем avif-варианты из
variants каждой растровой записи. */
const smartManifestPath = path.join(ROOT, "assets", "assets-manifest.json");
let smartManifestCleaned = false;
if (existsSync(smartManifestPath)) {
  const manifest = JSON.parse(readFileSync(smartManifestPath, "utf8")) as {
    entries?: Array<{ variants?: Array<{ format?: string }> }>;
  };
  for (const entry of manifest.entries ?? []) {
    if (Array.isArray(entry?.variants)) {
      const filtered = entry.variants.filter((v) => (v.format ?? "") !== "avif");
      if (filtered.length !== entry.variants.length) {
        entry.variants = filtered;
        smartManifestCleaned = true;
      }
    }
  }
  if (smartManifestCleaned) {
    writeFileSync(smartManifestPath, JSON.stringify(manifest, null, 2), "utf8");
    console.log(
      `  ${chalk.yellow("✂")} assets-manifest.json: avif-варианты удалены`,
    );
  }
}

/*! --- Контрольная проверка: не осталось ли упоминаний AVIF ---
Сканируем те же php/html/css + manifest.json (после чистки правилом 6
avif-упоминаний там быть не должно). Файлы *.avif сами по себе не
содержат текста — они уже удалены правилом 5. */
/*! --- Контрольная проверка: не осталось ли упоминаний AVIF ---
Сканируем те же php/html/css + оба манифеста (после чистки avif-упоминаний
там быть не должно). Файлы *.avif сами по себе не содержат текста — они
уже удалены правилом 5.
ИЩЕМ файловые ссылки (регэксп /\.avif\b/): голые слова «AVIF» в тексте
шаблонов и ключи формата в коде ссылками не являются.
ИСКЛЮЧЕНИЕ — inc/helpers.php: его .avif-логика (динамические картинки
uploads) — file_exists-guarded контракт, а не статическая ссылка: сиблингов
в uploads нет → разметки нет → <img> отдается как есть. На хостинге без AVIF
это безопасно без вырезки кода. */
const SCAN_EXEMPT = [/inc[/\\]helpers\.php$/];

const leftovers: string[] = [];
const checkFiles: string[] = [...files];
for (const manifestPathToCheck of [manifestPath, smartManifestPath]) {
  if (existsSync(manifestPathToCheck)) {
    checkFiles.push(manifestPathToCheck);
  }
}

for (const file of checkFiles) {
  if (SCAN_EXEMPT.some((re) => re.test(file))) {
    continue;
  }
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (/\.avif\b/i.test(lines[i])) {
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
    chalk.red("\n   Добавьте правило вырезания в scripts/strip-avif.ts\n"),
  );
  process.exit(1);
}

console.log(
  chalk.green(
    `✅ AVIF вырезан: ${changedFiles} файл(ов) изменено, ` +
      `${totalStrips} вырезок, ${deletedFiles} *.avif удалено. ` +
      `Упоминаний AVIF не осталось.\n`,
  ),
);
