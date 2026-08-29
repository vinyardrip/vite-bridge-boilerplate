/*!
 * =================================================================================================
 * generate-favicons.js
 * =================================================================================================
 *
 * Generates a minimal, modern favicon set from a single SVG source
 * (frontend/public/favicon.svg) into the favicons/ subfolder of the
 * resolved build target (dist/ or a CMS theme directory):
 *
 *   favicon.svg            — vector icon for modern browsers
 *   favicon.ico            — multi-size fallback (16x16, 32x32)
 *   favicon-32x32.png      — PNG fallback
 *   apple-touch-icon.png   — iOS home screen (180x180)
 *   icon-192.png           — PWA / web app manifest
 *   icon-512.png           — PWA / web app manifest
 *
 * All favicon assets live strictly inside favicons/ of the build target
 * so the build root stays clean. The target is resolved dynamically
 * via resolveBuildTarget().
 *
 * <link rel="icon|apple-touch-icon|manifest"> tags for these deterministic
 * file names are injected into <head> by the vite-html-asset-inject plugin
 * (see vite.config.js).
 *
 * Usage: `node scripts/generate-favicons.js` (part of the `pnpm build` chain).
 *
 * =================================================================================================
 */

import favicons from "favicons";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";

import { resolveBuildTarget } from "./build-target.js";
import { wantsHelp, printHelp } from "./_help.js";

// ---------------------------------------------------------------------------
// CLI: -h / --help
// ---------------------------------------------------------------------------

if (wantsHelp()) {
  printHelp(
    "generate-favicons",
    "Generate a minimal modern favicon set from frontend/public/favicon.svg into the build target.",
    [
      ["-h, --help",   "Show this help message and exit."],
    ],
    [
      "node scripts/generate-favicons.js",
      "pnpm favicons:generate",
    ],
  );
  process.exit(0);
}

const SOURCE = path.resolve(
  import.meta.dirname,
  "..",
  "frontend",
  "public",
  "favicon.svg",
);

// Dynamic output directory: img/favicons/ inside the build target assets directory.
// This places favicons at backend/wp-content/themes/my-theme/assets/img/favicons/
// for the wordpress target, or dist/img/favicons/ for the static target.
const OUTPUT_DIR = path.join(resolveBuildTarget().dir, "img", "favicons");

// Final, user-facing filenames we want to ship in the favicons/ folder.
// The favicons library generates internally-named assets (e.g.
// android-chrome-192x192.png) — we map them to these clean canonical names.
const TARGET_FILES = {
  "favicon.svg": null, // special-cased below: a copy of the source SVG
  "favicon.ico": null, // comes from the `favicons` platform
  "favicon-32x32.png": null, // comes from the `favicons` platform
  "apple-touch-icon.png": null, // comes from the `appleIcon` platform (180x180)
  "icon-192.png": null, // comes from the `android` platform (192x192)
  "icon-512.png": null, // comes from the `android` platform (512x512)
};

// Maps the favicons library's output names → our canonical TARGET_FILES keys.
const RENAME_MAP = {
  "android-chrome-192x192.png": "icon-192.png",
  "android-chrome-512x512.png": "icon-512.png",
};

// Configuration for the favicons generator. We enable only the platforms
// we need, which keeps generation work and disk writes minimal. Note that
// enabling a platform still produces the full default size list — we
// post-process below to keep only TARGET_FILES.
const faviconConfig = {
  path: "",
  appName: "Vite Bridge Boilerplate",
  appShortName: "ViteApp",
  appDescription: "Vite Bridge Boilerplate",
  lang: "en",
  background: "#ffffff",
  theme_color: "#3b4b66",
  display: "standalone",
  orientation: "any",
  start_url: ".",
  scope: ".",
  icons: {
    favicons: true, // favicon.ico + favicon-32x32.png
    android: { background: "#3b4b66" }, // android-chrome-192x192 / 512x512
    appleIcon: true, // apple-touch-icon.png (180x180)
    appleStartup: false,
    windows: false, // no mstile-*.png or browserconfig.xml
    coast: false,
    firefox: false,
    yandex: false,
  },
};

async function generateFavicons() {
  if (!existsSync(SOURCE)) {
    console.error(
      chalk.red(`[generate-favicons] Error: Source SVG not found at ${SOURCE}`),
    );
    process.exit(1);
  }

  // Wipe the target directory so stale legacy files (mstile-*, old
  // android-chrome-*, apple-touch-icon-precomposed.png, etc.) don't
  // survive across builds.
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const { images, files, html } = await favicons(SOURCE, faviconConfig);

  // Index the library's outputs by their original name.
  const emitted = new Map();
  for (const entry of [...images, ...files]) {
    emitted.set(entry.name, entry.contents);
  }

  // 1. Copy our raw source SVG (the library emits its own optimized
  //    favicon.svg, but we want the exact source so dev/prod match).
  await writeFile(
    path.join(OUTPUT_DIR, "favicon.svg"),
    await readFile(SOURCE),
  );

  // 2. Pick the assets we actually want to ship, renaming android-chrome-*
  //    to the cleaner icon-192.png / icon-512.png.
  for (const [originalName, canonicalName] of Object.entries(RENAME_MAP)) {
    const contents = emitted.get(originalName);
    if (contents) {
      await writeFile(path.join(OUTPUT_DIR, canonicalName), contents);
    }
  }
  for (const name of ["favicon.ico", "favicon-32x32.png", "apple-touch-icon.png"]) {
    const contents = emitted.get(name);
    if (contents) {
      await writeFile(path.join(OUTPUT_DIR, name), contents);
    }
  }

  console.log(
    chalk.green(
      `[generate-favicons] Done: Generated modern favicon set (6 files) in ${OUTPUT_DIR}`,
    ),
  );
  // Surface how many <head> tags the asset-inject plugin will add, but
  // keep it on a separate line so the main "Done" line stays clean.
  if (process.env.VERBOSE) {
    console.log(
      chalk.gray(`[generate-favicons] <head> tags to inject: ${html.length}`),
    );
  }
}

generateFavicons().catch((error) => {
  console.error(chalk.red("[generate-favicons] Error during generation:"));
  console.error(error);
  process.exit(1);
});
