/*!
 * =================================================================================================
 * convert-images.js
 * =================================================================================================
 *
 * Recursively traverses frontend/src/assets/ and converts PNG/JPG source images
 * to WebP (always) and AVIF (static mode only, cms mode skips AVIF).
 * Output files are placed directly adjacent to their source files within the
 * same nested folder structure.
 *
 * Mtime-based caching: if an output image already exists and is newer than
 * the source file, conversion is skipped.
 *
 * Configuration is read from project.config.json at the workspace root:
 *   - static  mode → webp + avif
 *   - cms     mode → webp only (avif disabled)
 *
 * Usage: `node scripts/convert-images.js`
 *
 * =================================================================================================
 */

import sharp from "sharp";
import { glob } from "glob";
import path from "path";
import fs from "fs";
import { readFileSync, statSync } from "node:fs";
import ora from "ora";
import chalk from "chalk";

import { resolveBuildTarget } from "./build-target.js";

const rootDir = path.resolve(import.meta.dirname, "..");

/**
 * Load project.config.json once.
 * @returns {object}
 */
function loadConfig() {
  try {
    const cfg = JSON.parse(
      readFileSync(path.join(rootDir, "project.config.json"), "utf-8"),
    );
    return cfg;
  } catch {
    return { defaults: { target: "static" } };
  }
}

const config = loadConfig();
const { mode: targetMode } = resolveBuildTarget();

// Derive the effective target key from the config defaults.
// BUILD_TARGET ENV or resolveBuildTarget() already resolved "cms" vs "static"
// via project.config.json. We use targetMode from resolveBuildTarget() for
// correctness, which is the single source of truth.
const targetKey = targetMode; // e.g. "static" or "cms"

// Master switch: config.compression.imageConvert.enabled (default true).
const ENABLED = config.compression?.imageConvert?.enabled !== false;

// Resolve source directory: prefer the explicit override in config.targets[target].sourceRoot,
// otherwise default to frontend/src/assets/
const targetCfg = config.targets?.[targetKey] ?? {};
const SOURCE_ROOT = targetCfg.sourceRoot
  ? path.resolve(rootDir, targetCfg.sourceRoot)
  : path.join(rootDir, "frontend", "src", "assets");

// Quality settings from project.config.json, with sensible defaults.
const defaults = {
  webp: { quality: 80 },
  avif: { quality: 75 },
};
const cfg = targetCfg.imageProcessing ?? {};
const WEBP_QUALITY = cfg.quality?.webp ?? defaults.webp.quality;
const AVIF_QUALITY = cfg.quality?.avif ?? defaults.avif.quality;

const GENERATE_WEBP = cfg.webp !== false;
const GENERATE_AVIF = cfg.avif === true && targetKey === "static";

// Cache file stored at the project root. Path can be overridden via
// project.config.json → compression.imageConvert.cacheFile.
const CACHE_FILE = path.resolve(
  rootDir,
  config.compression?.imageConvert?.cacheFile || ".convert-images-cache.json",
);

// ---------------------------------------------------------------------------
// Cache helpers (mtime-based)
// ---------------------------------------------------------------------------

/**
 * @returns {Record<string, number>}  sourcePath → mtime
 */
function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Returns true when outputPath exists and is newer than sourcePath.
 * @param {string} sourcePath
 * @param {string} outputPath
 * @returns {boolean}
 */
function isCacheHit(sourcePath, outputPath) {
  try {
    const srcMtime = statSync(sourcePath).mtimeMs;
    const outMtime = statSync(outputPath).mtimeMs;
    return outMtime >= srcMtime;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

async function convertImage(srcPath) {
  const parsed = path.parse(srcPath);
  const dir = parsed.dir; // absolute, e.g. .../frontend/src/assets/images/heroes
  const base = parsed.name; // e.g. "bg"
  const ext = parsed.ext.toLowerCase();

  const outputs = [];

  // WebP — always generated (unless explicitly disabled in config)
  if (GENERATE_WEBP) {
    const outPath = path.join(dir, `${base}.webp`);
    if (isCacheHit(srcPath, outPath)) {
      outputs.push({ path: outPath, skipped: true, format: "webp" });
    } else {
      await sharp(srcPath)
        .webp({ quality: WEBP_QUALITY })
        .toFile(outPath);
      outputs.push({ path: outPath, skipped: false, format: "webp" });
    }
  }

  // AVIF — static mode only
  if (GENERATE_AVIF) {
    const outPath = path.join(dir, `${base}.avif`);
    if (isCacheHit(srcPath, outPath)) {
      outputs.push({ path: outPath, skipped: true, format: "avif" });
    } else {
      await sharp(srcPath)
        .avif({ quality: AVIF_QUALITY })
        .toFile(outPath);
      outputs.push({ path: outPath, skipped: false, format: "avif" });
    }
  }

  return outputs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!ENABLED) {
    console.log(
      chalk.gray(
        "[convert-images] Disabled in project.config.json (compression.imageConvert.enabled=false). Skipping.",
      ),
    );
    return;
  }

  const spinner = ora("[convert-images] Scanning for images...").start();

  // Recursively find all raster images under frontend/src/assets/
  const patterns = ["png", "jpg", "jpeg"].flatMap((ext) =>
    glob.sync(`${SOURCE_ROOT}/**/*.${ext}`, { follow: false }),
  );

  if (patterns.length === 0) {
    spinner.warn(
      chalk.yellow(
        `[convert-images] Info: No images found under ${SOURCE_ROOT}.`,
      ),
    );
    return;
  }

  spinner.text = `[convert-images] Processing ${patterns.length} image(s)...`;

  const cache = loadCache();
  let converted = 0;
  let skipped = 0;

  for (const srcPath of patterns) {
    const srcMtime = statSync(srcPath).mtimeMs;

    try {
      const results = await convertImage(srcPath);
      for (const result of results) {
        if (!result.skipped) {
          converted++;
          cache[srcPath] = srcMtime;
        } else {
          skipped++;
        }
      }
    } catch (err) {
      // Continue processing other files on error
      console.error(
        chalk.red(`[convert-images] Failed to convert ${path.basename(srcPath)}.`),
      );
      console.error(err.message);
    }
  }

  saveCache(cache);
  spinner.stop();

  const lines = [];
  if (converted > 0) lines.push(`converted: ${chalk.green(converted)}`);
  if (skipped > 0) lines.push(`skipped: ${chalk.yellow(skipped)}`);
  if (lines.length > 0) {
    console.log(`[convert-images] ${lines.join(", ")}.`);
  }

  const modeTag =
    targetKey === "cms" ? " (cms mode — avif disabled)" : " (static mode — avif enabled)";
  console.log(
    chalk.green(`[convert-images] Done.${modeTag}`),
  );
}

main();
