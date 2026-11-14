/**
 * =================================================================================================
 * pipeline — оркестратор (вход — реальные файлы: спек готовит tmpdir с
 * зеркальной структурой frontend/raw/ и переходит в него chdir'ом, чтобы
 * source/пути имели продакшен-форму).
 *
 *   Блок A — базовый пакет: 1 icon → inline, 2 kind-sprite → один спрайт
 *            (outputs: 1 ui-файл + 1 sprite-файл, 3 записи манифеста);
 *   Блок B — fail-fast: битый файл роняет пакет, а не пропускается;
 *   Блок C — img-режим, scope "" (WP), дубликат имени инлайна, пустой пакет.
 * =================================================================================================
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { SvgManifestFragment, SvgOutput } from "../../src/types.ts";
import { processSvgBatch } from "../../src/svg/pipeline.ts";

const rawDir = "frontend/raw";

const FIXTURES = {
  "inline.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v16H4z"/></svg>',
  "sprite-a.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><symbol id="mark" viewBox="0 0 8 8"><path fill="currentColor" d="M0 0h8v8H0z"/></symbol></svg>',
  "sprite-b.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><symbol id="dot" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#0f0"/></symbol></svg>',
};

let tmp = "";
let originalCwd = "";

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "svg-pipeline-"));
  await fs.mkdir(path.join(tmp, rawDir), { recursive: true });
  for (const [name, content] of Object.entries(FIXTURES)) {
    await fs.writeFile(path.join(tmp, rawDir, name), content, "utf8");
  }
  originalCwd = process.cwd();
  process.chdir(tmp);
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmp, { recursive: true, force: true });
});

const absPath = (name: string) => path.resolve(rawDir, name);
const SPRITE_URL_RE = /^assets\/icons\/sprite\.[0-9a-f]{8}\.svg$/;

/*! Базовый пакет считается один раз (мемоизация) — файлы уже в tmpdir. */
let baseResult: { outputs: SvgOutput[]; manifest: SvgManifestFragment } | null = null;
const baseBatch = async () => {
  baseResult ??= await processSvgBatch(
    [
      absPath("inline.svg"),
      absPath("sprite-a.svg"),
      absPath("sprite-b.svg"),
    ],
    { rawDir },
  );
  return baseResult;
};

describe("Блок A — базовый пакет (1 inline + 2 kind-sprite)", () => {
  test("outputs: 2 файла — 1 инлайн в ui/ и 1 спрайт в icons/", async () => {
    const { outputs } = await baseBatch();
    assert.equal(outputs.length, 2);
    const fileNames = outputs.map((output) => output.fileName);
    assert.ok(fileNames.includes("assets/ui/inline.svg"), fileNames.join(", "));
    const sprite = fileNames.find((name) => name.startsWith("assets/icons/sprite."));
    assert.ok(sprite && SPRITE_URL_RE.test(sprite), fileNames.join(", "));
  });

  test("inline-файл содержит нормализованный контент иконки", async () => {
    const { outputs } = await baseBatch();
    const inline = outputs.find((output) => output.fileName === "assets/ui/inline.svg");
    assert.ok(inline!.content.includes('<path fill="currentColor" d="M4 4h16v16H4z"/>'), inline!.content);
  });

  test("спрайт содержит оба символа (sprite-a, sprite-b)", async () => {
    const { outputs } = await baseBatch();
    const sprite = outputs.find((output) => SPRITE_URL_RE.test(output.fileName));
    assert.ok(sprite!.content.includes('<symbol id="sprite-a"'), sprite!.content);
    assert.ok(sprite!.content.includes('<symbol id="sprite-b"'), sprite!.content);
  });

  test("manifest: 3 записи, отсортированы по source", async () => {
    const { manifest } = await baseBatch();
    assert.equal(manifest.entries.length, 3);
    const sources = manifest.entries.map((entry) => entry.source);
    assert.deepEqual(sources, [...sources].sort());
    assert.ok(sources.includes("frontend/raw/inline.svg"), sources.join(", "));
    assert.ok(sources.includes("frontend/raw/sprite-a.svg"), sources.join(", "));
    assert.ok(sources.includes("frontend/raw/sprite-b.svg"), sources.join(", "));
  });

  test("запись inline: file/kind/mode/hash, symbol нет", async () => {
    const { manifest } = await baseBatch();
    const entry = manifest.entries.find((e) => e.source === "frontend/raw/inline.svg")!;
    assert.equal(entry.file, "assets/ui/inline.svg");
    assert.equal(entry.kind, "icon");
    assert.equal(entry.mode, "inline");
    assert.equal(entry.symbol, undefined);
    assert.match(entry.hash!, /^[0-9a-f]{8}$/);
  });

  test("sprite-записи: file = url спрайта, hash совпадает с хешем в имени, symbol по имени", async () => {
    const { manifest } = await baseBatch();
    for (const [source, symbol] of [
      ["frontend/raw/sprite-a.svg", "sprite-a"],
      ["frontend/raw/sprite-b.svg", "sprite-b"],
    ]) {
      const entry = manifest.entries.find((e) => e.source === source)!;
      assert.equal(entry.mode, "sprite");
      assert.match(entry.file!, SPRITE_URL_RE);
      assert.ok(entry.file === `assets/icons/sprite.${entry.hash}.svg`, entry.file!);
      assert.equal(entry.symbol, symbol);
    }
  });
});

