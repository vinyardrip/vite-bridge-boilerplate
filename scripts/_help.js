/*!
 * =================================================================================================
 * scripts/_help.js
 * =================================================================================================
 *
 * Shared CLI help helper. Provides consistent `-h` / `--help` output across
 * all scripts in scripts/. Each script imports `printHelp` and calls it
 * before any work is done when either flag is present.
 *
 * Usage:
 *   import { printHelp, HELP_FLAG } from "./_help.js";
 *
 *   if (process.argv.includes(HELP_FLAG) || process.argv.includes("--help")) {
 *     printHelp("compress-images", "Compress images via TinyPNG or Sharp.", [
 *       ["--force",            "Bypass the cache."],
 *       ["--local",            "Use local Sharp/MozJPEG instead of TinyPNG."],
 *     ], [
 *       "node scripts/compress-images.js",
 *       "node scripts/compress-images.js --force",
 *     ]);
 *     process.exit(0);
 *   }
 *
 * =================================================================================================
 */

import chalk from "chalk";

export const HELP_FLAG = "-h";
export const HELP_LONG = "--help";

/** Returns true if `-h` or `--help` is present in argv. */
export function wantsHelp(argv = process.argv) {
  return argv.includes(HELP_FLAG) || argv.includes(HELP_LONG);
}

/**
 * Prints a clean, colored CLI help block and returns nothing.
 *
 * @param {string} name        - The script name (e.g. "compress-images").
 * @param {string} description - A one-line description.
 * @param {Array<[string,string]>} options  - [[flag, description], ...]
 * @param {string[]} examples  - Example invocations.
 */
export function printHelp(name, description, options = [], examples = []) {
  const lines = [];
  const bar = "─".repeat(60);

  lines.push("");
  lines.push(chalk.cyan(bar));
  lines.push(`${chalk.bold.cyan(name)}  ${chalk.gray(bar)}`);
  lines.push("");
  lines.push(chalk.white(description));
  lines.push("");

  if (options.length > 0) {
    lines.push(chalk.bold("Options:"));
    const w = Math.max(...options.map(([f]) => f.length), 2);
    for (const [flag, desc] of options) {
      const padded = flag.padEnd(w, " ");
      lines.push(`  ${chalk.cyan(padded)}  ${chalk.gray(desc)}`);
    }
    lines.push("");
  }

  if (examples.length > 0) {
    lines.push(chalk.bold("Examples:"));
    for (const ex of examples) {
      lines.push(`  ${chalk.green("$")} ${chalk.white(ex)}`);
    }
    lines.push("");
  }

  lines.push(chalk.gray("Run with -h or --help to see this message."));
  lines.push(chalk.cyan(bar));
  lines.push("");

  console.log(lines.join("\n"));
}
