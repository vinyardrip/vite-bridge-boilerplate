/**
 * =================================================================================================
 * classify — целевые ассерты классификации kind/mode (без снапшотов:
 * детерминизм проверяется сравнением двух вызовов на том же входе).
 *
 *   Блок A — classifyOne: 14 фикстур fixtures/classify (kind + reason);
 *            фикстуры — валидный XML в формате «после normalize» (без
 *            пролога/width/height), поэтому classifyOne применяется напрямую;
 *   Блок B — assignModes: пороги inline-vs-sprite (границы включительно,
 *            превышение каждого условия по отдельности, кастомные thresholds,
 *            фиксированные mode не-иконок);
 *   Блок C — реальные иконки fixtures/real: normalize → classifyOne — все
 *            icon, классификация детерминирована, реальные веса дают inline;
 *   Блок D — style-фикстура style-media.svg (долг шага 1): <style> с @media
 *            не ломает классификацию ни в raw, ни после normalize.
 * =================================================================================================
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { AssignItem, ClassifyResult } from "../../src/types.ts";
import { classifyOne, assignModes } from "../../src/svg/classify.ts";
import { normalize } from "../../src/svg/normalize.ts";

const classifyDir = fileURLToPath(new URL("./fixtures/classify/", import.meta.url));
const realDir = fileURLToPath(new URL("./fixtures/real/", import.meta.url));
const readFixture = (dir: string, name: string): string => readFileSync(path.join(dir, name), "utf8");

describe("Блок A — classifyOne: фикстуры fixtures/classify", () => {
  // [файл, ожидаемый kind, ожидаемый reason] — дерево решений из ТЗ.
  const cases = [
    ["icon-simple.svg", "icon", "0 colors + small/standard viewBox"],
    ["icon-currentcolor.svg", "icon", "currentColor"],
    ["icon-stroke-only.svg", "icon", "1 colors + small/standard viewBox"],
    ["icon-two-colors.svg", "icon", "2 colors + small/standard viewBox"],
    ["animated-smil.svg", "animated", "SMIL"],
    ["animated-keyframes.svg", "animated", "keyframes"],
    ["animated-script.svg", "animated", "script"],
    ["sprite-single.svg", "sprite", "contains <symbol>"],
    ["sprite-multi.svg", "sprite", "contains <symbol>"],
    ["illustration-gradient.svg", "illustration", "contains url(#...)"],
    ["illustration-mask.svg", "illustration", "contains url(#...)"],
    ["illustration-image.svg", "illustration", "contains <image>"],
    ["illustration-multicolor.svg", "illustration", "3 colors"],
  ];

  test("набор фикстур полон", () => {
    const files = readdirSync(classifyDir).filter((name) => name.endsWith(".svg"));
    assert.equal(files.length, cases.length + 1, "13 решающих + unknown-broken");
  });

  for (const [name, kind, reason] of cases) {
    test(`${name} → ${kind}`, () => {
      const result = classifyOne(readFixture(classifyDir, name));

      assert.equal(result.kind, kind);
      assert.equal(result.reason, reason);
    });
  }

  test("unknown-broken.svg → unknown (файл не парсится)", () => {
    const result = classifyOne(readFixture(classifyDir, "unknown-broken.svg"));

    assert.equal(result.kind, "unknown");
    assert.ok(result.reason.startsWith("parse error"), `reason: ${result.reason}`);
  });
});

describe("Блок B — assignModes: пороги inline-vs-sprite", () => {
  const icon = (index: number, size = 100, gzipSize = 50): AssignItem => ({
    path: `icons/icon-${index}.svg`,
    kind: "icon",
    size,
    gzipSize,
  });

  test("5 легких иконок → inline", () => {
    const items = [0, 1, 2, 3, 4].map((i) => icon(i));
    const result = assignModes(items);

    assert.ok(result.every((r) => r.mode === "inline"), JSON.stringify(result.map((r) => r.reason)));
  });

  test("30 иконок → sprite (count 30 > 15)", () => {
    const items = Array.from({ length: 30 }, (_, i) => icon(i));
    const result = assignModes(items);

    assert.ok(result.every((r) => r.mode === "sprite"));
    assert.ok(result.every((r) => r.reason.includes("exceeds")));
  });

  test("3 тяжелые иконки → sprite (только raw: 36KB > 30KB, gzip 12KB ≤ 15KB)", () => {
    // Превышен РОВНО один порог — проверка конъюнкции «все три условия».
    const items = [icon(1, 12 * 1024, 4 * 1024), icon(2, 12 * 1024, 4 * 1024), icon(3, 12 * 1024, 4 * 1024)];
    const result = assignModes(items);

    assert.ok(result.every((r) => r.mode === "sprite"));
  });

  test("граница порога включительно → inline (15 шт., 30KB raw, 15KB gzip)", () => {
    const items = Array.from({ length: 15 }, (_, i) => icon(i, 2 * 1024, 1024));
    const result = assignModes(items);

    assert.ok(result.every((r) => r.mode === "inline"));
  });

  test("на байт больше по gzip → sprite", () => {
    const items = Array.from({ length: 15 }, (_, i) => icon(i, 2 * 1024, 1024 + 1));
    const result = assignModes(items);

    assert.ok(result.every((r) => r.mode === "sprite"));
  });

  test("кастомные thresholds: count 2 → 3 иконки sprite; увеличенные лимиты → inline", () => {
    const items = [icon(1), icon(2), icon(3)];

    assert.ok(assignModes(items, { count: 2 }).every((r) => r.mode === "sprite"));
    assert.ok(
      assignModes(items, { count: 100, rawBytes: 1024 ** 3, gzipBytes: 1024 ** 3 }).every(
        (r) => r.mode === "inline",
      ),
    );
  });

  test("агрегат только по иконкам: тяжелая illustration не роняет inline иконок", () => {
    const items = [
      icon(1),
      icon(2),
      { path: "images/photo.svg", kind: "illustration", size: 10 * 1024 * 1024, gzipSize: 5 * 1024 * 1024 } satisfies AssignItem,
    ];
    const result = assignModes(items);

    assert.deepEqual(
      result.map((r) => r.mode),
      ["inline", "inline", "img"],
    );
  });

  test("не-иконки получают фиксированные mode", () => {
    const items = [
      { path: "a.svg", kind: "animated", size: 1, gzipSize: 1 } satisfies AssignItem,
      { path: "b.svg", kind: "sprite", size: 1, gzipSize: 1 } satisfies AssignItem,
      { path: "c.svg", kind: "illustration", size: 1, gzipSize: 1 } satisfies AssignItem,
      { path: "d.svg", kind: "unknown", size: 1, gzipSize: 1 } satisfies AssignItem,
    ];
    const result = assignModes(items);

    assert.deepEqual(
      result.map((r) => r.mode),
      ["inline", "sprite", "img", "error"],
    );
  });

  test("path и kind передаются насквозь; пустой список → пустой результат", () => {
    const items = [icon(7), { path: "x.svg", kind: "animated", size: 1, gzipSize: 1 } satisfies AssignItem];
    const result = assignModes(items);

    assert.deepEqual(result.map((r) => r.path), ["icons/icon-7.svg", "x.svg"]);
    assert.deepEqual(result.map((r) => r.kind), ["icon", "animated"]);
    assert.deepEqual(assignModes([]), []);
  });
});

describe("Блок C — реальные иконки fixtures/real через normalize", () => {
  const realFiles = readdirSync(realDir).filter((name) => name.endsWith(".svg"));

  test("10 реальных иконок", () => {
    assert.equal(realFiles.length, 10);
  });

  for (const name of realFiles) {
    test(`real/${name} → icon, детерминизм`, () => {
      const source = readFixture(realDir, name);
      const { svg } = normalize(source);

      const first = classifyOne(svg);
      const second = classifyOne(svg);

      assert.equal(first.kind, "icon", `reason: ${first.reason}`);
      assert.deepEqual(second, first, "два вызова на одном входе — один результат");

      // Связка с шагом 1: повторная нормализация не меняет классификацию.
      const afterReNormalize = classifyOne(normalize(svg).svg);
      assert.equal(afterReNormalize.kind, "icon");
      assert.deepEqual(afterReNormalize, first);
    });
  }

  test("реальные веса 10 иконок → assignModes inline (raw и gzip)", () => {
    const items: AssignItem[] = realFiles.map((name) => {
      const { svg } = normalize(readFixture(realDir, name));
      return {
        path: `icons/${name}`,
        kind: classifyOne(svg).kind,
        size: Buffer.byteLength(svg, "utf8"),
        gzipSize: gzipSync(Buffer.from(svg, "utf8")).length,
      };
    });

    assert.ok(items.every((item) => item.kind === "icon"));
    const result = assignModes(items);
    assert.ok(
      result.every((r) => r.mode === "inline"),
      JSON.stringify(result.map((r) => `${r.path}: ${r.reason}`)),
    );
  });
});

describe("Блок D — style-фикстура style-media.svg (@media)", () => {
  const styleMediaDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
  const source = readFileSync(path.join(styleMediaDir, "style-media.svg"), "utf8");

  test("raw: цветов в атрибутах нет, но маленький viewBox → icon", () => {
    const { kind, reason } = classifyOne(source);
    assert.equal(kind, "icon");
    assert.match(reason, /viewBox/);
  });

  test("после normalize: @media выживает, классификация остаётся icon", () => {
    const { svg } = normalize(source);
    assert.ok(svg.includes("@media"), "медиа-блок не выброшен нормализацией");
    const { kind } = classifyOne(svg);
    assert.equal(kind, "icon");
  });
});
