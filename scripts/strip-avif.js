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
 *
 * Плюс контрольная проверка: если после вырезки в теме остались упоминания
 * AVIF (php/html/css + manifest.json, например в <img srcset> или
 * <link rel=preload>), скрипт перечислит их с файлами и строками и завершится
 * с ошибкой — деплой с битыми картинками хуже падающей сборки.
 *
 * Использование:
 *   pnpm build:wp-strip-avif
 *   node scripts/strip-avif.js [корень_темы]
 *
 * =================================================================================================
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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
  {
    // 3. Вырезать плоскую декларацию background-image: url(… .avif …) —
    //    каскад миксина bgset (abstracts/_mixins.scss) после вырезки
    //    image-set из правила 2: остаются url-строки с .avif, и браузер
    //    без поддержки AVIF получил бы 404 вместо фолбэка (каскад CSS
    //    не откатывается к предыдущей декларации при 404 ресурса).
    //    Идет ПОСЛЕ правила 2 (image-set уже вырезан, остатки — только
    //    плоские url).
    //    !ГРАНИЦА ДЕКЛАРАЦИИ: [^;{}]* — semicolon НЕ единственная граница
    //    в минифицированном CSS: `[^;]*` пересекал бы `}` и @-правила
    //    (@-moz-document url-prefix(){...}) и съедал соседние декларации
    //    (проверено: матч глотал background-repeat:no-repeat следующего
    //    правила). Фигурные скобки и `;` вместе честно ограничивают одну
    //    декларацию; .avif внутри url() — единственное условие вырезки.
    name: "background-image: url() с AVIF",
    regex: /background-image\s*:\s*[^;{}]*\.avif[^;{}]*;?/gi,
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

/*! --- Удаление файлов *.avif (правило 5, плоская img/) ---
После вырезки ссылок в php/html/css файлы-сироты удаляются: деплой не
должен таскать AVIF-байты, которые никто не запросит (а на шаред-хостинге
AVIF мог бы и не отдаться). Удаляем рекурсивно все *.avif от корня темы —
все варианты в плоской img/ лежат РЯДОМ с webp/jpg (см. assetFileNames
в vite.config.js), подпапок форматов нет и появиться не должно. */
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
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
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

/*! --- Контрольная проверка: не осталось ли упоминаний AVIF ---
Сканируем те же php/html/css + manifest.json (после чистки правилом 6
avif-упоминаний там быть не должно). Файлы *.avif сами по себе не
содержат текста — они уже удалены правилом 5. */
const leftovers = [];
const checkFiles = [...files];
if (existsSync(manifestPath)) {
  checkFiles.push(manifestPath);
}

for (const file of checkFiles) {
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
    `✅ AVIF вырезан: ${changedFiles} файл(ов) изменено, ` +
      `${totalStrips} вырезок, ${deletedFiles} *.avif удалено. ` +
      `Упоминаний AVIF не осталось.\n`,
  ),
);
