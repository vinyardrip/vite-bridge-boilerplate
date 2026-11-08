#!/usr/bin/env node
/*!
 * =================================================================================================
 * check-node.js
 * =================================================================================================
 *
 * Fail-fast проверка версии Node.js перед установкой зависимостей
 * (подключена в package.json как preinstall — срабатывает на каждый `pnpm install`).
 *
 * ЗАЧЕМ: нативные модули проекта (sharp и т.п.) распространяются с пребилдами
 * под актуальные LTS-линии Node. На «свежих» не-LTS версиях (например, v24)
 * пребилдов нет — установка падает в компиляцию через node-gyp и роняет
 * `pnpm install`. Ловим это ДО установки, а не после десятков секунд сборки.
 *
 * ВАЖНО: скрипт обязан работать на чистом клоне, когда node_modules еще нет,
 * поэтому НЕЛЬЗЯ импортировать зависимости (chalk и т.д.) — только stdlib
 * и ANSI-коды для красного баннера.
 *
 * Разрешенные версии: действующие LTS-линии Node (см. LTS_MAJOR ниже).
 * Когда LTS меняется — обновить список и текст в README «Требования».
 *
 * =================================================================================================
 */

// Действующие LTS-линии (2026-11): v20 (maintenance), v22 (active).
const LTS_MAJOR = [20, 22];
// Версия, которую рекомендуем и ставим через mise (см. README «Требования»).
const RECOMMENDED = "node@22";

const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const YELLOW = "\x1b[33m";

/*! --- Разбор версии: process.version → "v22.23.4" → 22 --- */
const match = /^v?(\d+)/.exec(process.version || "");
const major = match ? Number.parseInt(match[1], 10) : Number.NaN;

if (Number.isInteger(major) && LTS_MAJOR.includes(major)) {
  // Все хорошо — молча выходим, в preinstall лишний шум не нужен.
  process.exit(0);
}

/*! --- Огромный красный баннер --- */
const line = `${RED}${BOLD}${"━".repeat(72)}${RESET}`;
const text = (s) => `${RED}${BOLD}${s}${RESET}`;
const dim = (s) => `${RED}${s}${RESET}`;

console.error(line);
console.error(text("  ⛔  ТРЕБУЕТСЯ NODE.JS LTS — УСТАНОВКА ЗАВИСИМОСТЕЙ ОСТАНОВЛЕНА"));
console.error(line);
console.error(
  dim(
    `  Найден Node ${process.version || "(неизвестная версия)"}, а проект работает` +
      ` только на LTS-линиях: v${LTS_MAJOR.join(" и v")}.`,
  ),
);
console.error("");
console.error(
  text("  ПОЧЕМУ:") +
    dim(" нативные модули (sharp и др.) не имеют пребилдов под не-LTS"),
);
console.error(
  dim(
    "  версии Node (например, v24) — `pnpm install` падает в компиляцию",
  ),
);
console.error(dim("  через node-gyp с ошибками сборки нативных addon'ов."));
console.error("");
console.error(text("  КАК ИСПРАВИТЬ (mise):"));
console.error(`  ${YELLOW}  mise use ${RECOMMENDED}${RESET}`);
console.error(dim("  затем повторите установку:"));
console.error(`  ${YELLOW}  pnpm install${RESET}`);
console.error("");
console.error(
  dim(
    `  Без mise: поставьте Node LTS v${LTS_MAJOR[LTS_MAJOR.length - 1]} любым` +
      " менеджером версий",
  ),
);
console.error(dim("  и убедитесь, что `node --version` показывает v20 или v22."));
console.error(line);

process.exit(1);