describe("Блок B — fail-fast", () => {
  test("битый файл роняет пакет с контекстом source, а не пропускается", async () => {
    await fs.writeFile(path.join(rawDir, "broken.svg"), "<svg viewBox=", "utf8");
    try {
      await assert.rejects(
        () => processSvgBatch([absPath("broken.svg")]),
        (error: unknown) =>
          error instanceof Error &&
          error.message.includes("[svg:pipeline]") &&
          error.message.includes("frontend/raw/broken.svg"),
      );
    } finally {
      await fs.rm(path.join(rawDir, "broken.svg"), { force: true });
    }
  });

  test("несуществующий файл роняет пакет", async () => {
    await assert.rejects(
      () => processSvgBatch([absPath("nope.svg")]),
      /svg:pipeline.*не читается/s,
    );
  });
});

describe("Блок C — img-режим, scope, дубликаты, пустой пакет", () => {
  test("illustration → img/<stem>.<hash>.svg, kind illustration", async () => {
    const content =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs><rect fill="url(#g)" width="10" height="10"/></svg>';
    await fs.writeFile(path.join(rawDir, "illustration.svg"), content, "utf8");
    try {
      const { outputs, manifest } = await processSvgBatch([absPath("illustration.svg")]);
      assert.equal(outputs.length, 1);
      assert.match(outputs[0].fileName, /^assets\/img\/illustration\.[0-9a-f]{8}\.svg$/);
      assert.equal(manifest.entries.length, 1);
      assert.equal(manifest.entries[0].mode, "img");
      assert.equal(manifest.entries[0].kind, "illustration");
      assert.equal(manifest.entries[0].file, outputs[0].fileName);
    } finally {
      await fs.rm(path.join(rawDir, "illustration.svg"), { force: true });
    }
  });

  test('scope "" (WP-сборка): пути без assets/, без ведущего слеша', async () => {
    const { outputs } = await processSvgBatch([absPath("inline.svg")], { scope: "" });
    assert.equal(outputs[0].fileName, "ui/inline.svg");
    assert.ok(!outputs[0].fileName.startsWith("/"));
  });

  test("дубликат имени инлайна (одно имя в двух подпапках) → throw", async () => {
    await fs.mkdir(path.join(rawDir, "icons"), { recursive: true });
    const icon =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path fill="currentColor" d="M0 0h8v8H0z"/></svg>';
    await fs.writeFile(path.join(rawDir, "icons", "dup.svg"), icon, "utf8");
    await fs.writeFile(path.join(rawDir, "dup.svg"), icon, "utf8");
    try {
      await assert.rejects(
        () => processSvgBatch([absPath("dup.svg"), absPath("icons/dup.svg")]),
        /дубликат имени инлайна/,
      );
    } finally {
      await fs.rm(path.join(rawDir, "icons"), { recursive: true, force: true });
      await fs.rm(path.join(rawDir, "dup.svg"), { force: true });
    }
  });

  test("пустой пакет → пустые outputs и entries", async () => {
    const { outputs, manifest } = await processSvgBatch([]);
    assert.deepEqual(outputs, []);
    assert.deepEqual(manifest.entries, []);
  });
});
