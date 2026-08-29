/**
 * tests/scripts/convert-images.test.js
 *
 * Unit tests for scripts/convert-images.js verifying:
 *  1. Recursive directory processing preserves subfolder layout.
 *  2. Config with target="cms" generates ONLY .webp, completely skips .avif.
 *  3. mtime caching skips re-conversion of unchanged files.
 *
 * Run: node --test tests/scripts/convert-images.test.js
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts/convert-images.js");

// We use a dedicated test subdirectory under frontend/src/assets/test-images
// so the tests don't pollute the main image folder and the recursive scan
// is verifiable.
const TEST_SRC = path.join(REPO_ROOT, "frontend/src/assets/test-images");
const TEST_HEROES = path.join(TEST_SRC, "heroes");
const TEST_THUMBS = path.join(TEST_SRC, "thumbs");
const SOURCE_IMG = path.join(REPO_ROOT, "frontend/src/assets/images/img1.jpg");
const CONFIG_PATH = path.join(REPO_ROOT, "project.config.json");

/** Reads the project.config.json (or returns null if missing). */
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return null;
  }
}

/** Writes a config object back to project.config.json. */
function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

/** Runs the convert-images script. */
function runScript() {
  return execSync(`node "${SCRIPT_PATH}"`, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    stdio: "pipe",
  });
}

/** Updates mtime of a file to "now". */
function touchFile(p) {
  const now = new Date();
  fs.utimesSync(p, now, now);
}

describe("scripts/convert-images.js", { concurrency: 1 }, () => {
  let originalConfig = null;
  let hadConfig = false;

  before(() => {
    // Save existing config
    if (existsSync(CONFIG_PATH)) {
      hadConfig = true;
      originalConfig = readConfig();
    }
  });

  after(() => {
    // Restore original config
    if (hadConfig && originalConfig) {
      writeConfig(originalConfig);
    } else if (existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
    // Clean up test files
    if (fs.existsSync(TEST_SRC)) {
      fs.rmSync(TEST_SRC, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 1: Recursive processing preserves subfolder layout
  // -------------------------------------------------------------------------
  test("recursive: subfolder layout is preserved in output", () => {
    // Set up a config that scans our test directory
    writeConfig({
      defaults: { target: "static" },
      targets: {
        static: {
          description: "Test",
          imageProcessing: { webp: true, avif: true },
          sourceRoot: "frontend/src/assets/test-images",
        },
      },
    });

    // Build a nested structure under TEST_SRC
    fs.mkdirSync(TEST_HEROES, { recursive: true });
    fs.mkdirSync(TEST_THUMBS, { recursive: true });
    fs.copyFileSync(SOURCE_IMG, path.join(TEST_HEROES, "bg.jpg"));
    fs.copyFileSync(SOURCE_IMG, path.join(TEST_THUMBS, "thumb.jpg"));

    runScript();

    // Verify .webp files were created in the same subfolders
    const webpInHeroes = fs.existsSync(path.join(TEST_HEROES, "bg.webp"));
    const webpInThumbs = fs.existsSync(path.join(TEST_THUMBS, "thumb.webp"));

    assert.ok(webpInHeroes, "bg.webp should be generated in heroes/");
    assert.ok(webpInThumbs, "thumb.webp should be generated in thumbs/");

    // Verify the layout was preserved (no flattening)
    const expectedLayout = ["heroes/bg.webp", "thumbs/thumb.webp"];
    for (const f of expectedLayout) {
      assert.ok(
        fs.existsSync(path.join(TEST_SRC, f)),
        `${f} should be at the same relative path as the source`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: cms mode generates ONLY .webp, no .avif
  // -------------------------------------------------------------------------
  test('cms mode: generates .webp only, never .avif', () => {
    // Reset test dir
    fs.rmSync(TEST_SRC, { recursive: true, force: true });
    fs.mkdirSync(TEST_SRC, { recursive: true });

    // Configure cms mode with custom sourceRoot
    writeConfig({
      defaults: { target: "cms" },
      targets: {
        cms: {
          description: "CMS",
          imageProcessing: { webp: true, avif: false },
          sourceRoot: "frontend/src/assets/test-images",
        },
      },
    });

    // Copy a single source image
    fs.copyFileSync(SOURCE_IMG, path.join(TEST_SRC, "test.jpg"));

    runScript();

    // .webp should exist
    const webpPath = path.join(TEST_SRC, "test.webp");
    assert.ok(fs.existsSync(webpPath), ".webp should be generated in cms mode");

    // .avif should NOT exist
    const avifPath = path.join(TEST_SRC, "test.avif");
    assert.ok(
      !fs.existsSync(avifPath),
      ".avif must NOT be generated in cms mode",
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: mtime caching skips re-conversion of unchanged files
  // -------------------------------------------------------------------------
  test("mtime cache: unchanged files are skipped on second run", () => {
    // Reset test dir
    fs.rmSync(TEST_SRC, { recursive: true, force: true });
    fs.mkdirSync(TEST_SRC, { recursive: true });

    // Configure static mode with custom sourceRoot
    writeConfig({
      defaults: { target: "static" },
      targets: {
        static: {
          description: "Test",
          imageProcessing: { webp: true, avif: true },
          sourceRoot: "frontend/src/assets/test-images",
        },
      },
    });

    // Copy a source image
    fs.copyFileSync(SOURCE_IMG, path.join(TEST_SRC, "cached.jpg"));

    // First run — should generate .webp
    runScript();
    const webpPath = path.join(TEST_SRC, "cached.webp");
    assert.ok(fs.existsSync(webpPath), ".webp should be created on first run");

    const firstMtime = fs.statSync(webpPath).mtimeMs;

    // Bump source mtime to ensure cache check sees "source newer" would
    // be wrong — but here we want source mtime SAME or OLDER than output.
    // We just wait briefly to give a real regen a chance to change output mtime.
    // Touch the source to its CURRENT time (which is older than what we just wrote).
    const sourceStat = fs.statSync(path.join(TEST_SRC, "cached.jpg"));
    fs.utimesSync(
      path.join(TEST_SRC, "cached.jpg"),
      sourceStat.atime,
      new Date(sourceStat.mtimeMs - 10000),
    );

    // Wait at least 50ms
    const wait = Date.now() + 50;
    while (Date.now() < wait) {}

    // Second run — should skip (output mtime >= source mtime)
    runScript();
    const secondMtime = fs.statSync(webpPath).mtimeMs;

    assert.strictEqual(
      secondMtime,
      firstMtime,
      ".webp mtime should not change on second run (file was skipped)",
    );
  });
});

/** Local existsSync helper to avoid extra imports. */
function existsSync(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
