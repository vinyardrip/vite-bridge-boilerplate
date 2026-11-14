/**
 * =================================================================================================
 * normalize — целевые ассерты по гарантиям (без снапшотов всего вывода:
 * любой апдейт svgo ломал бы их; здесь — только проверяемые инварианты).
 *
 *   Блок A — структурные гарантии (градиент, mask, SMIL);
 *   Блок B — синтез viewBox;
 *   Блок C — цвет (монохром → currentColor, градиент/многоцвет — нет);
 *   Блок D — идемпотентность + детерминизм (все фикстуры + 10 реальных
 *            иконок в fixtures/real — read-only копии, шаг миграции их
 *            не ломает).
 * =================================================================================================
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { normalize } from "../../src/svg/normalize.js";

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const fixture = (name) => readFileSync(path.join(fixturesDir, name), "utf8");

/** Корневой открывающий тег <svg ...> вывода. */
const rootTag = (svg) => /^<svg[^>]*>/.exec(svg)[0];

/** Все url(#ref) вывода резолвятся в существующие id. */
const assertUrlRefsResolve = (svg) => {
  for (const match of svg.matchAll(/url\(#([^)\s]+)\)/g)) {
    assert.ok(
      svg.includes(`id="${match[1]}"`),
      `url(#${match[1]}) не резолвится: нет id="${match[1]}"`,
    );
  }
};

describe("Блок A — структурные гарантии", () => {
  test("gradient.svg: url(#g1) и id сохранены, размеры корня сняты", () => {
    const { svg } = normalize(fixture("gradient.svg"));

    assert.ok(svg.includes('id="g1"'), "linearGradient id=g1 присутствует");
    assert.ok(svg.includes('fill="url(#g1)"'), "fill=url(#g1) присутствует");
    assertUrlRefsResolve(svg);

    const tag = rootTag(svg);
    assert.ok(!/\swidth=/.test(tag), "width на корне отсутствует");
    assert.ok(!/\sheight=/.test(tag), "height на корне отсутствует");
    assert.ok(/\sviewBox=/.test(tag), "viewBox присутствует");
    assert.ok(!svg.includes("currentColor"), "градиент не перекрашивается");
  });

  test("mask.svg: <mask> и mask=url(#m1) на <g> сохранены, <g> не схлопнут", () => {
    const { svg } = normalize(fixture("mask.svg"));

    assert.ok(svg.includes('id="m1"'), "<mask id=m1> присутствует");
    assert.ok(svg.includes('mask="url(#m1)"'), "mask=url(#m1) присутствует");
    assert.ok(/<g[\s>]/.test(svg), "<g> не схлопнут");
    assertUrlRefsResolve(svg);
  });

  test("smil.svg: <animate> и его атрибуты не удалены", () => {
    const { svg } = normalize(fixture("smil.svg"));

    assert.ok(/<animate[\s>]/.test(svg), "<animate> присутствует");
    assert.ok(svg.includes('attributeName="r"'), "attributeName сохранен");
    assert.ok(svg.includes('dur="1s"'), "dur сохранен");
    assert.ok(svg.includes('repeatCount="indefinite"'), "repeatCount сохранен");
  });
});

describe("Блок B — синтез viewBox", () => {
  test("no-viewbox-with-size.svg: viewBox из width/height, размеры сняты", () => {
    const { svg } = normalize(fixture("no-viewbox-with-size.svg"));

    assert.ok(svg.includes('viewBox="0 0 24 24"'), "viewBox синтезирован (24px парсится)");
    const tag = rootTag(svg);
    assert.ok(!/\swidth=/.test(tag), "width на корне отсутствует");
    assert.ok(!/\sheight=/.test(tag), "height на корне отсутствует");
  });

  test("no-viewbox-no-size.svg: throw [svg:normalize]", () => {
    assert.throws(
      () => normalize(fixture("no-viewbox-no-size.svg")),
      (error) =>
        error instanceof Error &&
        error.message.includes("[svg:normalize]") &&
        error.message.includes("viewBox"),
    );
  });
});

describe("Блок C — цвет", () => {
  test("one-color.svg: единственный цвет → currentColor, исходный hex отсутствует", () => {
    const { svg } = normalize(fixture("one-color.svg"));

    assert.equal((svg.match(/fill="currentColor"/g) ?? []).length, 2);
    assert.ok(!svg.includes("#000"), "исходный цвет отсутствует в теле");
  });

  test("multicolor.svg: два цвета — оба сохранены, без currentColor", () => {
    const { svg } = normalize(fixture("multicolor.svg"));

    assert.ok(svg.includes("#e5261f") && svg.includes("#1f7ae5"), "оба цвета сохранены");
    assert.ok(!svg.includes("currentColor"), "currentColor не появился");
  });

  test("stroke-only.svg: stroke → currentColor, fill=none сохранен", () => {
    const { svg } = normalize(fixture("stroke-only.svg"));

    assert.ok(svg.includes('stroke="currentColor"'), "stroke заменен на currentColor");
    assert.ok(svg.includes('fill="none"'), 'fill="none" сохранен');
  });
});

describe("Блок D — идемпотентность и детерминизм", () => {
  const skip = new Set(["no-viewbox-no-size.svg"]); // падает по контракту
  const fixedFiles = readdirSync(fixturesDir).filter(
    (name) => name.endsWith(".svg") && !skip.has(name),
  );
  const realFiles = readdirSync(path.join(fixturesDir, "real")).filter((name) =>
    name.endsWith(".svg"),
  );

  test("набор файлов не пуст", () => {
    assert.equal(realFiles.length, 10, "10 реальных иконок в fixtures/real");
  });

  for (const name of fixedFiles) {
    test(`фикстура ${name}`, () => {
      const source = fixture(name);
      const once = normalize(source).svg;

      assert.equal(normalize(once).svg, once, "идемпотентность");
      assert.equal(normalize(source).svg, once, "детерминизм");
    });
  }

  for (const name of realFiles) {
    test(`real/${name}`, () => {
      const source = readFileSync(path.join(fixturesDir, "real", name), "utf8");
      const once = normalize(source).svg;

      assert.equal(normalize(once).svg, once, "идемпотентность");
      assert.equal(normalize(source).svg, once, "детерминизм");
    });
  }
});

describe("meta — title/desc (контракт extract-meta: любой глубины, meta = первый)", () => {
  test("meta.svg: корневые title/desc в meta, в теле не осталось ни одного", () => {
    const { svg, meta } = normalize(fixture("meta.svg"));

    assert.equal(meta.title, "Профиль пользователя");
    assert.equal(meta.desc, "Стилизованный силуэт человека");

    // B2: вырезаются ВСЕ title/desc (вложенный в <g> тоже) — иначе на втором
    // прогоне «второй» стал бы первым и ушел бы в meta (идемпотентность).
    assert.ok(!svg.includes("Профиль пользователя"), "корневой title вынут");
    assert.ok(!svg.includes("Стилизованный силуэт"), "корневой desc вынут");
    assert.ok(!svg.includes("Вложенный слой"), "вложенный <title> вырезан тоже");
    assert.ok(!/<title[\s>]/.test(svg), "в теле не осталось <title>");
    assert.ok(!/<desc[\s>]/.test(svg), "в теле не осталось <desc>");
  });

  test("one-color.svg: meta без ключей (не undefined-значения)", () => {
    const { meta } = normalize(fixture("one-color.svg"));
    assert.ok(!("title" in meta) && !("desc" in meta));
  });
});

describe("meta B2 — вложенные title/desc на любой глубине", () => {
  test("Figma-кейс: <title> внутри <g> попадает в meta", () => {
    const nestedOnly =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><g><title>Из группы</title><path d="M0 0h8v8H0z"/></g></svg>';
    const { svg, meta } = normalize(nestedOnly);

    assert.equal(meta.title, "Из группы");
    assert.ok(!svg.includes("Из группы"), "вложенный title вырезан");
    assert.ok(svg.includes("<g>"), "обертка <g> не пострадала");
    assert.ok(svg.includes('<path d="M0 0h8v8H0z"/>'), "содержимое <g> сохранено");
  });

  test("desc на второй вложенности тоже находится", () => {
    const deep =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><g><g><desc>глубоко</desc></g><path d="M0 0h8v8H0z"/></g></svg>';
    const { svg, meta } = normalize(deep);

    assert.equal(meta.desc, "глубоко");
    assert.ok(!svg.includes("глубоко"), "вложенный desc вырезан");
    assert.ok(svg.includes('<path d="M0 0h8v8H0z"/>'), "содержимое сохранено");
  });

  test("второй title вырезается, meta держит первый, нормализация идемпотентна", () => {
    const two =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><g><title>first</title></g><g><title>second</title></g></svg>';
    const once = normalize(two).svg;

    assert.ok(!once.includes("first"), "первый title ушел в meta");
    assert.ok(!once.includes("second"), "второй title вырезан тоже");
    assert.ok(!/<title[\s>]/.test(once), "title в теле нет");
    assert.equal(normalize(once).svg, once, "идемпотентность");
  });
});

describe("style-фикстура — @media каскад (долг шага 1)", () => {
  test("style-media.svg: @media выживает, инлайненные правила уходят в style-атрибуты", () => {
    const { svg } = normalize(fixture("style-media.svg"));

    assert.ok(svg.includes("@media"), "медиа-блок сохранен");
    assert.match(
      svg,
      /@media[^{]*\{[^{]*\.icon-accent\{opacity:/,
      "каскад внутри @media цел (селектор + декларация)",
    );
    assert.ok(svg.includes('style="fill:#f00"'), "совпавшее правило ушло в style-атрибут (hex не переименован)");
    assert.ok(!svg.includes(".icon-main{"), "инлайненное правило вырезано из <style>");
  });

  test("style-media.svg: normalize идемпотентен на каскаде", () => {
    const once = normalize(fixture("style-media.svg")).svg;
    assert.equal(normalize(once).svg, once, "второй прогон не меняет вывод");
  });
});
