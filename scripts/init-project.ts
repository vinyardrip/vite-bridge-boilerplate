/*!
 * =================================================================================================
 * init-project.ts
 * =================================================================================================
 *
 * Генератор нового проекта из бойлерплейта (концепция — docs/BOILERPLATE_MANUAL.md, раздел 3).
 *
 * Что делает:
 *   1. Спрашивает slug нового проекта (или берёт из флага --name) и название сайта.
 *   2. Переименовывает папки `my-theme` (тема + фикстуры) под новый slug.
 *   3. Заменяет во всех текстовых файлах репозитория:
 *        my_theme  → <snake>  (PHP-префиксы функций)
 *        my-theme  → <slug>   (textdomain, handles, пути)
 *        My Theme  → <Title>  (Theme Name в style.css, site.json)
 *   4. Обновляет конфиги: package.json (name), project.config.json (projectName, themeSlug),
 *      frontend/src/data/site.json (name), .ddev/config.yaml (name).
 *   5. Подчищает артефакты сборки: dist/, playwright-report/, test-results/.
 *   6. Верифицирует: повторный поиск старых токенов обязан дать ноль.
 *
 * docs/BOILERPLATE_MANUAL.md НЕ трогаем — это документация самого бойлерплейта.
 *
 * Запуск:
 *   pnpm tsx scripts/init-project.ts                        # интерактивный режим
 *   pnpm tsx scripts/init-project.ts --name=grand-mebel     # неинтерактивно
 *   pnpm tsx scripts/init-project.ts --name=x --dry-run     # предпросмотр без изменений
 *   pnpm tsx scripts/init-project.ts --name=x --title="X" --yes
 *
 * Скрипт намеренно использует только node:* (без зависимостей): его можно запускать
 * на свежем клоне ДО `pnpm install`.
 *
 * История git не трогается: решайте сами, делать ли fresh-init (см. отчёт в конце).
 * =================================================================================================
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- Токены дефолтного бойлерплейта -----------------------------------------------------------

const OLD_SLUG = "my-theme";
const OLD_PREFIX = "my_theme";
const OLD_TITLE = "My Theme";

// --- Что не сканируем -------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "vendor",
  "playwright-report",
  "test-results",
  ".ck",
  ".zcode",
  "temp",
]);

const SKIP_FILES = new Set([
  // Документация самого бойлерплейта — описывает его, а не конкретный проект.
  "BOILERPLATE_MANUAL.md",
  // Лок-файл не содержит имени темы (проверено grep'ом), но он огромный — не читаем.
  "pnpm-lock.yaml",
  // Себя не переписываем: в коде есть строковые литералы со старыми токенами.
  "init-project.ts",
]);

const ARTIFACT_DIRS = ["dist", "playwright-report", "test-results"];

// --- Типы -------------------------------------------------------------------------------------

interface Derived {
  slug: string;
  title: string;
  snake: string;
}

interface FileEdit {
  rel: string;
  count: number;
}

// --- Утилиты ----------------------------------------------------------------------------------

function fail(msg: string): never {
  console.error(`ОШИБКА: ${msg}`);
  process.exit(1);
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/** Возвращает текст файла или null для бинарных. */
function readText(file: string): string | null {
  const buf = fs.readFileSync(file);
  if (buf.includes(0)) return null;
  return buf.toString("utf8");
}

function replaceTokens(text: string, d: Derived): { text: string; count: number } {
  const pairs: Array<[string, string]> = [
    [OLD_PREFIX, d.snake],
    [OLD_SLUG, d.slug],
    [OLD_TITLE, d.title],
  ];
  let count = 0;
  let result = text;
  for (const [from, to] of pairs) {
    count += result.split(from).length - 1;
    result = result.split(from).join(to);
  }
  return { text: result, count };
}

function findThemeDirs(): string[] {
  const found: string[] = [];
  const stack = [ROOT];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === OLD_SLUG) {
        found.push(full);
      }
      stack.push(full);
    }
  }
  return found.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
}

function scanTokenFiles(files: string[], d: Derived): FileEdit[] {
  const edits: FileEdit[] = [];
  for (const file of files) {
    if (SKIP_FILES.has(path.basename(file))) continue;
    const text = readText(file);
    if (text === null) continue;
    const count = replaceTokens(text, d).count;
    if (count > 0) edits.push({ rel: path.relative(ROOT, file), count });
  }
  return edits;
}

