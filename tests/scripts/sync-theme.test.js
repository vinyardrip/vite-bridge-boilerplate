/**
 * tests/scripts/sync-theme.test.js
 *
 * Tests for scripts/sync-theme.js:
 *  1. The resolveSyncPaths helper maps static build output to the theme
 *     directory without any nested folder.
 *  2. End-to-end copyRecursive copies files AND preserves the layout
 *     (no extra intermediate folder between source contents and target).
 *  3. rimraf cleans stale managed files in the theme root.
 *
 * Run: node --test tests/scripts/sync-theme.test.js
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

describe("sync-theme.js", { concurrency: 1 }, () => {
  let mod;
  before(async () => {
    mod = await import(`file://${path.join(REPO_ROOT, "scripts/sync-theme.js")}`);
  });

  // -------------------------------------------------------------------------
  // Test 1: resolveSyncPaths maps static → theme root (no nesting)
  // -------------------------------------------------------------------------
  test("resolveSyncPaths: static source maps to theme root (no nested folder)", () => {
    const { sourceDir, targetDir, shouldSync } = mod.resolveSyncPaths(
      "static",
      "my-theme",
      REPO_ROOT,
    );

    // Source is dist/, target is backend/wp-content/themes/my-theme/
    assert.strictEqual(sourceDir, path.join(REPO_ROOT, "dist"));
    assert.strictEqual(
      targetDir,
      path.join(REPO_ROOT, "backend", "wp-content", "themes", "my-theme"),
    );
    assert.strictEqual(shouldSync, true);

    // The source dir is NOT nested inside the target — there is no
    // <target>/dist/ folder; the contents are copied directly.
    assert.ok(!sourceDir.startsWith(targetDir + path.sep), "source should NOT live under target");
  });

  test("resolveSyncPaths: wordpress mode skips sync (already in theme dir)", () => {
    const { shouldSync } = mod.resolveSyncPaths("wordpress", "my-theme", REPO_ROOT);
    assert.strictEqual(shouldSync, false);
  });

  test("resolveSyncPaths: uses custom theme slug from config (not raw repo name)", () => {
    const { targetDir } = mod.resolveSyncPaths("static", "custom-client-theme", REPO_ROOT);
    // Must end with the custom slug
    assert.ok(
      targetDir.endsWith("themes/custom-client-theme"),
      "target should use the custom theme slug",
    );
    // The theme folder should be the custom slug, NOT a raw repo name
    // (e.g. for repo "vite-bridge-boilerplate", the theme should NOT be
    // "vite-bridge-boilerplate" — it should be the custom slug from config).
    const themeName = path.basename(targetDir);
    assert.notStrictEqual(
      themeName,
      "vite-bridge-boilerplate",
      "theme folder name should not be the raw repo name",
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: copyRecursive preserves the source layout
  // -------------------------------------------------------------------------
  test("copyRecursive: copies file contents into the target without nesting", () => {
    const tmpSrc = path.join(REPO_ROOT, "tmp-test-sync-src");
    const tmpDest = path.join(REPO_ROOT, "tmp-test-sync-dest");

    // Create source structure: tmpSrc/index.html, tmpSrc/css/app.css
    fs.mkdirSync(path.join(tmpSrc, "css"), { recursive: true });
    fs.writeFileSync(path.join(tmpSrc, "index.html"), "<html>hi</html>");
    fs.writeFileSync(path.join(tmpSrc, "css", "app.css"), "body { color: red; }");
    fs.rmSync(tmpDest, { recursive: true, force: true });

    // Run copyRecursive on each top-level entry
    mod.ensureDir(tmpDest);
    for (const entry of fs.readdirSync(tmpSrc)) {
      mod.copyRecursive(path.join(tmpSrc, entry), path.join(tmpDest, entry));
    }

    // Verify the target structure
    assert.ok(
      fs.existsSync(path.join(tmpDest, "index.html")),
      "index.html should be at the dest root, NOT under a subdir",
    );
    assert.ok(
      fs.existsSync(path.join(tmpDest, "css", "app.css")),
      "css/app.css should be preserved at css/app.css",
    );
    assert.ok(
      !fs.existsSync(path.join(tmpDest, "tmp-test-sync-src")),
      "There should NOT be a nested source-folder copy in the target",
    );

    // Cleanup
    fs.rmSync(tmpSrc, { recursive: true, force: true });
    fs.rmSync(tmpDest, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 3: rimraf cleans stale managed files
  // -------------------------------------------------------------------------
  test("rimraf: removes stale files and directories", () => {
    const tmp = path.join(REPO_ROOT, "tmp-test-rimraf");
    fs.mkdirSync(path.join(tmp, "css"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "manifest.json"), "{}");
    fs.writeFileSync(path.join(tmp, "css", "app.css"), "body{}");

    mod.rimraf(path.join(tmp, "css"));
    mod.rimraf(path.join(tmp, "manifest.json"));

    assert.ok(!fs.existsSync(path.join(tmp, "css")), "css/ should be removed");
    assert.ok(
      !fs.existsSync(path.join(tmp, "manifest.json")),
      "manifest.json should be removed",
    );
    assert.ok(fs.existsSync(tmp), "tmp itself should still exist");

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("rimraf: safe on non-existent path (no throw)", () => {
    assert.doesNotThrow(() => {
      mod.rimraf(path.join(REPO_ROOT, "tmp-nonexistent-path-xyz"));
    });
  });
});
