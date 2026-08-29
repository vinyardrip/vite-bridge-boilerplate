/**
 * tests/scripts/config.test.js
 *
 * Tests for project.config.json schema and the TinyPNG config helper.
 *  1. The setup wizard writes a valid project.config.json with correct defaults
 *     based on the supplied options (target / theme / pwa).
 *  2. The TinyPNG utility reads configuration parameters from project.config.json
 *     and returns the merged config block.
 *
 * Run: node --test tests/scripts/config.test.js
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const CONFIG_PATH = path.join(REPO_ROOT, "project.config.json");

/** Save and restore the project.config.json around the test suite. */
let originalConfig = null;
let hadConfig = false;

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

describe("project.config.json — config wizard + TinyPNG utility", { concurrency: 1 }, () => {
  before(() => {
    if (fs.existsSync(CONFIG_PATH)) {
      hadConfig = true;
      originalConfig = fs.readFileSync(CONFIG_PATH, "utf-8");
    }
  });

  after(() => {
    if (hadConfig && originalConfig) {
      fs.writeFileSync(CONFIG_PATH, originalConfig);
    } else if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
  });

  // -------------------------------------------------------------------------
  // Test 1: init-project.js non-interactive mode writes a valid config
  // -------------------------------------------------------------------------
  test("setup wizard: --target=static writes a valid config with defaults", () => {
    execSync(
      `node ${path.join(REPO_ROOT, "scripts/init-project.js")} --target=static --theme=my-theme --pwa=true`,
      {
        cwd: REPO_ROOT,
        stdio: "pipe",
        env: { ...process.env, CI: "1" }, // CI=1 to force non-interactive (we also pass all flags)
      },
    );

    assert.ok(fs.existsSync(CONFIG_PATH), "project.config.json should be created");

    const cfg = readConfig();
    assert.strictEqual(cfg.defaults.target, "static");
    assert.strictEqual(cfg.themeSlug, "my-theme");
    assert.strictEqual(cfg.pwa, true);
    // AVIF is enabled in static mode
    assert.strictEqual(cfg.targets.static.imageProcessing.avif, true);
    // AVIF is disabled in cms mode
    assert.strictEqual(cfg.targets.cms.imageProcessing.avif, false);
  });

  test("setup wizard: --target=cms writes cms config and disables PWA by default", () => {
    execSync(
      `node ${path.join(REPO_ROOT, "scripts/init-project.js")} --target=cms --theme=acme-theme --pwa=false`,
      {
        cwd: REPO_ROOT,
        stdio: "pipe",
        env: { ...process.env, CI: "1" },
      },
    );

    const cfg = readConfig();
    assert.strictEqual(cfg.defaults.target, "cms");
    assert.strictEqual(cfg.themeSlug, "acme-theme");
    assert.strictEqual(cfg.pwa, false);
  });

  test("setup wizard: theme slug is sanitized (lowercase, alnum + hyphens)", () => {
    execSync(
      `node ${path.join(REPO_ROOT, "scripts/init-project.js")} --target=static --theme="My Theme!! 123" --pwa=true`,
      {
        cwd: REPO_ROOT,
        stdio: "pipe",
        env: { ...process.env, CI: "1" },
      },
    );

    const cfg = readConfig();
    // Should be lowercased, spaces/specials → hyphens, no leading/trailing hyphens
    assert.strictEqual(cfg.themeSlug, "my-theme-123");
  });

  // -------------------------------------------------------------------------
  // Test 2: TinyPNG utility reads configuration parameters
  // -------------------------------------------------------------------------
  test("compress-images: getTinyPngConfig reads configuration parameters", async () => {
    // Ensure config has a known tinypng block
    const cfg = readConfig();
    cfg.compression = cfg.compression || {};
    cfg.compression.tinypng = {
      enabled: true,
      sourceDir: "frontend/src/assets/images",
      outputDir: "frontend/src/assets/images-tiny",
      cacheFile: "temp/.tinypng-cache",
      envVar: "TINYPNG_API_KEYS",
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));

    // Set env var to a known value and import the module
    process.env.TINYPNG_API_KEYS = "key1, key2 ,key3,, ";

    // Dynamic import so we get the current process.env values
    const mod = await import(`file://${path.join(REPO_ROOT, "scripts/compress-images.js")}`);
    const tpConfig = mod.getTinyPngConfig();

    assert.strictEqual(tpConfig.enabled, true);
    assert.strictEqual(tpConfig.envVar, "TINYPNG_API_KEYS");
    assert.strictEqual(tpConfig.sourceDir, "frontend/src/assets/images");
    assert.strictEqual(tpConfig.outputDir, "frontend/src/assets/images-tiny");
    assert.strictEqual(tpConfig.cacheFile, "temp/.tinypng-cache");
    assert.strictEqual(tpConfig.envValue, "key1, key2 ,key3,, ");
    // .env path is strictly rootDir/frontend/.env (NOT process.cwd())
    assert.ok(
      tpConfig.envPath.endsWith("frontend/.env"),
      `envPath should be <rootDir>/frontend/.env, got ${tpConfig.envPath}`,
    );

    // getApiKeys() should trim + filter empty entries
    const keys = mod.getApiKeys();
    assert.deepStrictEqual(keys, ["key1", "key2", "key3"]);

    delete process.env.TINYPNG_API_KEYS;
  });

  test("compress-images: custom envVar name is honored", async () => {
    const cfg = readConfig();
    cfg.compression = cfg.compression || {};
    cfg.compression.tinypng = {
      ...cfg.compression.tinypng,
      envVar: "MY_TINYPNG_KEY",
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));

    process.env.MY_TINYPNG_KEY = "alpha,beta";

    const mod = await import(`file://${path.join(REPO_ROOT, "scripts/compress-images.js")}`);
    const tpConfig = mod.getTinyPngConfig();
    assert.strictEqual(tpConfig.envVar, "MY_TINYPNG_KEY");

    const keys = mod.getApiKeys();
    assert.deepStrictEqual(keys, ["alpha", "beta"]);

    delete process.env.MY_TINYPNG_KEY;
  });

  test("compress-images: enabled=false is reflected in config", async () => {
    const cfg = readConfig();
    cfg.compression = cfg.compression || {};
    cfg.compression.tinypng = {
      ...cfg.compression.tinypng,
      enabled: false,
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));

    const mod = await import(`file://${path.join(REPO_ROOT, "scripts/compress-images.js")}`);
    const tpConfig = mod.getTinyPngConfig();
    assert.strictEqual(tpConfig.enabled, false);
  });
});
