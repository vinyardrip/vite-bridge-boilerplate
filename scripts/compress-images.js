/*!
 * =================================================================================================
 * compress-images.js
 * =================================================================================================
 *
 * TinyPNG-driven image compression with local Sharp/MozJPEG fallback.
 *
 *   1. Resolves .env strictly from rootDir/frontend/.env (NOT process.cwd()).
 *   2. Parses TINYPNG_API_KEYS as a comma-separated list (whitespace stripped).
 *   3. Validates each key sequentially; the first working key becomes the
 *      "active" key. The script ROTATES to the next key automatically if a
 *      key's quota is exhausted mid-batch (HTTP 429 or similar).
 *   4. If NO key in the pool is valid, prompts the developer:
 *        - Enter API Key(s):   prompt for keys, save into frontend/.env, retry
 *        - Use Local Compression: process images via Sharp/MozJPEG
 *        - Skip:               exit cleanly
 *   5. Stores content-hash cache in temp/.tinypng-cache. Pass --force to bypass.
 *
 * Configuration: project.config.json → compression.tinypng
 *   { enabled, sourceDir, outputDir, envVar, cacheFile }
 *
 * Usage:
 *   pnpm images:compress
 *   node scripts/compress-images.js
 *   node scripts/compress-images.js --force
 *   node scripts/compress-images.js --local    # non-interactive: skip TinyPNG, use Sharp
 *   node scripts/compress-images.js --skip     # non-interactive: skip entirely
 *   node scripts/compress-images.js --key=ABC,DEF
 *
 * =================================================================================================
 */

import tinify from "tinify";
import dotenv from "dotenv";
import { glob } from "glob";
import { createHash } from "node:crypto";
import path from "path";
import fs from "fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import readline from "node:readline";
import sharp from "sharp";
import ora from "ora";
import chalk from "chalk";

import { rootDir } from "./build-target.js";
import { wantsHelp, printHelp } from "./_help.js";

// ---------------------------------------------------------------------------
// CLI: -h / --help
// ---------------------------------------------------------------------------

if (wantsHelp()) {
  printHelp(
    "compress-images",
    "Compress PNG/JPG images via TinyPNG (with cascade key rotation) or a local Sharp/MozJPEG fallback.",
    [
      ["--force",            "Bypass the temp/.tinypng-cache (re-process all images)."],
      ["--local",            "Skip TinyPNG; use local Sharp/MozJPEG compression."],
      ["--skip",             "Skip image compression entirely (exit cleanly)."],
      ["--key=<keys>",       "Comma-separated TinyPNG keys to use for this run."],
      ["-h, --help",         "Show this help message and exit."],
    ],
    [
      "node scripts/compress-images.js",
      "node scripts/compress-images.js --force",
      "node scripts/compress-images.js --local",
      "node scripts/compress-images.js --key=ABC,DEF",
    ],
  );
  process.exit(0);
}

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
export async function hashFile(absPath) {
  const data = await readFile(absPath);
  return createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// Key parsing — robust comma-separated + whitespace stripping
// ---------------------------------------------------------------------------

/**
 * Parses the env var into a clean array of non-empty, trimmed keys.
 * Always treats the env value as a comma-separated list, never a single key.
 */
export function parseApiKeys(rawValue) {
  if (typeof rawValue !== "string") return [];
  return rawValue
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && k.length > 0);
}

function getApiKeysNow() {
  return parseApiKeys(process.env[tinypng.envVar]);
}

// ---------------------------------------------------------------------------
// Cascade key rotator
// ---------------------------------------------------------------------------

/**
 * Detects whether a TinyPNG error is a quota/auth issue that should trigger
 * rotation to the next key. The Tinify client throws plain Errors with the
 * response message attached; quota errors include "429" or "limit" or
 * "exceed" or "Unauthorized"/"Bad credentials".
 */
