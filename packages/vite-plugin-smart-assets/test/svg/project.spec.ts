/**
 * =================================================================================================
 * project — проекция записи манифеста SVG в HTML (вход — формат шага 6:
 * { source, file, kind, mode, symbol, hash }; модуль чистый, файлы не нужны).
 *
 *   Блок A — inline: атрибуты корневого <svg>, class сливается, a11y-дефолты;
 *   Блок B — sprite: <svg><use href="file#symbol">, href без ведущего слеша;
 *   Блок C — img: src/loading/alt/width/height/class, экранирование alt;
 *   Блок D — error: "" + console.warn;
 *   Блок E — options-passthrough и ошибки (fail-fast).
 * =================================================================================================
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { AssetOptions, SvgEntry } from "../../src/types.ts";
import { projectSvg } from "../../src/svg/project.ts";

const svgEntry: SvgEntry = {
  source: "raw/icons/user.svg",
  file: "assets/icons/sprite.abc.svg",
  kind: "icon",
  mode: "sprite",
  hash: "abc12345",
  symbol: "user",
};
const INLINE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';

describe("Блок A — inline", () => {
  const out = projectSvg(
    { ...svgEntry, mode: "inline" },
    { class: "icon icon-user" },
    INLINE_SVG,
  );

  test("class/aria-hidden/focusable добавлены в корневой <svg>", () => {
    assert.ok(out.includes('class="icon icon-user"'), out);
    assert.ok(out.includes('aria-hidden="true"'), out);
    assert.ok(out.includes('focusable="false"'), out);
  });

  test("viewBox и внутренности не тронуты, мусора нет", () => {
    assert.ok(out.includes('viewBox="0 0 24 24"'), out);
    assert.ok(out.includes('<path d="M4 4h16v16H4z"/>'), out);
    assert.ok(!out.includes("<?xml"), "без пролога");
    assert.ok(!out.toLowerCase().includes("doctype"), "без DOCTYPE");
    assert.ok(!out.includes("<!--"), "без комментариев");
  });

  test("aria-label заменяет aria-hidden (и сам попадает в разметку)", () => {
    const labeled = projectSvg(
      { ...svgEntry, mode: "inline" },
      { "aria-label": "Открыть меню" },
      INLINE_SVG,
    );
    assert.ok(!labeled.includes("aria-hidden"), labeled);
    assert.ok(labeled.includes('aria-label="Открыть меню"'), labeled);
    assert.ok(labeled.includes('focusable="false"'), labeled);
  });

  test("class корня и options.class сливаются", () => {
    const merged = projectSvg(
      { ...svgEntry, mode: "inline" },
      { class: "bar" },
      '<svg class="foo" viewBox="0 0 8 8"><path d="M0 0h8v8H0z"/></svg>',
    );
    assert.ok(merged.includes('class="foo bar"'), merged);
  });

  test("без inlineContent / с битым XML — fail-fast", () => {
    assert.throws(
      () => projectSvg({ ...svgEntry, mode: "inline" }, {}, null),
      /svg:project/,
    );
    assert.throws(
      () => projectSvg({ ...svgEntry, mode: "inline" }, {}, "<svg><unclosed>"),
      /svg:project/,
    );
  });
});

describe("Блок B — sprite", () => {
  test("базовая обертка: <svg aria-hidden focusable><use href=\"file#symbol\"></use></svg>", () => {
    const out = projectSvg(svgEntry);
    assert.equal(
      out,
      '<svg aria-hidden="true" focusable="false"><use href="assets/icons/sprite.abc.svg#user"></use></svg>',
    );
  });

  test("class и лишние options попадают в <svg>, href без ведущего слеша", () => {
    const out = projectSvg(
      { ...svgEntry, file: "/assets/icons/sprite.abc.svg" },
      { class: "icon", "data-test": "user-icon" },
    );
    assert.ok(out.startsWith('<svg class="icon"'), out);
    assert.ok(out.includes('data-test="user-icon"'), out);
    assert.ok(out.includes('href="assets/icons/sprite.abc.svg#user"'), out);
    assert.ok(!out.includes('href="/'), "ведущий слеш в href запрещен");
  });

  test("aria-label убирает aria-hidden у спрайта", () => {
    const out = projectSvg(svgEntry, { "aria-label": "Корзина" });
    assert.ok(!out.includes("aria-hidden"), out);
    assert.ok(out.includes('aria-label="Корзина"'), out);
  });

  test("нет symbol/file в записи — fail-fast", () => {
    assert.throws(() => projectSvg({ ...svgEntry, symbol: undefined }), /svg:project/);
    assert.throws(() => projectSvg({ ...svgEntry, file: null }), /svg:project/);
  });
});

describe("Блок C — img", () => {
  const imgEntry: SvgEntry = {
    source: "raw/img/hero.svg",
    file: "assets/img/hero.deadbeef.svg",
    kind: "illustration",
    mode: "img",
    hash: "deadbeef",
  };

  test("src/loading/alt/width/height/class в порядке ТЗ", () => {
    const out = projectSvg(imgEntry, {
      alt: "test",
      width: 160,
      height: 160,
      class: "ill",
    });
    assert.equal(
      out,
      '<img src="assets/img/hero.deadbeef.svg" loading="lazy" alt="test" width="160" height="160" class="ill">',
    );
  });

  test("без options: alt пустой, width/height/class не добавляются", () => {
    const out = projectSvg(imgEntry);
    assert.equal(out, '<img src="assets/img/hero.deadbeef.svg" loading="lazy" alt="">');
    assert.ok(!out.includes("width="), out);
    assert.ok(!out.includes("class="), out);
  });

  test("loading переопределяется options", () => {
    const out = projectSvg(imgEntry, { alt: "", loading: "eager" });
    assert.ok(out.includes('loading="eager"'), out);
  });

  test("alt экранируется (кавычки, <, &, >)", () => {
    const out = projectSvg(imgEntry, { alt: `<b> & "x"` });
    assert.ok(out.includes('alt="&lt;b&gt; &amp; &quot;x&quot;"'), out);
    assert.ok(!out.includes('alt="<'), out);
  });

  test("ведущий слеш в file срезается", () => {
    const out = projectSvg({ ...imgEntry, file: "/assets/img/hero.deadbeef.svg" }, { alt: "" });
    assert.ok(out.startsWith('<img src="assets/img/'), out);
  });
});

describe("Блок D — error", () => {
  test("возвращает пустую строку и предупреждает в console.warn", () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message: unknown) => warnings.push(String(message));
    try {
      const out = projectSvg({
        source: "raw/icons/junk.svg",
        file: null,
        kind: "unknown",
        mode: "error",
      });
      assert.equal(out, "");
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1, warnings.join("\n"));
    assert.ok(warnings[0]!.includes("raw/icons/junk.svg"), warnings[0]);
    assert.ok(warnings[0]!.includes("error"), warnings[0]);
  });
});

describe("Блок E — options-passthrough и ошибки", () => {
  test("data-* и style идут в inline-корень через AST (экранируются сериализацией)", () => {
    const out = projectSvg(
      { ...svgEntry, mode: "inline" },
      { "data-test": 'a"b', style: "color:currentColor" },
      INLINE_SVG,
    );
    assert.ok(out.includes('data-test="a&quot;b"'), out);
    assert.ok(out.includes('style="color:currentColor"'), out);
  });

  test("булев атрибут true — голый, false/undefined — пропущен", () => {
    const out = projectSvg(svgEntry, { hidden: true, "data-empty": false, "data-no": undefined });
    assert.ok(out.includes(" hidden"), out);
    assert.ok(!out.includes("data-empty"), out);
    assert.ok(!out.includes("data-no"), out);
  });

  test("неизвестный mode — fail-fast [svg:project]", () => {
    assert.throws(
      () => projectSvg({ ...svgEntry, mode: "banana" } as unknown as SvgEntry),
      /svg:project/,
    );
  });
});
