/*!
 * =================================================================================================
 * compress-images.js
 * =================================================================================================
 *
 * TinyPNG-driven image compression with local Sharp/MozJPEG fallback.
 *
 *   1. Resolves .env strictly from rootDir/frontend/.env (NOT process.cwd()).
 *   2. Reads TINYPNG_API_KEYS and validates each key against the TinyPNG API.
 *   3. If no key works, prompts the developer interactively:
 *        - Enter API Key(s):   prompt for keys, save into frontend/.env, retry
 *        - Use Local Compression: process images via Sharp/MozJPEG (Sharp is already
 *                                 a dev dep, no extra cost)
 *        - Skip:               exit cleanly without errors
 *   4. Stores content-hash cache in temp/.tinypng-cache. Pass --force to bypass.
 *
 * Configuration: project.config.json → compression.tinypng
 *   { enabled, sourceDir, outputDir, envVar, cacheFile, force }
 *
 * Usage:
 *   pnpm images:compress
 *   node scripts/compress-images.js
 *   node scripts/compress-images.js --force
 *   node scripts/compress-images.js --local        # non-interactive: skip TinyPNG, use Sharp
 *   node scripts/compress-images.js --skip         # non-interactive: skip entirely
 *   node scripts/compress-images.js --key=ABC,DEF  # non-interactive: use these keys
 *
 * =================================================================================================
 */

import tinify from "tinify";
import dotenv from "dotenv";
import { glob } from "glob";
import { promisify } from "util";
import { createHash } from "node:crypto";
import path from "path";
import fs from "fs";
import { mkdir, readFile, writeFile, stat, access, copyFile } from "node:fs/promises";
import readline from "node:readline";
import sharp from "sharp";
import ora from "ora";
import chalk from "chalk";

import { rootDir } from "./build-target.js";

// ---------------------------------------------------------------------------
// .env resolution — strictly from rootDir/frontend/.env
// ---------------------------------------------------------------------------

const FRONTEND_ENV = path.resolve(rootDir, "frontend", ".env");

function loadEnv() {
  // Only load from the canonical frontend/.env — never root or backend.
  if (fs.existsSync(FRONTEND_ENV)) {
    dotenv.config({ path: FRONTEND_ENV });
  }
}

// ---------------------------------------------------------------------------
// Config (read from project.config.json → compression.tinypng)
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(rootDir, "project.config.json");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function resolveTinyPng() {
  const cfg = readConfig();
  const t = cfg.compression?.tinypng ?? {};
  return {
    enabled: t.enabled !== false,
    envVar: t.envVar || "TINYPNG_API_KEYS",
    sourceDir: t.sourceDir || "frontend/src/assets/images",
    outputDir: t.outputDir || "frontend/src/assets/images-tiny",
    // Cache is now under temp/ for clean separation from source code.
    cacheFile: t.cacheFile || "temp/.tinypng-cache",
  };
}

let tinypng = resolveTinyPng();

// ---------------------------------------------------------------------------
// Cache helpers — content-hash (SHA-256) based, stored in temp/.tinypng-cache
// ---------------------------------------------------------------------------

function ensureTempDir() {
  const dir = path.dirname(path.resolve(rootDir, tinypng.cacheFile));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function loadCache() {
  ensureTempDir();
  const cachePath = path.resolve(rootDir, tinypng.cacheFile);
  try {
    const raw = await readFile(cachePath, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  ensureTempDir();
  const cachePath = path.resolve(rootDir, tinypng.cacheFile);
  await writeFile(cachePath, JSON.stringify(cache, null, 2));
}

/** Compute SHA-256 hash of a file's contents. */
async function hashFile(absPath) {
  const data = await readFile(absPath);
  return createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// Interactive prompt
// ---------------------------------------------------------------------------

const FORCE = process.argv.includes("--force");
const NON_INTERACTIVE = !process.stdin.isTTY || !process.stdout.isTTY;

function getArg(name) {
  const prefix = `--${name}=`;
  for (const a of process.argv) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return null;
}

function isYesFlag() {
  return process.argv.includes("--local") || getArg("local") === "true";
}

function isSkipFlag() {
  return process.argv.includes("--skip");
}

function getInlineKey() {
  return getArg("key");
}

async function promptForChoice() {
  // Returns: "key" | "local" | "skip"
  if (NON_INTERACTIVE) {
    // Non-interactive: default to local fallback so builds don't fail
    console.log(
      chalk.gray(
        "[compress-images] Non-interactive mode: defaulting to local Sharp compression.",
      ),
    );
    return "local";
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    console.log();
    console.log(chalk.bold("[compress-images] Choose an action:"));
    console.log(`  ${chalk.cyan("1)")} Enter API Key(s) (prompt + save to frontend/.env)`);
    console.log(`  ${chalk.cyan("2)")} Use Local Compression (Sharp / MozJPEG)  ${chalk.gray("[recommended]")}`);
    console.log(`  ${chalk.cyan("3)")} Skip Image Compression`);
    rl.question(`\nChoice ${chalk.gray("[2]")}: `, (answer) => {
      rl.close();
      const trimmed = (answer || "").trim();
      if (trimmed === "1") return resolve("key");
      if (trimmed === "3") return resolve("skip");
      // Default to 2 (local) on empty input
      resolve("local");
    });
  });
}

async function promptForKey() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      chalk.cyan("[compress-images] Enter TinyPNG API key(s) (comma-separated): "),
      (answer) => {
        rl.close();
        resolve((answer || "").trim());
      },
    );
  });
}