function isRotationWorthyError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("limit") ||
    msg.includes("exceed") ||
    msg.includes("unauthorized") ||
    msg.includes("bad credentials") ||
    msg.includes("invalid") ||
    msg.includes("forbidden") ||
    msg.includes("401") ||
    msg.includes("403")
  );
}

// ---------------------------------------------------------------------------
// Tinify Promise wrappers — preserve `this` context and callback binding.
//
// Why explicit wrappers? `util.promisify(tinify.validate)` returns a generic
// function that does NOT preserve the tinify client's `this`/auth context
// when called as `promisify(tinify.validate)()`. Wrapping the callback
// manually guarantees the request goes through tinify's internal client
// with the active `tinify.key` set.
// ---------------------------------------------------------------------------

/**
 * Calls `tinify.validate()` and returns a Promise that resolves on success
 * or rejects with the underlying error. The callback `this` is bound to
 * the tinify module so the active API key is correctly applied.
 */
function tinifyValidateAsync() {
  return new Promise((resolve, reject) => {
    try {
      tinify.validate((err) => (err ? reject(err) : resolve(true)));
    } catch (err) {
      // Synchronous throw (e.g. invalid auth before network) — bubble up
      reject(err);
    }
  });
}

/**
 * Calls `tinify.fromFile(path).toFile(outPath)` and returns a Promise.
 * Preserves the chain's `this` so the active API key carries over.
 */
function tinifyCompressFileAsync(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const source = tinify.fromFile(inputPath);
      source.toFile(outputPath, (err) => (err ? reject(err) : resolve()));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Tries each key in order via tinify.validate(). Returns the index of the
 * first key that works, or -1 if none work. Logs a soft warning per failed
 * key so the developer can rotate their key pool.
 */
async function findFirstValidKey(keys) {
  if (keys.length === 0) return -1;
  const spinner = ora("Validating API keys...").start();
  for (let i = 0; i < keys.length; i++) {
    try {
      tinify.key = keys[i];
      await tinifyValidateAsync();
      spinner.succeed(
        chalk.green(
          `[compress-images] Working API key found (key #${i + 1} of ${keys.length}).`,
        ),
      );
      return i;
    } catch {
      // try next
      if (i < keys.length - 1) {
        spinner.stop();
        console.log(
          chalk.yellow(
            `[compress-images] Key #${i + 1} invalid or limit reached. Trying next key...`,
          ),
        );
        spinner.start("Validating API keys...");
      }
    }
  }
  spinner.warn(
    chalk.yellow(
      "[compress-images] Warning: No valid TinyPNG API keys found.",
    ),
  );
  return -1;
}

/**
 * Manages cascade rotation across multiple keys during a single compression
 * run. If a key's quota is exhausted mid-batch, rotate to the next valid key
 * without restarting the build.
 */
class KeyRotator {
  /**
   * @param {string[]} keys
   * @param {{ onKeyUsed?: (idx: number) => void }} [opts]
   */
  constructor(keys, opts = {}) {
    this.keys = keys.slice();
    this.currentIndex = -1;
    this.onKeyUsed = opts.onKeyUsed;
  }

  hasKeys() {
    return this.keys.length > 0;
  }

  currentKey() {
    return this.currentIndex >= 0 ? this.keys[this.currentIndex] : null;
  }

  /**
   * Sets the tinify global to the given key. Returns the key.
   */
  _use(idx) {
    this.currentIndex = idx;
    tinify.key = this.keys[idx];
    if (this.onKeyUsed) this.onKeyUsed(idx);
    return this.keys[idx];
  }

  /**
   * Try the next key in the pool. Returns true on success, false if exhausted.
   */
  rotateNext() {
    const next = this.currentIndex + 1;
    if (next >= this.keys.length) return false;
    this._use(next);
    return true;
  }

  /**
   * Returns true if the error suggests we should rotate to the next key.
   */
  shouldRotate(err) {
    return isRotationWorthyError(err);
  }

  /**
   * Returns the error message describing why rotation is happening.
   */
  rotationReason(err) {
    return String(err?.message || err);
  }
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

function isLocalFlag() {
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
  // Update or insert the env var in frontend/.env
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

  const finalText = newLines.join("\n") + (newLines.length ? "\n" : "");
  await writeFile(FRONTEND_ENV, finalText, "utf-8");
}

function printExhaustedWarning() {
  console.log();
  console.log(
    chalk.yellow(
      "[compress-images] All provided TinyPNG API keys are invalid or exhausted (Free tier: 500 images/mo per key).",
    ),
  );
  console.log(
    chalk.yellow(
      "[compress-images] Get free API keys at: https://tinypng.com/developers",
    ),
  );
}

function printMissingKeyWarning() {
  console.log();
  console.log(
    chalk.yellow(
      `[compress-images] No API keys found in ${tinypng.envVar} (frontend/.env).`,
    ),
  );
  console.log(
    chalk.yellow(
      "[compress-images] Get free API keys at: https://tinypng.com/developers",
    ),
  );
}

// ---------------------------------------------------------------------------
// TinyPNG compression path (with mid-batch rotation)
// ---------------------------------------------------------------------------

/**
 * Compresses one image via TinyPNG, using the active key on the rotator.
 * If the request fails and the rotator has more keys, rotates and retries
 * exactly once.
 *
 * @returns {Promise<void>} rejects on permanent failure.
 */
async function compressOneTinypng(imagePath, outputPath, rotator) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await tinifyCompressFileAsync(imagePath, outputPath);
      return;
    } catch (err) {
      lastErr = err;
      if (rotator && rotator.shouldRotate(err) && rotator.rotateNext()) {
        console.log(
          chalk.yellow(
            `[compress-images] Key exhausted mid-batch: ${rotator.rotationReason(err)}. Rotated to next key.`,
          ),
        );
        // retry on next iteration
      } else {
        throw err;
      }
    }
  }
  // unreachable, but for type-safety
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Local Sharp/MozJPEG compression path
// ---------------------------------------------------------------------------

