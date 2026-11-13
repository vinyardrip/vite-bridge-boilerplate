#!/usr/bin/env node
/*!
 * =================================================================================================
 * strip-avif-dist.js — статическая сборка без AVIF для слабого хостинга
 * =================================================================================================
 *
 * Шаред-хостинг не умеет отдавать/конвертировать AVIF. Скрипт берет
 * собранный dist/ и создает его КОПИЮ dist-wp/ без AVIF — оригинальный dist/
 * не трогается (он нужен локально для preview/тестов).
 *
 * Что делается в dist-wp/:
 *   1. копия dist/ целиком (каждый запуск — с нуля: rm + cp, идемпотентно);
 *   2. вырезка AVIF-фрагментов из HTML/CSS общими правилами
 *      strip-avif-rules.js (<source> с .avif в srcset, image-set(…avif…),
 *      плоский url(… .avif …) из каскада bgset);
 *   3. удаление файлов *.avif (сироты после вырезки ссылок);
 *   4. чистка манифестов: manifest.json (Vite — записи с file=*.avif
 *      удаляются, avif-пути вычищаются из массивов assets) и
 *      assets-manifest.json (smart-assets — avif-варианты удаляются из
 *      variants каждой растровой записи);
 *   5. контрольная проверка: если в html/css/манифестах остались упоминания
 *      AVIF — перечислить и завершиться с ошибкой (exit 1).
 *
 * Отличие от strip-avif.js: тот режет ТЕМУ WordPress IN PLACE (деплой
 * PHP-темы после sync:theme), этот — про статический деплой dist/.
 *
 * Использование:
 *   pnpm strip-avif:dist
 *   node scripts/strip-avif-dist.js [src] [target]   # по умолчанию dist dist-wp
 *
 * =================================================================================================
 */

import { cpSync, existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import chalk from "chalk";

import { COMMA_CLEANUP, STRIP_RULES } from "./strip-avif-rules.js";

const SRC = process.argv[2] || "dist";
const TARGET = process.argv[3] || "dist-wp";

if (!existsSync(SRC)) {
  console.error(
    chalk.red(`❌ "${SRC}" не найден — сначала соберите проект: pnpm build.`),
  );
  process.exit(1);
}
if (TARGET === SRC || TARGET.startsWith(`${SRC}/`) || SRC.startsWith(`${TARGET}/`)) {
  console.error(chalk.red(`❌ Папки ${SRC} и ${TARGET} не должны пересекаться.`));
  process.exit(1);
}

console.log(
  chalk.bold(`\n=== Strip AVIF (dist): ${SRC}/ → ${TARGET}/ ===\n`),
);

/*! --- 1. Свежая копия dist → dist-wp --- */
rmSync(TARGET, { recursive: true, force: true });
cpSync(SRC, TARGET, { recursive: true });

/*! --- 2. Вырезка AVIF-фрагментов из HTML/CSS копии --- */
const files = globSync(["**/*.html", "**/*.css"], {
  cwd: TARGET,
  ignore: ["**/node_modules/**"],
})
  .sort()
  .map((file) => path.join(TARGET, file));

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

  for (const rule of COMMA_CLEANUP) {
    src = src.replace(rule.regex, rule.replacement);
  }

  writeFileSync(file, src, "utf8");
  changedFiles += 1;
  console.log(`  ${chalk.yellow("✂")} ${file}: ${appliedRules.join("; ")}`);
}

/*! --- 3. Удаление файлов *.avif (сироты после вырезки ссылок) --- */
const avifFiles = globSync("**/*.avif", { cwd: TARGET }).sort();
let deletedFiles = 0;
for (const file of avifFiles) {
  unlinkSync(path.join(TARGET, file));
  deletedFiles += 1;
  console.log(`  ${chalk.yellow("🗑")} ${path.join(TARGET, file)}`);
}

/*! --- 4. Чистка манифестов ---
   manifest.json (Vite): get_asset() возвращает file как есть — записи с
   avif-файлом удаляются, avif-пути вычищаются из массивов assets.
   assets-manifest.json (smart-assets): у растровых записей удаляются
   avif-варианты из variants (файлы уже удалены шагом 3) — иначе theme_picture()
   на живой теме/потребители манифеста генерировали бы ссылки на сироты. */
let manifestsCleaned = 0;

const viteManifestPath = path.join(TARGET, "manifest.json");
if (existsSync(viteManifestPath)) {
  const manifest = JSON.parse(readFileSync(viteManifestPath, "utf8"));
  let touched = false;
  for (const [key, entry] of Object.entries(manifest)) {
    if (/\.avif$/i.test(entry?.file ?? "")) {
      delete manifest[key];
      touched = true;
    } else if (Array.isArray(entry?.assets)) {
      const filtered = entry.assets.filter((f) => !/\.avif$/i.test(f));
      if (filtered.length !== entry.assets.length) {
        entry.assets = filtered;
        touched = true;
      }
    }
  }
  if (touched) {
    writeFileSync(viteManifestPath, JSON.stringify(manifest, null, 2), "utf8");
    manifestsCleaned += 1;
    console.log(`  ${chalk.yellow("✂")} manifest.json: avif-записи удалены`);
  }
}

const smartManifestPath = path.join(TARGET, "assets-manifest.json");
if (existsSync(smartManifestPath)) {
  const manifest = JSON.parse(readFileSync(smartManifestPath, "utf8"));
  let touched = false;
  for (const entry of manifest.entries ?? []) {
    if (Array.isArray(entry?.variants)) {
      const filtered = entry.variants.filter((v) => (v.format ?? "") !== "avif");
      if (filtered.length !== entry.variants.length) {
        entry.variants = filtered;
        touched = true;
      }
    }
  }
  if (touched) {
    writeFileSync(smartManifestPath, JSON.stringify(manifest, null, 2), "utf8");
    manifestsCleaned += 1;
    console.log(`  ${chalk.yellow("✂")} assets-manifest.json: avif-варианты удалены`);
  }
}

/*! --- 5. Контрольная проверка: не осталось ли упоминаний AVIF --- */
const leftovers = [];
const checkFiles = [...files];
for (const manifestPath of [viteManifestPath, smartManifestPath]) {
  if (existsSync(manifestPath)) {
    checkFiles.push(manifestPath);
  }
}

for (const file of checkFiles) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    // Файловые ссылки на .avif (url/srcset/пути манифестов). Голые слова
    // «AVIF» в пользовательском тексте и aria-label не считаются: это не
    // ссылки, и вырезать их из контента деплой не должен.
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
    chalk.red("\n   Добавьте правило вырезания в scripts/strip-avif-rules.js\n"),
  );
  process.exit(1);
}

console.log(
  chalk.green(
    `✅ dist-wp готов: ${changedFiles} файл(ов) изменено, ` +
      `${totalStrips} вырезок, ${deletedFiles} *.avif удалено, ` +
      `${manifestsCleaned} манифест(ов) почищено. ` +
      `Упоминаний AVIF не осталось. Оригинальный ${SRC}/ не тронут.\n`,
  ),
);
