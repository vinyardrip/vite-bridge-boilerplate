/**
 * =================================================================================================
 * njk-macros — интеграция Nunjucks-макросов ui.icon/ui.picture с конвейером
 * (шаг интеграции шаблонов; реальный рендер тем же пакетом nunjucks, что и сборка).
 *
 *   Блок A — ui.icon на inline-иконке: {{ ui.icon('phone', 'demo-class') }} →
 *            нормализованный <svg> (currentColor, без <use>), class слит;
 *   Блок B — ui.icon на спрайтовой иконке: {{ ui.icon('demo-sprite') }} →
 *            <use href="assets/icons/sprite.<hash>.svg#demo-sprite">;
 *   Блок C — fail-fast: иконки нет в манифесте → throw "Icon not found";
 *   Блок D — ui.picture: проброс options в фильтр без экранирования;
 *   Блок E — санити autoescape: обычные строки экранируются, значит
 *            «сырость» макросов обеспечена именно SafeString фильтров.
 *
 * Фильтр smartSvg в спеке повторяет wiring из vite.config.js (поиск записи
 * по source → projectSvg → SafeString), но состояние собирает
 * processSvgBatch на tmpdir-фикстурах вместо живого состояния плагина.
 * Макрос рендерится из НАСТОЯЩЕГО файла frontend/src/views/macros/_ui.njk —
 * правка макроса, разошедшаяся с фильтром, упадет здесь же.
 * =================================================================================================
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import nunjucks from "nunjucks";
import type { AssetOptions, SvgManifestFragment } from "../../src/types.ts";
import { processSvgBatch } from "../../src/svg/pipeline.ts";
import { projectSvg } from "../../src/svg/project.ts";

const rawDir = "frontend/raw";

const FIXTURES = {
  // Контурная иконка с одним цветом: конвейер конвертирует #000 → currentColor.
  "phone.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 61 61"><path fill="none" stroke="#000" stroke-width="2" d="M4 4h16v16H4z"/></svg>',
  // kind-sprite: контейнер с <symbol> → общий спрайт, symbol = имя файла.
  "demo-sprite.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><symbol id="mark" viewBox="0 0 8 8"><path fill="currentColor" d="M0 0h8v8H0z"/></symbol></svg>',
};

/** Путь до НАСТОЯЩЕГО файла макросов: тест лежит в packages/…/test/svg/. */
const macroDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../frontend/src/views/macros",
);

let tmp = "";
let originalCwd = "";
let manifest: SvgManifestFragment | null = null;
let inlineByFile = new Map<string, string>();
let env: nunjucks.Environment | null = null;

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "svg-njk-macros-"));
  await fs.mkdir(path.join(tmp, rawDir), { recursive: true });
  for (const [name, content] of Object.entries(FIXTURES)) {
    await fs.writeFile(path.join(tmp, rawDir, name), content, "utf8");
  }
  originalCwd = process.cwd();
  process.chdir(tmp);

  const { outputs, manifest: svgManifest } = await processSvgBatch(
    Object.keys(FIXTURES).map((name) => path.resolve(rawDir, name)),
    { rawDir },
  );
  manifest = svgManifest;
  inlineByFile = new Map(outputs.map(({ fileName, content }) => [fileName, content]));

  // Аналог vite.config.js: env с autoescape: true (как у njk-frontmatter) +
  // фильтры, отдающие SafeString той же копии nunjucks.
  env = nunjucks.configure([macroDir], { autoescape: true, noCache: true });
  env.addFilter("smartSvg", (name: string, options: AssetOptions | null, className?: string) => {
    const entry = manifest!.entries.find(
      (candidate) => candidate.source === `${rawDir}/${name}.svg`,
    );
    if (!entry) {
      throw new Error(
        `Icon not found: ${name} — нет ${rawDir}/${name}.svg`,
      );
    }
    const iconOptions = { ...(options ?? {}) };
    if (className && iconOptions.class === undefined) {
      iconOptions.class = className;
    }
    const inlineContent = inlineByFile.get(entry.file ?? "") ?? null;
    return new nunjucks.runtime.SafeString(projectSvg(entry, iconOptions, inlineContent));
  });
  env.addFilter(
    "smartPicture",
    (name: string, options?: { alt?: string }) =>
      new nunjucks.runtime.SafeString(
        `<picture><img src="assets/img/${name}.jpg" alt="${(options ?? {}).alt ?? ""}"></picture>`,
      ),
  );
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmp, { recursive: true, force: true });
});

const renderMacro = (expression: string) =>
  env!.renderString(`{% import "_ui.njk" as ui %}{{ ${expression} }}`, {});

describe("Блок A — ui.icon на inline-иконке", () => {
  test("{{ ui.icon('phone', 'demo-class') }} → <svg> с currentColor, без <use>", () => {
    const html = renderMacro("ui.icon('phone', 'demo-class')");
    assert.ok(html.includes("<svg"), html);
    assert.ok(html.includes('stroke="currentColor"'), html);
    assert.ok(!html.includes("<use"), html);
    assert.ok(html.includes('aria-hidden="true"'), html);
    assert.ok(html.includes('focusable="false"'), html);
    assert.ok(html.includes('viewBox="0 0 61 61"'), html);
  });

  test("className попадает в разметку, aria-label снимает скрытие", () => {
    const html = renderMacro("ui.icon('phone', 'demo-class')");
    assert.ok(html.includes('class="demo-class"'), html);
    const labeled = renderMacro("ui.icon('phone', 'demo-class', { 'aria-label': 'Телефон' })");
    assert.ok(labeled.includes('aria-label="Телефон"'), labeled);
    assert.ok(!labeled.includes('aria-hidden="true"'), labeled);
  });

  test("без className у корня нет class", () => {
    const html = renderMacro("ui.icon('phone')");
    assert.ok(!html.includes("class="), html);
  });
});

describe("Блок B — ui.icon на спрайтовой иконке", () => {
  test("{{ ui.icon('demo-sprite') }} → <use href=…sprite.<hash>.svg#demo-sprite>", () => {
    const html = renderMacro("ui.icon('demo-sprite')");
    assert.ok(html.includes("<svg"), html);
    const use = html.match(/<use href="([^"]+)"><\/use>/);
    assert.ok(use, html);
    assert.match(use[1], /^assets\/icons\/sprite\.[0-9a-f]{8}\.svg#demo-sprite$/);
  });

  test("className проходит на обертку <use>", () => {
    const html = renderMacro("ui.icon('demo-sprite', 'menu__icon')");
    assert.ok(html.includes('class="menu__icon"'), html);
  });
});

describe("Блок C — fail-fast на отсутствующей иконке", () => {
  test("ui.icon('nope') роняет рендер с именем иконки", () => {
    assert.throws(() => renderMacro("ui.icon('nope')"), /Icon not found: nope/);
  });
});

describe("Блок D — ui.picture пробрасывает options без экранирования", () => {
  test("{{ ui.picture('hero', { alt: 'Тест' }) }} → разметка фильтра целиком", () => {
    const html = renderMacro("ui.picture('hero', { alt: 'Тест' })");
    assert.ok(html.includes("<picture>"), html);
    assert.ok(html.includes('alt="Тест"'), html);
    assert.ok(!html.includes("&lt;"), html);
  });
});

describe("Блок E — санити autoescape", () => {
  test("обычная строка экранируется (SafeString — единственный путь к raw HTML)", () => {
    assert.ok(renderMacro("'<b>'").includes("&lt;b&gt;"));
  });
});
