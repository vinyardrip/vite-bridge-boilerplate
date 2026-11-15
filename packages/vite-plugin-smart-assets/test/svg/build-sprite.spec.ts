/**
 * =================================================================================================
 * build-sprite — целевые ассерты сборки спрайта (вход — нормализованный
 * формат: без пролога, viewBox гарантирован; строки иконок инлайн, спрайт —
 * билд-артефакт, фикстуры-файлы не нужны).
 *
 *   Блок A — безопасная обертка (ТЗ-формат корня, без display="none");
 *   Блок B — базовая сборка (symbol, viewBox, сортировка, xmlns);
 *   Блок C — коллизии ID (градиент в двух иконках);
 *   Блок D — утечка стилей (class/селекторы/@keyframes/animation-ссылки);
 *   Блок E — детерминизм (байт-равенство, независимость от порядка входа);
 *   Блок F — ошибки (fail-fast) и крайние случаи.
 * =================================================================================================
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildSprite } from "../../src/svg/build-sprite.ts";

const svg = (attrs: string, body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe("Блок A — безопасная обертка", () => {
  test("корень: width/height=0, position:absolute, aria-hidden, без display:none", () => {
    const out = buildSprite([{ name: "a", content: svg('viewBox="0 0 8 8"', "<circle r='4'/>") }]);

    assert.ok(
      out.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden" aria-hidden="true">',
      ),
      `корень: ${out.slice(0, 140)}`,
    );
    assert.ok(out.endsWith("</svg>"));
    assert.ok(!out.includes("display:none"), 'display="none" запрещен (старые Safari)');
  });

  test("пустой набор → пустой валидный спрайт", () => {
    const out = buildSprite([]);

    assert.ok(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="0"'));
    assert.ok(out.endsWith("></svg>"));
  });
});

describe("Блок B — базовая сборка", () => {
  const user = svg('viewBox="0 0 24 24"', '<path d="M4 4h16v16H4z"/>');
  const cart = svg('viewBox="0 0 32 32"', '<path d="M2 2h8v8H8z"/>');
  const out = buildSprite([
    { name: "user", content: user },
    { name: "cart", content: cart },
  ]);

  test("два symbol с id по имени иконки", () => {
    assert.ok(out.includes('<symbol id="user"'), out);
    assert.ok(out.includes('<symbol id="cart"'), out);
    assert.equal((out.match(/<symbol /g) ?? []).length, 2);
  });

  test("viewBox переносится с корня иконки, атрибуты <svg> отброшены", () => {
    assert.ok(out.includes('<symbol id="user" viewBox="0 0 24 24">'), "viewBox user");
    assert.ok(out.includes('<symbol id="cart" viewBox="0 0 32 32">'), "viewBox cart");
    assert.ok(!out.includes('xmlns="http://www.w3.org/2000/svg" viewBox'), "у symbol нет xmlns");
  });

  test("содержимое сохранено, символы отсортированы по id (cart < user)", () => {
    const cartAt = out.indexOf('<symbol id="cart"');
    const userAt = out.indexOf('<symbol id="user"');
    assert.ok(cartAt !== -1 && userAt !== -1 && cartAt < userAt, "алфавитный порядок");
    assert.ok(out.includes('d="M4 4h16v16H4z"'), "path user");
    assert.ok(out.includes('d="M2 2h8v8H8z"'), "path cart");
  });
});

describe("Блок C — коллизии ID", () => {
  const gradient = (extra: string): string =>
    svg(
      'viewBox="0 0 24 24"',
      `<defs><linearGradient id="g1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs><path fill="url(#g1)" d="M4 4h16v16H4z" ${extra}/>`,
    );

  test("градиент g1 в двух иконках → user-g1 / cart-g1, ссылки обновлены", () => {
    const out = buildSprite([
      { name: "user", content: gradient("") },
      { name: "cart", content: gradient("") },
    ]);

    assert.ok(out.includes('id="user-g1"'), "id user-g1");
    assert.ok(out.includes('id="cart-g1"'), "id cart-g1");
    assert.ok(out.includes('fill="url(#user-g1)"'), "url user-g1");
    assert.ok(out.includes('fill="url(#cart-g1)"'), "url cart-g1");
    // Не осталось непрефиксованных ссылок: id="g1" встречается только внутри user-g1/cart-g1.
    assert.ok(!out.includes('id="g1"'), "сырой id=g1 отсутствует");
    assert.ok(!out.includes("url(#g1)"), "сырая ссылка url(#g1) отсутствует");
  });

  test("url(#...) в инлайн-стиле и mask-атрибуте тоже префиксуется", () => {
    const masked = svg(
      'viewBox="0 0 24 24"',
      '<mask id="m1"><rect width="24" height="24" fill="#fff"/></mask><g mask="url(#m1)"><path style="fill:url(#g2)" d="M0 0"/></g><defs><linearGradient id="g2"/></defs>',
    );
    const out = buildSprite([{ name: "icon", content: masked }]);

    assert.ok(out.includes('id="icon-m1"') && out.includes('mask="url(#icon-m1)"'), "mask");
    assert.ok(out.includes("fill:url(#icon-g2)"), "инлайн-стиль");
    assert.ok(!out.includes("url(#m1)") && !out.includes("url(#g2)"), "сырых ссылок нет");
  });
});

describe("Блок D — утечка стилей", () => {
  const animated = (cls: string): string =>
    svg(
      'viewBox="0 0 24 24"',
      `<style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.${cls}{animation:spin 1s linear infinite}</style><path class="${cls}" d="M4 4h16v16H4z"/>`,
    );

  test("селекторы, class-атрибуты, @keyframes и animation-ссылки префиксованы", () => {
    const out = buildSprite([
      { name: "user", content: animated("cls-1") },
      { name: "cart", content: animated("cls-1") },
    ]);

    assert.ok(out.includes(".user-cls-1{"), "селектор user");
    assert.ok(out.includes(".cart-cls-1{"), "селектор cart");
    assert.ok(out.includes('class="user-cls-1"'), "class user");
    assert.ok(out.includes('class="cart-cls-1"'), "class cart");
    assert.ok(out.includes("@keyframes user-spin{"), "keyframes user");
    assert.ok(out.includes("@keyframes cart-spin{"), "keyframes cart");
    assert.ok(out.includes("animation:user-spin 1s"), "animation user");
    assert.ok(out.includes("animation:cart-spin 1s"), "animation cart");
    // Сырые имена не встречаются ни в селекторах, ни в именах правил.
    assert.ok(!/(^|[^-\w])\.cls-1{/.test(out), "сырой селектор .cls-1 отсутствует");
    assert.ok(!/@keyframes spin{/.test(out), "сырой @keyframes spin отсутствует");
  });

  test("несколько классов в одном атрибуте — каждый префиксуется", () => {
    const out = buildSprite([
      { name: "i", content: svg('viewBox="0 0 8 8"', '<g class="a b"><path class="a"/></g>') },
    ]);

    assert.ok(out.includes('class="i-a i-b"'), out);
    assert.ok(out.includes('class="i-a"'), out);
    assert.ok(!out.includes('class="a"') && !out.includes('class="b"'), "сырых классов нет");
  });

  test("id-селектор в <style> следует за переименованием id", () => {
    const out = buildSprite([
      {
        name: "x",
        content: svg(
          'viewBox="0 0 8 8"',
          '<style>#dot{fill:#f00}</style><circle id="dot" r="4"/>',
        ),
      },
    ]);

    assert.ok(out.includes('id="x-dot"'), "id префиксован");
    assert.ok(out.includes("#x-dot{fill:#f00}"), "селектор следует за id");
    assert.ok(!/(^|[^-\w])#dot{/.test(out), "сырой селектор #dot отсутствует");
  });

  test("ссылка на чужой @keyframes (без своего) не переименовывается", () => {
    const out = buildSprite([
      { name: "a", content: svg('viewBox="0 0 8 8"', '<style>.s{animation:pulse 2s}</style><rect class="s"/>') },
    ]);

    assert.ok(out.includes("animation:pulse 2s"), "внешние keyframes не тронуты");
    assert.ok(!out.includes("animation:a-pulse"), "нет ложной префиксации");
  });
});

describe("Блок E — детерминизм", () => {
  const icons = [
    { name: "user", content: svg('viewBox="0 0 24 24"', '<path fill="url(#g)"/>') },
    { name: "cart", content: svg('viewBox="0 0 32 32"', '<style>.c{fill:#0f0}</style><path class="c"/>') },
    { name: "star", content: svg('viewBox="0 0 16 16"', '<path d="M8 0l8 8-8 8z"/>') },
  ];

  test("два вызова на одном наборе — байт-идентичный вывод", () => {
    assert.equal(buildSprite(icons), buildSprite(icons));
  });

  test("порядок входа не влияет (сортировка по id внутри)", () => {
    assert.equal(buildSprite(icons), buildSprite([...icons].reverse()));
  });
});

describe("Блок F — ошибки и крайние случаи", () => {
  test("дубликат имени иконки → throw [svg:build-sprite]", () => {
    assert.throws(
      () => buildSprite([{ name: "user", content: svg('viewBox="0 0 8 8"', "") }, { name: "user", content: svg('viewBox="0 0 8 8"', "") }]),
      (error: unknown) => error instanceof Error && error.message.includes("[svg:build-sprite]") && error.message.includes("duplicate"),
    );
  });

  test("нет viewBox → throw (normalize гарантирует)", () => {
    assert.throws(
      () => buildSprite([{ name: "x", content: '<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>' }]),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("[svg:build-sprite]") &&
        error.message.includes("viewBox"),
    );
  });

  test("битый XML → throw с сообщением парсера", () => {
    assert.throws(
      () => buildSprite([{ name: "x", content: "<svg viewBox=" }]),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("[svg:build-sprite]") &&
        error.message.includes('icon "x"'),
    );
  });

  test("невалидное имя (начинается с цифры) → throw", () => {
    assert.throws(
      () => buildSprite([{ name: "9icon", content: svg('viewBox="0 0 8 8"', "") }]),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("[svg:build-sprite]") &&
        error.message.includes("invalid icon name"),
    );
  });

  test('fill="none" и currentColor проходят насквозь без изменений', () => {
    const out = buildSprite([
      {
        name: "s",
        content: svg('viewBox="0 0 8 8"', '<path fill="none" stroke="currentColor" d="M0 0"/>'),
      },
    ]);

    assert.ok(out.includes('fill="none" stroke="currentColor"'), out);
    assert.ok(!out.includes("s-none") && !out.includes("s-currentcolor"), "ключевые слова не префиксуются");
  });

  test('use-ссылки href="#id" префиксуются вместе с id', () => {
    const out = buildSprite([
      {
        name: "u",
        content: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 8 8"><path id="p" d="M0 0"/><use href="#p"/><use xlink:href="#p"/></svg>',
      },
    ]);

    assert.ok(out.includes('id="u-p"'), "id префиксован");
    assert.ok(out.includes('href="#u-p"'), "href префиксован");
    assert.ok(out.includes('xlink:href="#u-p"'), "xlink:href префиксован");
    assert.ok(!out.includes('href="#p"'), "сырой href отсутствует");
  });
});
