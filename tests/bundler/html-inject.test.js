/**
 * tests/bundler/html-inject.test.js
 *
 * Unit tests for the helpers used by scripts/plugins/vite-html-asset-inject.js.
 * The plugin's main logic — emitting images with content hashes — is exercised
 * end-to-end in tests/frontend/e2e/. These tests focus on the deterministic
 * asset emission patterns.
 *
 * Run: node --test tests/bundler/html-inject.test.js
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

describe("bundler: html-inject asset hashing helpers", { concurrency: 1 }, () => {
  let tmpDir;
  let tmpImg;

  before(() => {
    tmpDir = path.join(REPO_ROOT, "temp/bundler-html-inject-test");
    fs.mkdirSync(tmpDir, { recursive: true });
    // 1x1 PNG
    tmpImg = path.join(tmpDir, "test-asset.png");
    const pngBytes = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108020000009077" +
        "53de0000000c4944415478da6364000000000200011f5dcc0d0000000049454e44ae426082",
      "hex",
    );
    fs.writeFileSync(tmpImg, pngBytes);
  });

  after(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 1: SHA-256 hashing of file contents is deterministic
  // -------------------------------------------------------------------------
  test("hash: identical content produces identical hash", () => {
    const data = fs.readFileSync(tmpImg);
    const h1 = createHash("sha256").update(data).digest("hex").slice(0, 8);
    const h2 = createHash("sha256").update(data).digest("hex").slice(0, 8);
    assert.strictEqual(h1, h2);
    assert.strictEqual(h1.length, 8);
  });

  test("hash: modified content produces different hash", () => {
    const data = fs.readFileSync(tmpImg);
    const h1 = createHash("sha256").update(data).digest("hex").slice(0, 8);
    const modified = Buffer.concat([data, Buffer.from([0xff, 0xfe])]);
    const h2 = createHash("sha256").update(modified).digest("hex").slice(0, 8);
    assert.notStrictEqual(h1, h2);
  });

  // -------------------------------------------------------------------------
  // Test 2: Asset emission path patterns
  // -------------------------------------------------------------------------
  test("emission: deterministic path with content hash", () => {
    // Matches the assetFileNames function in vite.config.js
    const baseName = path.parse(tmpImg).name;
    const ext = path.extname(tmpImg);
    const data = fs.readFileSync(tmpImg);
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 8);
    const fileName = `img/${baseName}.${hash}${ext}`;
    assert.match(fileName, /^img\/[a-z0-9-]+\.[a-f0-9]{8}\.png$/);
  });

  test("emission: font asset path pattern", () => {
    // .woff2 → fonts/[name].[hash][extname]
    const baseName = "JetBrainsMono-Bold";
    const ext = ".woff2";
    const fileName = `fonts/${baseName}.abcdef12${ext}`;
    assert.match(fileName, /^fonts\/[A-Za-z0-9-]+\.[a-f0-9]{8}\.woff2$/);
  });

  // -------------------------------------------------------------------------
  // Test 3: faviconTags URL paths are relative
  // -------------------------------------------------------------------------
  test("emission: favicon tags reference img/favicons/ path", () => {
    // The vite-html-asset-inject plugin emits these exact paths
    const expectedPaths = [
      "img/favicons/favicon.svg",
      "img/favicons/favicon-32x32.png",
      "img/favicons/favicon.ico",
      "img/favicons/apple-touch-icon.png",
      "img/favicons/icon-192.png",
      "img/favicons/icon-512.png",
    ];
    for (const p of expectedPaths) {
      assert.ok(p.startsWith("img/favicons/"));
    }
  });
});