async function compressOneLocal(imagePath, outputPath) {
  const ext = path.extname(imagePath).toLowerCase();
  const img = sharp(imagePath, { failOn: "none" });
  if (ext === ".png") {
    await img.png({ compressionLevel: 9, effort: 10 }).toFile(outputPath);
  } else {
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

async function processImages({ strategy, cache, force, rotator }) {
  const outputDirAbs = path.resolve(rootDir, tinypng.outputDir);
  const imagePaths = await glob(`${tinypng.sourceDir}/**/*.{png,jpg,jpeg}`);

  if (!fs.existsSync(outputDirAbs)) {
    await mkdir(outputDirAbs, { recursive: true });
  }

  const spinner = ora(`[compress-images] (${strategy}) Searching for images...`).start();
  spinner.text = `[compress-images] (${strategy}) Processing ${imagePaths.length} image(s)...`;

  let processed = 0;
  let skipped = 0;
  let permanentFailures = 0;

  for (const relPath of imagePaths) {
    const absPath = path.resolve(rootDir, relPath);
    const outPath = path.join(outputDirAbs, path.basename(relPath));
    const key = relPath; // cache key = source-relative path

    // Hash check
    let hash = null;
    try {
      hash = await hashFile(absPath);
    } catch {
      continue;
    }

    if (!force && cache[key] === hash) {
      skipped++;
      continue;
    }

    try {
      if (strategy === "tinypng") {
        await compressOneTinypng(absPath, outPath, rotator);
      } else {
        await compressOneLocal(absPath, outPath);
      }
      cache[key] = hash;
      processed++;
    } catch (err) {
      permanentFailures++;
      spinner.fail(
        chalk.red(
          `[compress-images] Failed to compress ${path.basename(relPath)}: ${err.message || err}`,
        ),
      );
    }
  }

  await saveCache(cache);
  spinner.stop();

  return { processed, skipped, total: imagePaths.length, permanentFailures };
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

export {
  loadCache,
  saveCache,
  loadEnv,
  getApiKeysNow,
  isRotationWorthyError,
  findFirstValidKey,
  KeyRotator,
};

// ---------------------------------------------------------------------------
// Strategy resolution (tinypng vs local)
// ---------------------------------------------------------------------------

/**
 * Determines the compression strategy:
 *   - "skip"  → caller should exit cleanly
 *   - "tinypng" → use cascade rotation
 *   - "local" → Sharp/MozJPEG fallback
 *
 * Side effects: prints warnings / prompts the user, updates process.env.
 */
async function resolveStrategy() {
  // Honor explicit non-interactive flags first
  if (isSkipFlag()) {
    console.log(chalk.gray("[compress-images] --skip flag: exiting cleanly."));
    return "skip";
  }
  if (isLocalFlag()) {
    if (getApiKeysNow().length > 0) {
      printExhaustedWarning();
    } else {
      printMissingKeyWarning();
    }
    console.log(
      chalk.gray(
        "[compress-images] --local flag: using local Sharp/MozJPEG compression.",
      ),
    );
    return "local";
  }

  // No keys defined at all → prompt (or fall back to local in CI)
  const keys = getApiKeysNow();
  if (keys.length === 0) {
    printMissingKeyWarning();
    if (NON_INTERACTIVE) {
      return "local";
    }
    return await promptForStrategyChoice();
  }

  // Validate keys (cascade); first valid wins
  const firstValid = await findFirstValidKey(keys);
  if (firstValid >= 0) {
    // Active key is now set on tinify
    return "tinypng";
  }

  // All keys failed
  printExhaustedWarning();
  if (NON_INTERACTIVE) {
    return "local";
  }
  return await promptForStrategyChoice();
}

async function promptForStrategyChoice() {
  const choice = await promptForChoice();
  if (choice === "key") {
    const newKey = await promptForKey();
    if (!newKey) {
      console.log(
        chalk.yellow(
          "[compress-images] No key entered. Falling back to local compression.",
        ),
      );
      return "local";
    }
    const newKeys = parseApiKeys(newKey);
    if (newKeys.length === 0) {
      console.log(
        chalk.yellow(
          "[compress-images] No valid keys entered. Falling back to local compression.",
        ),
      );
      return "local";
    }
    await saveKeysToFrontendEnv(newKeys);
    loadEnv();
    // Retry validation
    const firstValid = await findFirstValidKey(getApiKeysNow());
    if (firstValid >= 0) return "tinypng";
    console.log(
      chalk.yellow(
        "[compress-images] Saved keys are not valid. Falling back to local compression.",
      ),
    );
    return "local";
  }
  if (choice === "skip") return "skip";
  return "local";
}

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
    // Use parseApiKeys so a single quoted key still works, but multi-key
    // strings are split.
    const parsed = parseApiKeys(inlineKey);
    process.env[tinypng.envVar] = parsed.join(",");
  }

  const strategy = await resolveStrategy();
  if (strategy === "skip") {
    console.log(
      chalk.gray("[compress-images] Skipping image compression (user choice)."),
    );
    return;
  }

  // Build the rotator only when using TinyPNG
  const rotator =
    strategy === "tinypng"
      ? new KeyRotator(getApiKeysNow(), {
          // The active key was already set by findFirstValidKey in
          // resolveStrategy(). We mirror that index here.
          onKeyUsed: () => {},
        })
      : null;

  // Set the initial active key to the one that already passed validation.
  // (resolveStrategy() → findFirstValidKey() already set it on the
  // tinify global; KeyRotator needs to know the index to rotate forward.)
  if (strategy === "tinypng") {
    // We don't know which index the validator chose from inside resolveStrategy,
    // so find it by matching the active tinify.key against our key list.
    const activeKey = tinify.key;
    const idx = getApiKeysNow().indexOf(activeKey);
    if (idx >= 0) rotator.currentIndex = idx;
  }

  const cache = await loadCache();
  const result = await processImages({ strategy, cache, force: FORCE, rotator });

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
