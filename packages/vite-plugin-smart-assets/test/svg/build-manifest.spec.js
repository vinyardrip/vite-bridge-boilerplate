/**
 * =================================================================================================
 * build-manifest — записи манифеста SVG и слияние с общим манифестом
 * (вход — формат ТЗ: { source, kind, mode, url, hash, symbol? }; модуль чистый,
 * файлы не нужны).
 *
 *   Блок A — базовая запись (sprite): полный набор полей source/file/kind/mode/
 *            symbol/hash, детерминированная сортировка по source;
 *   Блок B — инлайн: file = assets/ui/<имя>.svg из source, symbol отброшен;
 *   Блок C — относительные пути: ведущий "/" срезается, error → file: null;
 *   Блок D — слияние: чужие entries (растр, JS/CSS) и поля манифеста не
 *            перезаписываются, повторный merge без дублей;
 *   Блок E — ошибки (fail-fast).
 * =================================================================================================
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildSvgManifest, mergeSvgManifest } from "../../src/svg/build-manifest.js";

const spriteIcon = {
  source: "raw/icons/user.svg",
  kind: "icon",
  mode: "sprite",
  url: "assets/icons/sprite.a1b2c3d4.svg",
  hash: "a1b2c3d4",
  symbol: "user",
};

describe("Блок A — базовая запись (sprite)", () => {
  const { entries } = buildSvgManifest([spriteIcon]);

  test("возвращается фрагмент с массивом entries, одна запись", () => {
    assert.ok(Array.isArray(entries));
    assert.equal(entries.length, 1);
  });

  test("запись: source/file/kind/mode/symbol/hash как в ТЗ", () => {
    const [entry] = entries;
    assert.equal(entry.source, "raw/icons/user.svg");
    assert.equal(entry.file, "assets/icons/sprite.a1b2c3d4.svg");
    assert.equal(entry.kind, "icon");
    assert.equal(entry.mode, "sprite");
    assert.equal(entry.symbol, "user");
    assert.equal(entry.hash, "a1b2c3d4");
  });

  test("поля записи идут в порядке ТЗ (source, file, kind, mode, symbol, hash)", () => {
    assert.deepEqual(Object.keys(entries[0]), ["source", "file", "kind", "mode", "symbol", "hash"]);
  });

  test("записи отсортированы по source — порядок входа не влияет", () => {
    const reversed = buildSvgManifest([
      { ...spriteIcon, source: "raw/icons/zzz.svg", symbol: "zzz" },
      { ...spriteIcon, source: "raw/icons/aaa.svg", symbol: "aaa" },
      { ...spriteIcon, source: "raw/icons/mm.svg", symbol: "mm" },
    ]).entries;
    assert.deepEqual(
      reversed.map((entry) => entry.source),
      ["raw/icons/aaa.svg", "raw/icons/mm.svg", "raw/icons/zzz.svg"],
    );
  });
});

describe("Блок B — инлайн", () => {
  test("file = assets/ui/<имя>.svg, вычислен из source (url игнорируется)", () => {
    const { entries: [entry] } = buildSvgManifest([
      {
        source: "raw/icons/user.svg",
        kind: "icon",
        mode: "inline",
        url: "assets/icons/sprite.a1b2c3d4.svg",
        hash: "a1b2c3d4",
      },
    ]);
    assert.equal(entry.file, "assets/ui/user.svg");
  });

  test("symbol у инлайна undefined, даже если передан", () => {
    const { entries: [entry] } = buildSvgManifest([{ ...spriteIcon, mode: "inline" }]);
    assert.equal(entry.symbol, undefined);
    assert.equal(entry.file, "assets/ui/user.svg");
  });

  test("animated тоже инлайнится по mode: file в assets/ui/", () => {
    const { entries: [entry] } = buildSvgManifest([
      { source: "raw/icons/spinner.svg", kind: "animated", mode: "inline", hash: "1234abcd" },
    ]);
    assert.equal(entry.file, "assets/ui/spinner.svg");
    assert.equal(entry.kind, "animated");
  });

  test("имя берется без подпапок: raw/icons/nav/arrow.svg → assets/ui/arrow.svg", () => {
    const { entries: [entry] } = buildSvgManifest([
      { source: "raw/icons/nav/arrow.svg", kind: "icon", mode: "inline" },
    ]);
    assert.equal(entry.file, "assets/ui/arrow.svg");
  });
});

describe("Блок C — относительные пути", () => {
  const { entries } = buildSvgManifest([
    { ...spriteIcon, url: "/assets/icons/sprite.a1b2c3d4.svg" },
    {
      source: "raw/img/hero.svg",
      kind: "illustration",
      mode: "img",
      url: "assets/img/hero.deadbeef.svg",
      hash: "deadbeef",
    },
    { source: "raw/icons/junk.svg", kind: "unknown", mode: "error" },
  ]);
  const bySource = (source) => entries.find((entry) => entry.source === source);

  test("sprite: ведущий слеш url срезан", () => {
    assert.equal(bySource("raw/icons/user.svg").file, "assets/icons/sprite.a1b2c3d4.svg");
  });

  test("img: оптимизированный SVG, путь без ведущего слеша", () => {
    const entry = bySource("raw/img/hero.svg");
    assert.equal(entry.file, "assets/img/hero.deadbeef.svg");
    assert.equal(entry.symbol, undefined);
  });

  test("error: файл не эмитится — file null", () => {
    assert.equal(bySource("raw/icons/junk.svg").file, null);
  });

  test("ни в одном file нет ведущего слеша (контракт check-build)", () => {
    const files = entries.map((entry) => entry.file).filter((file) => typeof file === "string");
    assert.ok(files.length > 0);
    for (const file of files) {
      assert.ok(!file.startsWith("/"), `ведущий слеш в file: "${file}"`);
    }
  });
});

describe("Блок D — слияние с существующим манифестом", () => {
  const existing = {
    plugin: "vite-plugin-smart-assets",
    version: "0.2.3",
    rawDir: "frontend/raw",
    entries: [
      { source: "frontend/raw/hero.jpg", output: "assets/img/hero.jpg", type: "img", size: 28381 },
      { source: "frontend/src/js/app.js", file: "js/app.DhEzk3I3.js", isEntry: true },
    ],
  };
  const fragment = buildSvgManifest([spriteIcon, { ...spriteIcon, source: "raw/icons/cart.svg", symbol: "cart" }]);
  const merged = mergeSvgManifest(existing, fragment);

  test("SVG-entries добавлены к существующим, а не перезаписали их", () => {
    assert.equal(merged.entries.length, existing.entries.length + fragment.entries.length);
    assert.deepEqual(merged.entries[0], existing.entries[0]);
    assert.deepEqual(merged.entries[1], existing.entries[1]);
    assert.ok(merged.entries.slice(2).every((entry) => entry.mode !== undefined));
  });

  test("посторонние поля манифеста (plugin/version/rawDir) сохранены", () => {
    assert.equal(merged.plugin, "vite-plugin-smart-assets");
    assert.equal(merged.version, "0.2.3");
    assert.equal(merged.rawDir, "frontend/raw");
  });

  test("растр и JS/CSS-entries не изменены", () => {
    assert.deepEqual(merged.entries.find((e) => e.source === "frontend/raw/hero.jpg"), {
      source: "frontend/raw/hero.jpg",
      output: "assets/img/hero.jpg",
      type: "img",
      size: 28381,
    });
    assert.deepEqual(merged.entries.find((e) => e.source === "frontend/src/js/app.js"), {
      source: "frontend/src/js/app.js",
      file: "js/app.DhEzk3I3.js",
      isEntry: true,
    });
  });

  test("повторный merge не создает дублей (замена по source)", () => {
    const twice = mergeSvgManifest(merged, fragment);
    assert.equal(twice.entries.length, merged.entries.length);
    assert.equal(twice.entries.filter((e) => e.source === "raw/icons/user.svg").length, 1);
    assert.equal(twice.entries.filter((e) => e.source === "frontend/raw/hero.jpg").length, 1);
  });

  test("existing не мутируется", () => {
    assert.equal(existing.entries.length, 2);
    assert.ok(existing.entries.every((entry) => entry.mode === undefined));
    assert.deepEqual(existing.entries, [
      { source: "frontend/raw/hero.jpg", output: "assets/img/hero.jpg", type: "img", size: 28381 },
      { source: "frontend/src/js/app.js", file: "js/app.DhEzk3I3.js", isEntry: true },
    ]);
  });

  test("манифест без entries → массив создается, Vite-ключи не тронуты", () => {
    const viteLike = { "frontend/src/js/app.js": { file: "js/app.DhEzk3I3.js", isEntry: true } };
    const result = mergeSvgManifest(viteLike, fragment);
    assert.deepEqual(result["frontend/src/js/app.js"], { file: "js/app.DhEzk3I3.js", isEntry: true });
    assert.deepEqual(result.entries, fragment.entries);
  });
});

describe("Блок E — ошибки (fail-fast)", () => {
  test("не-массив входа → Error [svg:build-manifest]", () => {
    assert.throws(() => buildSvgManifest("raw/icons/user.svg"), /svg:build-manifest/);
    assert.throws(() => buildSvgManifest(null), /svg:build-manifest/);
  });

  test("запись без source → Error", () => {
    assert.throws(
      () => buildSvgManifest([{ kind: "icon", mode: "sprite", url: "assets/icons/sprite.a1b2c3d4.svg" }]),
      /svg:build-manifest/,
    );
  });

  test("неизвестный mode → Error (словарь assignModes)", () => {
    assert.throws(
      () => buildSvgManifest([{ source: "raw/icons/user.svg", kind: "icon", mode: "banana" }]),
      /svg:build-manifest/,
    );
  });
});