function updateJson(rel: string, patch: Record<string, string>, d: Derived): FileEdit | null {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return null;
  const original = readText(file);
  if (original === null) return null;
  const obj = JSON.parse(original) as Record<string, unknown>;
  let changed = 0;
  for (const [key, value] of Object.entries(patch)) {
    if (key in obj && obj[key] !== value) {
      obj[key] = value;
      changed += 1;
    }
  }
  if (changed === 0) return null;
  const trailing = original.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + trailing);
  return { rel: `${rel} (${Object.keys(patch).join(", ")})`, count: changed };
}

function updateDdevName(d: Derived): FileEdit | null {
  const rel = path.join(".ddev", "config.yaml");
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return null;
  const original = readText(file);
  if (original === null) return null;
  // Первая строка `name: ...` на уровне корня конфига (не в комментариях/вложенных списках).
  const updated = original.replace(/^name:\s*.*$/m, `name: ${d.slug}`);
  if (updated === original) return null;
  fs.writeFileSync(file, updated);
  return { rel: `${rel} (name)`, count: 1 };
}

function removeArtifacts(): string[] {
  const removed: string[] = [];
  for (const name of ARTIFACT_DIRS) {
    const full = path.join(ROOT, name);
    if (fs.existsSync(full)) {
      fs.rmSync(full, { recursive: true, force: true });
      removed.push(`${name}/`);
    }
  }
  return removed;
}

// --- Аргументы --------------------------------------------------------------------------------

