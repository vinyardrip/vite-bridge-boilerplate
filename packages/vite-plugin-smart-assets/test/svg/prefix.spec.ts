/**
 * =================================================================================================
 * prefix — универсальная префиксация (код перенесен из build-sprite шага 5,
 * здесь свои целевые ассерты для standalone-API prefixSvg(svg, prefix)).
 *
 *   Блок A — id и ссылки (id, url(#), href/xlink:href, инлайн-стили, mask);
 *   Блок B — классы и стили (селекторы, @keyframes, animation-ссылки,
 *            hex-цвета и числа в значениях не трогаются);
 *   Блок C — детерминизм и ошибки (fail-fast).
 * =================================================================================================
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { prefixSvg } from "../../src/svg/prefix.ts";

const svg = (attrs: string, body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const xSvg = (attrs: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`;

describe("Блок A — id и ссылки", () => {
  test('id="a" + url(#a) → user-a', () => {
    const out = prefixSvg(
      svg('viewBox="0 0 24 24"', '<defs><linearGradient id="a"/></defs><path fill="url(#a)" d="M0 0"/>'),
      "user",
    );

    assert.ok(out.includes('id="user-a"'), out);
    assert.ok(out.includes('fill="url(#user-a)"'), out);
    assert.ok(!out.includes('id="a"') && !out.includes("url(#a)"), "сырых ссылок нет");
  });

  test('href="#a" и xlink:href="#a" → #user-a', () => {
    const out = prefixSvg(
      xSvg('viewBox="0 0 8 8"', '<path id="a" d="M0 0"/><use href="#a"/><use xlink:href="#a"/>'),
      "user",
    );

    assert.ok(out.includes('id="user-a"'), out);
    assert.ok(out.includes('href="#user-a"'), out);
    assert.ok(out.includes('xlink:href="#user-a"'), out);
    assert.ok(!out.includes('href="#a"'), "сырой href отсутствует");
  });

  test("url(#) в инлайн-стиле и mask-атрибуте тоже префиксуется", () => {
    const out = prefixSvg(
      svg(
        'viewBox="0 0 24 24"',
        '<mask id="m1"><rect width="24" height="24" fill="#fff"/></mask><g mask="url(#m1)"><path style="fill:url(#g2)" d="M0 0"/></g><defs><linearGradient id="g2"/></defs>',
      ),
      "icon",
    );

    assert.ok(out.includes('id="icon-m1"') && out.includes('mask="url(#icon-m1)"'), "mask");
    assert.ok(out.includes("fill:url(#icon-g2)"), "инлайн-стиль");
    assert.ok(!out.includes("url(#m1)") && !out.includes("url(#g2)"), "сырых ссылок нет");
  });
});

describe("Блок B — классы и стили", () => {
  const animated = svg(
    'viewBox="0 0 24 24"',
    `<style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.cls-1{animation:spin 1s linear infinite}</style><path class="cls-1" d="M4 4h16v16H4z"/>`,
  );

  test("@keyframes, селекторы, class-атрибуты и animation-ссылки префиксованы", () => {
    const out = prefixSvg(animated, "user");

    assert.ok(out.includes("@keyframes user-spin{"), out);
    assert.ok(out.includes(".user-cls-1{"), out);
    assert.ok(out.includes('class="user-cls-1"'), out);
    assert.ok(out.includes("animation:user-spin 1s"), out);
    assert.ok(!/(^|[^-\w])\.cls-1{/.test(out), "сырой селектор отсутствует");
    assert.ok(!/@keyframes spin{/.test(out), "сырые keyframes отсутствуют");
  });

  test("ссылка на чужой @keyframes (без своего) не переименовывается", () => {
    const out = prefixSvg(
      svg('viewBox="0 0 8 8"', '<style>.s{animation:pulse 2s}</style><rect class="s"/>'),
      "user",
    );

    assert.ok(out.includes("animation:pulse 2s"), out);
    assert.ok(!out.includes("animation:user-pulse"), out);
  });

  test("id-селектор в <style> следует за переименованием id", () => {
    const out = prefixSvg(
      svg('viewBox="0 0 8 8"', '<style>#dot{fill:#f00}</style><circle id="dot" r="4"/>'),
      "user",
    );

    assert.ok(out.includes('id="user-dot"'), out);
    assert.ok(out.includes("#user-dot{fill:#f00}"), out);
    assert.ok(!/(^|[^-\w])#dot{/.test(out), "сырой селектор отсутствует");
  });

  test("несколько классов в одном атрибуте — каждый префиксуется", () => {
    const out = prefixSvg(svg('viewBox="0 0 8 8"', '<g class="a b"><path class="a"/></g>'), "i");

    assert.ok(out.includes('class="i-a i-b"'), out);
    assert.ok(out.includes('class="i-a"'), out);
    assert.ok(!out.includes('class="a"') && !out.includes('class="b"'), "сырых классов нет");
  });

  test("hex-цвета и числа в значениях деклараций не трогаются", () => {
    const out = prefixSvg(
      svg('viewBox="0 0 8 8"', '<style>.s{fill:#fff;stroke-width:.5px}</style><path class="s" stroke="#abc"/>'),
      "user",
    );

    assert.ok(out.includes("fill:#fff;stroke-width:.5px"), out);
    assert.ok(out.includes('stroke="#abc"'), out);
  });

  test("пустой <style> и отсутствие идентификаторов — проход насквозь", () => {
    const out = prefixSvg(svg('viewBox="0 0 8 8"', "<style></style><path d=\"M0 0h8v8H0z\"/>"), "user");
    assert.ok(out.includes("<path d=\"M0 0h8v8H0z\"/>"), out);
    assert.ok(out.includes("<style"), out);
    assert.ok(!out.includes("user-"), "префиксов без идентификаторов нет");
  });
});

describe("Блок C — детерминизм и ошибки", () => {
  test("два вызова на одном входе — байт-идентичный вывод", () => {
    const content = svg('viewBox="0 0 8 8"', '<defs><linearGradient id="a"/></defs><path fill="url(#a)"/>');
    assert.equal(prefixSvg(content, "user"), prefixSvg(content, "user"));
  });

  test("невалидный prefix → throw [svg:prefix]", () => {
    assert.throws(() => prefixSvg(svg('viewBox="0 0 8 8"', ""), "9bad"), /svg:prefix/);
    assert.throws(() => prefixSvg(svg('viewBox="0 0 8 8"', ""), "a b"), /svg:prefix/);
    assert.throws(() => prefixSvg(svg('viewBox="0 0 8 8"', ""), ""), /svg:prefix/);
  });

  test("битый XML → throw [svg:prefix]", () => {
    assert.throws(() => prefixSvg("<svg viewBox=", "user"), /svg:prefix/);
  });

  test("без корневого <svg> → throw [svg:prefix]", () => {
    assert.throws(() => prefixSvg("<div><circle/></div>", "user"), /svg:prefix/);
  });
});
