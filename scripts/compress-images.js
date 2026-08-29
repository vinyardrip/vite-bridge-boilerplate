/*!
 * =================================================================================================
 * compress-images.js
 * =================================================================================================
 *
 * TinyPNG-driven image compression script. All settings (API keys env var,
 * source dir, output dir, cache file, enabled flag) are read from
 * project.config.json under `compression.tinypng`.
 *
 * Behaviour:
 *  - Reads TINYPNG_API_KEYS (or the env var named in config) from
 *    frontend/.env or .env at the project root.
 *  - Validates the first working key, then compresses images
 *    in-place (output dir defaults to images-tiny/).
 *  - mtime-based cache (frontend/.tinypng-cache): unchanged files are skipped.
 *
 * If disabled in config or no API keys are present, the script logs a warning
 * and exits cleanly so the rest of the build pipeline continues.
 *
 * Usage:
 *   pnpm images:compress
 *   node scripts/compress-images.js
 *
 * =================================================================================================
 */

import tinify from "tinify";
import dotenv from "dotenv";
import { glob } from "glob";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import ora from "ora";
import chalk from "chalk";

import { rootDir } from "./build-target.js";

// ---------------------------------------------------------------------------
// Config (read from project.config.json → compression.tinypng)
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(rootDir, "project.config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

const config = loadConfig();

/** Resolves the active TinyPNG config block. Reads config fresh each call. */
function resolveTinyPng() {
  const cfg = loadConfig();
  const t = cfg.compression?.tinypng ?? {};
  return {
    envVar: t.envVar || "TINYPNG_API_KEYS",
    enabled: t.enabled !== false,
    sourceDir: t.sourceDir || "frontend/src/assets/images",
    outputDir: t.outputDir || "frontend/src/assets/images-tiny",
    cacheFile: t.cacheFile || "frontend/.tinypng-cache",
  };
}

// Snapshot for the run-once import path (but resolvers below re-read fresh).
let tinypng = resolveTinyPng();

// ---------------------------------------------------------------------------
// .env resolution
// ---------------------------------------------------------------------------

const envPath = path.resolve(process.cwd(), "frontend", ".env");
const altEnvPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: fs.existsSync(envPath) ? envPath : altEnvPath });

// Promisified helpers
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

async function loadCache() {
  try {
    return JSON.parse(await readFile(tinypng.cacheFile, "utf-8"));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await writeFile(tinypng.cacheFile, JSON.stringify(cache, null, 2));
}

// ---------------------------------------------------------------------------
// TinyPNG key validation
// ---------------------------------------------------------------------------

async function validateAndSetApiKey() {
  // Re-resolve config to pick up the latest values
  tinypng = resolveTinyPng();
  const keys = getApiKeysNow();
  const spinner = ora("Validating API keys...").start();
  for (const key of keys) {
    try {
      tinify.key = key.trim();
      await promisify(tinify.validate)();
      spinner.succeed(chalk.green("[compress-images] Working API key found."));
      return true;
    } catch {
      // try next key
    }
  }
  spinner.warn(
    chalk.yellow(
      "[compress-images] Warning: No valid TinyPNG API keys found. Skipping image compression.",
    ),
  );
  return false;
}

// ---------------------------------------------------------------------------
// Public helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Helper to read fresh API keys based on current config + env. */
function getApiKeysNow() {
  const { envVar } = tinypng;
  return (process.env[envVar] || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && k.length > 0);
}

/**
 * Reads the active TinyPNG configuration block from project.config.json.
 * Exposed for testing — returns the merged { enabled, envVar, sourceDir, outputDir, cacheFile }.
 * Reads config fresh on each call.
 */
export function getTinyPngConfig() {
  // Re-resolve so test files that change the config see the new values.
  tinypng = resolveTinyPng();
  return {
    enabled: tinypng.enabled,
    envVar: tinypng.envVar,
    envValue: process.env[tinypng.envVar] || "",
    sourceDir: tinypng.sourceDir,
    outputDir: tinypng.outputDir,
    cacheFile: tinypng.cacheFile,
  };
}

/**
 * Returns the parsed, trimmed, non-empty TinyPNG API keys from the env var
 * named in project.config.json (defaults to TINYPNG_API_KEYS).
 */
export function getApiKeys() {
  // Re-resolve so test files that change the envVar see the new value.
  tinypng = resolveTinyPng();
  return getApiKeysNow();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function compressImages() {
  // Re-resolve config to pick up the latest values
  tinypng = resolveTinyPng();

  if (!tinypng.enabled) {
    console.log(
      chalk.gray(
        "[compress-images] Disabled in project.config.json (compression.tinypng.enabled=false). Skipping.",
      ),
    );
    return;
  }

  const keys = getApiKeysNow();
  if (keys.length === 0) {
    console.warn(
      chalk.yellow(
        `[compress-images] Warning: No API keys found in ${tinypng.envVar} environment variable. Skipping image compression.`,
      ),
    );
    return;
  }

  const isValidKey = await validateAndSetApiKey();
  if (!isValidKey) return; // best-effort — let the rest of the build continue

  const spinner = ora("[compress-images] Searching for images...").start();
  const imagePaths = await glob(`${tinypng.sourceDir}/**/*.{png,jpg,jpeg}`);
  const cache = await loadCache();
  let compressedCount = 0;
  let skippedCount = 0;

  if (!fs.existsSync(tinypng.outputDir)) {
    await mkdir(tinypng.outputDir, { recursive: true });
  }

  for (const imagePath of imagePaths) {
    try {
      const stats = await stat(imagePath);
      const fileMtime = stats.mtime.getTime();

      if (cache[imagePath] && cache[imagePath] === fileMtime) {
        skippedCount++;
        continue;
      }

      spinner.text = `[compress-images] Compressing: ${chalk.yellow(path.basename(imagePath))}`;
      const source = tinify.fromFile(imagePath);
      const outputPath = path.join(tinypng.outputDir, path.basename(imagePath));
      await promisify(source.toFile).call(source, outputPath);

      cache[imagePath] = fileMtime;
      compressedCount++;
    } catch (err) {
      spinner.fail(
        chalk.red(`[compress-images] Failed to compress ${path.basename(imagePath)}.`),
      );
      console.error(err);
    }
  }

  await saveCache(cache);
  spinner.stop();

  if (imagePaths.length === 0) {
    console.log(
      chalk.yellow(`[compress-images] Info: No images found in ${tinypng.sourceDir}.`),
    );
  } else if (process.env.VERBOSE) {
    console.log(
      `[compress-images] Compressed: ${chalk.green(compressedCount)}, skipped (unchanged): ${chalk.yellow(skippedCount)}`,
    );
  }

  console.log(
    chalk.green("[compress-images] Done: Image compression check completed."),
  );
}

compressImages();