interface Args {
  name?: string;
  title?: string;
  dryRun: boolean;
  yes: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, yes: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--yes" || arg === "-y") {
      args.yes = true;
    } else if (arg === "--name") {
      args.name = argv[++i];
    } else if (arg.startsWith("--name=")) {
      args.name = arg.slice("--name=".length);
    } else if (arg === "--title") {
      args.title = argv[++i];
    } else if (arg.startsWith("--title=")) {
      args.title = arg.slice("--title=".length);
    } else if (!arg.startsWith("--")) {
      args.name = arg; // позиционный аргумент
    } else {
      fail(`неизвестный флаг: ${arg} (см. --help)`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Генератор нового проекта из бойлерплейта Vite Bridge.

Использование:
  pnpm tsx scripts/init-project.ts [--name=<slug>] [--title=<Название>] [--dry-run] [--yes]

Флаги:
  --name=<slug>    Slug проекта (нижний регистр, цифры, дефисы; 3–50 символов).
  --title=<...>    Отображаемое название сайта (по умолчанию — Title Case от slug).
  --dry-run        Показать план действий и выйти, ничего не меняя.
  --yes, -y        Не спрашивать подтверждение (для неинтерактивных запусков).
  --help, -h       Эта справка.`);
}

// --- Основной сценарий ------------------------------------------------------------------------

function derive(d: { slug: string; title: string }): Derived {
  return {
    slug: d.slug,
    title: d.title,
    snake: d.slug.split("-").join("_"),
  };
}

function validateSlug(slug: string): void {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    fail(`slug "${slug}": разрешены строчные буквы, цифры и дефисы внутри (не в начале/конце)`);
  }
  if (slug.length < 3 || slug.length > 50) {
    fail(`slug "${slug}": длина должна быть от 3 до 50 символов`);
  }
  if (slug === OLD_SLUG) {
    fail("это дефолтное имя темы бойлерплейта — нужно новое имя проекта");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  // 1. Ввод имени и названия (интерактивно или из флагов).
  let slug = args.name?.trim().toLowerCase();
  if (!slug) {
    if (!process.stdin.isTTY) {
      fail("не указано имя проекта. Запустите с --name=<slug> или в TTY для интерактивного режима");
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    slug = (await rl.question("Slug нового проекта (например: grand-mebel): ")).trim().toLowerCase();
    rl.close();
  }
  validateSlug(slug);

  const derivedTitle =
    args.title?.trim() ||
    slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const d = derive({ slug, title: derivedTitle });

  // 2. Состояние: есть ли вообще что переименовывать (идемпотентность).
  const themeDirs = findThemeDirs();
  const scannedFiles = walk(ROOT);
  const edits = scanTokenFiles(scannedFiles, d);
  if (themeDirs.length === 0 && edits.length === 0) {
    console.log(`Токенов "${OLD_SLUG}" / "${OLD_PREFIX}" / "${OLD_TITLE}" не найдено — проект уже инициализирован, выходим.`);
    return;
  }

  // 3. План.
  console.log(`\nПлан инициализации проекта "${d.slug}":`);
  console.log(`  Название сайта:  ${d.title}`);
  console.log(`  PHP-префикс:     ${d.snake}_`);
  console.log(`  Папки к переименованию (${themeDirs.length}):`);
  for (const dir of themeDirs) {
    console.log(`    ${path.relative(ROOT, dir)} → ${path.join(path.dirname(path.relative(ROOT, dir)), d.slug)}`);
  }
  console.log(`  Файлы к замене (${edits.length}): ${edits.reduce((sum, e) => sum + e.count, 0)} вхождений`);
  console.log(`  Конфиги: package.json (name), project.config.json (projectName, themeSlug),`);
  console.log(`           frontend/src/data/site.json (name), .ddev/config.yaml (name)`);
  console.log(`  Артефакты: ${ARTIFACT_DIRS.join(", ")} — удалить`);
  console.log(`  Пропуск: docs/BOILERPLATE_MANUAL.md (документация бойлерплейта), pnpm-lock.yaml`);

  if (args.dryRun) {
    console.log("\n[dry-run] Ничего не изменено.");
    return;
  }

  // 4. Подтверждение.
  if (!args.yes) {
    if (!process.stdin.isTTY) {
      fail("запуск без TTY требует флаг --yes для подтверждения");
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question("\nПродолжить? [y/N] ")).trim().toLowerCase();
    rl.close();
    if (answer !== "y" && answer !== "yes") {
      console.log("Отменено.");
      return;
    }
  }

  // 5. Переименование папок. Вложенные `my-theme` (например фикстуры внутри темы) при
  //    переименовании родителя меняют путь — сканируем заново после каждого rename.
  let renamed = 0;
  for (;;) {
    const dirs = findThemeDirs();
    if (dirs.length === 0) break;
    const dir = dirs[0]; // findThemeDirs сортирует по глубине — переименовываем внешние первыми
    fs.renameSync(dir, path.join(path.dirname(dir), d.slug));
    renamed += 1;
    if (renamed > 100) fail("слишком много переименований — проверьте структуру папок");
  }

  // 6. Замена токенов в файлах (после переименования — по актуальному дереву).
  const applied: FileEdit[] = [];
  let totalReplacements = 0;
  for (const file of walk(ROOT)) {
    if (SKIP_FILES.has(path.basename(file))) continue;
    const text = readText(file);
    if (text === null) continue;
    const { text: next, count } = replaceTokens(text, d);
    if (count === 0) continue;
    fs.writeFileSync(file, next);
    applied.push({ rel: path.relative(ROOT, file), count });
    totalReplacements += count;
  }

  // 7. Конфиги.
  const jsonEdits = [
    updateJson("package.json", { name: d.slug }, d),
    updateJson("project.config.json", { projectName: d.slug, themeSlug: d.slug }, d),
    updateJson(path.join("frontend", "src", "data", "site.json"), { name: d.title }, d),
    updateDdevName(d),
  ].filter((e): e is FileEdit => e !== null);

  // 8. Артефакты.
  const removedArtifacts = removeArtifacts();

  // 9. Верификация: старых токенов не должно остаться нигде (в сканируемом дереве).
  const leftovers = scanTokenFiles(walk(ROOT), d);
  const leftoverDirs = findThemeDirs();
  if (leftovers.length > 0 || leftoverDirs.length > 0) {
    console.error("\nОШИБКА: после замены остались вхождения старого имени:");
    for (const e of leftovers) console.error(`  ${e.rel} (${e.count})`);
    for (const dir of leftoverDirs) console.error(`  ${path.relative(ROOT, dir)}/`);
    process.exit(1);
  }

  // 10. Отчёт.
  console.log("\nГотово.");
  console.log(`  Папок переименовано: ${renamed}`);
  console.log(`  Файлов с заменами:   ${applied.length} (${totalReplacements} вхождений)`);
  for (const e of applied) console.log(`    ${e.rel} — ${e.count}`);
  for (const e of jsonEdits) console.log(`    ${e.rel}`);
  if (removedArtifacts.length > 0) {
    console.log(`  Артефакты удалены: ${removedArtifacts.join(", ")}`);
  }
  console.log("\nДальше вручную:");
  console.log("  1. pnpm install — если клонировали репозиторий заново;");
  console.log("  2. ddev restart — .ddev/config.yaml уже переименован;");
  console.log("  3. pnpm build:wp — пересобрать тему под новым именем;");
  console.log("  4. Проверить README.md — брендинг бойлерплейта (boiler-vite) заменён не был;");
  console.log("  5. git-история осталась от бойлерплейта — при необходимости fresh-init сами.");
}

main().catch((err: unknown) => {
  console.error("ОШИБКА:", err);
  process.exit(1);
});