async function saveKeysToFrontendEnv(keys) {
  // Update or insert TINYPNG_API_KEYS in frontend/.env
  const lines = fs.existsSync(FRONTEND_ENV)
    ? fs.readFileSync(FRONTEND_ENV, "utf-8").split(/\r?\n/)
    : [];

  const envVar = tinypng.envVar;
  let found = false;
  const newLines = lines.map((line) => {
    if (line.startsWith(`${envVar}=`)) {
      found = true;
      return `${envVar}=${keys.join(",")}`;
    }
    return line;
  });
  if (!found) newLines.push(`${envVar}=${keys.join(",")}`);

  // Ensure the file ends with a newline
  const finalText = newLines.join("\n") + (newLines.length ? "\n" : "");
  await writeFile(FRONTEND_ENV, finalText, "utf-8");
}

// ---------------------------------------------------------------------------
// TinyPNG key validation
// ---------------------------------------------------------------------------

function getApiKeysNow() {
  const { envVar } = tinypng;
  return (process.env[envVar] || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && k.length > 0);
}

async function validateAndSetApiKey() {
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

function printKeyWarning() {
  console.log();
  console.log(
    chalk.yellow(
      "[compress-images] TinyPNG API key missing or exhausted (Free tier: 500 images/mo per key).",
    ),
  );
  console.log(
    chalk.yellow(
      "[compress-images] Get free API keys at: https://tinypng.com/developers",
    ),
  );
}

// ---------------------------------------------------------------------------
// TinyPNG compression path
// ---------------------------------------------------------------------------

async function compressOneTinypng(imagePath, outputPath) {
  const source = tinify.fromFile(imagePath);
  await promisify(source.toFile).call(source, outputPath);
}

// ---------------------------------------------------------------------------
// Local Sharp/MozJPEG compression path
// ---------------------------------------------------------------------------

async function compressOneLocal(imagePath, outputPath) {
  // Sharp's default .jpeg() is libmozjpeg-compatible for re-encoding.
  // We keep the original extension (jpg → jpg, png → png).
  const ext = path.extname(imagePath).toLowerCase();
  const img = sharp(imagePath, { failOn: "none" });
  if (ext === ".png") {
    // PNG → re-encode at moderate compression (deflate level)
    await img.png({ compressionLevel: 9, effort: 10 }).toFile(outputPath);
  } else {
    // JPEG (or jpg) → mozjpeg via sharp's jpeg encoder
    await img
      .jpeg({
        quality: 82,
        mozjpeg: true,
        progressive: true,
        optimizeScans: true,
      })
      .toFile(outputPath);
  }
}

// ---------------------------------------------------------------------------
// Shared processing loop
// ---------------------------------------------------------------------------

async function processImages({ strategy, cache, force }) {
  const sourceDirAbs = path.resolve(rootDir, tinypng.sourceDir);
  const outputDirAbs = path.resolve(rootDir, tinypng.outputDir);

  const imagePaths = await glob(`${tinypng.sourceDir}/**/*.{png,jpg,jpeg}`);

  if (!fs.existsSync(outputDirAbs)) {
    await mkdir(outputDirAbs, { recursive: true });
  }

  const spinner = ora(`[compress-images] (${strategy}) Searching for images...`).start();
  spinner.text = `[compress-images] (${strategy}) Processing ${imagePaths.length} image(s)...`;

  let processed = 0;
  let skipped = 0;

  for (const relPath of imagePaths) {
    const absPath = path.resolve(rootDir, relPath);
    const outPath = path.join(outputDirAbs, path.basename(relPath));
    const key = relPath; // cache key = source-relative path

    // Hash check
    let hash = null;
    try {
      hash = await hashFile(absPath);
    } catch {
      // can't read → skip
      continue;
    }

    if (!force && cache[key] === hash) {
      skipped++;
      continue;
    }

    try {
      if (strategy === "tinypng") {
        await compressOneTinypng(absPath, outPath);
      } else {
        await compressOneLocal(absPath, outPath);
      }
      cache[key] = hash;
      processed++;
    } catch (err) {
      spinner.fail(
        chalk.red(
          `[compress-images] Failed to compress ${path.basename(relPath)}: ${err.message || err}`,
        ),
      );
    }
  }

  await saveCache(cache);
  spinner.stop();

  return { processed, skipped, total: imagePaths.length };
}

// ---------------------------------------------------------------------------
// Public helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Resolves the .env file path used by the script. Strictly under
 * `rootDir/frontend/.env` — never root or backend.
 */
export function getEnvPath() {
  return FRONTEND_ENV;
}

/**
 * Resolves the cache file path used by the script. Defaults to
 * `temp/.tinypng-cache` (relative to rootDir).
 */
export function getCachePath() {
  return path.resolve(rootDir, tinypng.cacheFile);
}

/**
 * Reads the active TinyPNG configuration block.
 */
export function getTinyPngConfig() {
  tinypng = resolveTinyPng();
  return {
    enabled: tinypng.enabled,
    envVar: tinypng.envVar,
    envValue: process.env[tinypng.envVar] || "",
    sourceDir: tinypng.sourceDir,
    outputDir: tinypng.outputDir,
    cacheFile: tinypng.cacheFile,
    envPath: FRONTEND_ENV,
  };
}

export function getApiKeys() {
  tinypng = resolveTinyPng();
  return getApiKeysNow();
}

export { loadCache, saveCache, hashFile, loadEnv, getApiKeysNow };

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  loadEnv();
  tinypng = resolveTinyPng();

  if (!tinypng.enabled) {
    console.log(
      chalk.gray(
        "[compress-images] Disabled in project.config.json (compression.tinypng.enabled=false). Skipping.",
      ),
    );
    return;
  }

  // Inline key (--key=...) bypasses the interactive prompt entirely
  const inlineKey = getInlineKey();
  if (inlineKey) {
    process.env[tinypng.envVar] = inlineKey;
  }

  // Validate TinyPNG keys
  const keys = getApiKeysNow();
  let isValidKey = false;
  if (keys.length > 0) {
    isValidKey = await validateAndSetApiKey();
  }

  // Determine strategy
  let strategy = "tinypng";

  if (!isValidKey) {
    // Honor explicit flags first
    if (isSkipFlag()) {
      console.log(
        chalk.gray("[compress-images] --skip flag: exiting cleanly."),
      );
      return;
    }
    if (isYesFlag()) {
      printKeyWarning();
      console.log(
        chalk.gray(
          "[compress-images] --local flag: using local Sharp/MozJPEG compression.",
        ),
      );
      strategy = "local";
    } else {
      printKeyWarning();
      const choice = await promptForChoice();
      if (choice === "key") {
        const newKey = await promptForKey();
        if (!newKey) {
          console.log(
            chalk.yellow(
              "[compress-images] No key entered. Falling back to local compression.",
            ),
          );
          strategy = "local";
        } else {
          const newKeys = newKey.split(",").map((k) => k.trim()).filter(Boolean);
          await saveKeysToFrontendEnv(newKeys);
          // Reload env from the file we just wrote
          loadEnv();
          // Retry validation
          isValidKey = await validateAndSetApiKey();
          if (!isValidKey) {
            console.log(
              chalk.yellow(
                "[compress-images] Saved keys are not valid. Falling back to local compression.",
              ),
            );
            strategy = "local";
          } else {
            strategy = "tinypng";
          }
        }
      } else if (choice === "skip") {
        console.log(
          chalk.gray("[compress-images] Skipping image compression (user choice)."),
        );
        return;
      } else {
        strategy = "local";
      }
    }
  }

  // Run the compression loop
  const cache = await loadCache();
  const result = await processImages({ strategy, cache, force: FORCE });

  if (result.total === 0) {
    console.log(
      chalk.yellow(
        `[compress-images] Info: No images found in ${tinypng.sourceDir}.`,
      ),
    );
  } else if (process.env.VERBOSE) {
    console.log(
      `[compress-images] ${chalk.green(`processed: ${result.processed}`)}, ${chalk.yellow(`skipped: ${result.skipped}`)}`,
    );
  }

  console.log(
    chalk.green(
      `[compress-images] Done: ${strategy} compression completed (${result.processed} processed, ${result.skipped} skipped).`,
    ),
  );
}

// Only run when invoked as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(chalk.red("[compress-images] Error:"));
    console.error(err);
    process.exit(1);
  });
}
