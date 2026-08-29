/*!
 * =================================================================================================
 * sync-theme.js
 * =================================================================================================
 *
 * Copies the contents of the static build output (dist/) directly into the
 * target WordPress theme folder (backend/wp-content/themes/<themeSlug>/).
 *
 *   Source:    dist/  (or whichever directory the active build target points to)
 *   Target:    backend/wp-content/themes/<themeSlug>/
 *
 * Only the CONTENTS of the source are copied — there is no nested
 * "vite-bridge-boilerplate" folder created. The script deletes previously
 * synced assets (CSS/JS/IMG/FONTS) in the theme root to keep things clean
 * and avoid stale files.
 *
 * Static public assets (favicon.svg, etc.) and index.html are copied
 * directly to the theme root so WordPress can serve them from the theme path.
 *
 * Usage:
 *   pnpm build
 *   pnpm sync:theme
 *   # or non-interactive (env override):
 *   BUILD_TARGET=static pnpm sync:theme
 *
 * =================================================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

import { resolveBuildTarget, rootDir } from "./build-target.js";

const PROJECT_NAME = path.basename(rootDir);
const THEME_ROOT = path.join(
  rootDir,
  "backend",
  "wp-content",
  "themes",
  PROJECT_NAME,
);

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

export function existsSync(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function rimraf(p) {
  if (!existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

/**
 * Recursively copy a file or directory from `src` to `dest`.
 * Preserves the source relative layout under dest.
 */
export function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

/**
 * Computes the (sourceDir, targetDir) pair for a given build mode and theme
 * slug. Pure function — exported for tests.
 *
 * @param {string} mode      - "static" | "wordpress" | "wp" | ...
 * @param {string} themeSlug - CMS theme folder name
 * @param {string} projectRoot - absolute path to the project root
 * @returns {{ sourceDir: string, targetDir: string, shouldSync: boolean }}
 */
export function resolveSyncPaths(mode, themeSlug, projectRoot) {
  const staticDir = path.join(projectRoot, "dist");
  const targetDir = path.join(
    projectRoot,
    "backend",
    "wp-content",
    "themes",
    themeSlug,
  );
  if (mode === "static") {
    return { sourceDir: staticDir, targetDir, shouldSync: true };
  }
  // CMS targets write directly into the theme; no separate sync step needed
  return { sourceDir: staticDir, targetDir, shouldSync: false };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { dir: buildOutput, mode, themeSlug } = resolveBuildTarget();

  // 1. Determine the build output source.
  //    - For static builds the output is dist/.
  //    - For WordPress builds the output is already in <slug>/assets/, no sync needed.
  //    - For the legacy "assets/" layout (cms target) we also skip the sync.
  let sourceDir;
  if (mode === "static") {
    sourceDir = buildOutput; // dist/
  } else if (mode === "wordpress" || mode === "wp") {
    // Already in <slug>/assets/ — nothing to sync
    console.log(
      chalk.gray(
        `[sync-theme] Skipped: build target is "${mode}" — output is already in the theme directory.`,
      ),
    );
    return;
  } else {
    sourceDir = buildOutput;
  }

  if (!existsSync(sourceDir)) {
    console.error(
      chalk.red(
        `[sync-theme] Error: build output not found at ${sourceDir}. Run 'pnpm build' first.`,
      ),
    );
    process.exit(1);
  }

  // 2. Determine the theme target directory.
  //    Use themeSlug from config, not the raw repo name.
  const targetDir = path.join(
    rootDir,
    "backend",
    "wp-content",
    "themes",
    themeSlug,
  );

  if (!existsSync(path.join(rootDir, "backend"))) {
    console.error(
      chalk.red(
        `[sync-theme] Error: backend/ directory not found. Cannot sync to a WordPress theme without a backend/ tree.`,
      ),
    );
    process.exit(1);
  }

  ensureDir(targetDir);

  // 3. Clean previously-synced managed files (CSS/JS/IMG/FONTS).
  //    Don't touch user-managed files (style.css, screenshot.png, functions.php, etc.).
  const MANAGED_DIRS = ["css", "js", "img", "fonts", "favicons"];
  const MANAGED_FILES = [
    "index.html",
    "test-fonts.html",
    "manifest.json",
    "registerSW.js",
    "sw.js",
    "sw.js.map",
    "workbox-*.js",
    "workbox-*.js.map",
    "robots.txt",
  ];
  for (const d of MANAGED_DIRS) {
    rimraf(path.join(targetDir, d));
  }
  for (const f of MANAGED_FILES) {
    if (f.includes("*")) {
      // glob-style: delete matching files in targetDir
      const pattern = new RegExp("^" + f.replace(/\./g, "\\.").replace(/\*/g, "[^/]+") + "$");
      for (const entry of fs.readdirSync(targetDir)) {
        if (pattern.test(entry)) {
          rimraf(path.join(targetDir, entry));
        }
      }
    } else {
      rimraf(path.join(targetDir, f));
    }
  }

  // 4. Copy the build output contents directly into the theme root.
  //    KEY: only CONTENTS, not the directory itself. dist/index.html → theme/index.html.
  let count = 0;
  for (const entry of fs.readdirSync(sourceDir)) {
    const src = path.join(sourceDir, entry);
    const dest = path.join(targetDir, entry);
    copyRecursive(src, dest);
    count++;
  }

  console.log(
    chalk.green(
      `[sync-theme] Done: ${count} item(s) copied to backend/wp-content/themes/${themeSlug}/`,
    ),
  );
}

// Only run when invoked as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(chalk.red("[sync-theme] Error:"));
    console.error(err);
    process.exit(1);
  });
}
