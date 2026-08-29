/*!
 * =================================================================================================
 * init-project.js
 * =================================================================================================
 *
 * Interactive project setup wizard. Prompts the developer for:
 *  1. Project type  (Landing Page / static vs WordPress / CMS)
 *  2. Theme slug    (WordPress / CMS theme folder name, defaults to "my-theme")
 *  3. PWA integration (Service Workers / Web Manifest)
 *
 * Saves all answers into project.config.json at the repo root — the single
 * source of truth for the rest of the build pipeline.
 *
 * Usage:
 *   pnpm init:project
 *   node scripts/init-project.js
 *
 * Non-interactive mode (for CI / scripted setup):
 *   node scripts/init-project.js --target=cms --theme=my-theme --pwa=false
 *   node scripts/init-project.js --target=static --pwa=true
 *
 * =================================================================================================
 */

import readline from "node:readline";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";

import { rootDir } from "./build-target.js";

const CONFIG_PATH = path.join(rootDir, "project.config.json");

// ---------------------------------------------------------------------------
// Argv parsing (so the wizard can also be run non-interactively)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 0) {
        out[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else if (i + 1 < argv.length) {
        out[arg.slice(2)] = argv[++i];
      }
    }
  }
  return out;
}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

// ---------------------------------------------------------------------------
// readline helper
// ---------------------------------------------------------------------------

function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question, defaultValue = "") {
  return new Promise((resolve) => {
    const display = defaultValue
      ? `${question} ${chalk.gray(`[${defaultValue}]`)}: `
      : `${question}: `;
    rl.question(display, (answer) => {
      const value = (answer || "").trim();
      resolve(value || defaultValue);
    });
  });
}

function askChoice(rl, question, choices, defaultValue) {
  return new Promise((resolve) => {
    console.log(question);
    for (let i = 0; i < choices.length; i++) {
      const marker = i + 1 === defaultValue ? chalk.green("►") : " ";
      console.log(`  ${marker} ${i + 1}. ${choices[i]}`);
    }
    rl.question(`Choice ${chalk.gray(`[${defaultValue}]`)}: `, (answer) => {
      const trimmed = (answer || "").trim();
      if (!trimmed) {
        resolve(choices[defaultValue - 1]);
        return;
      }
      const num = parseInt(trimmed, 10);
      if (num >= 1 && num <= choices.length) {
        resolve(choices[num - 1]);
        return;
      }
      // Allow typing the raw value
      resolve(trimmed);
    });
  });
}

function askYesNo(rl, question, defaultValue) {
  const def = defaultValue ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`${question} ${chalk.gray(`[${def}]`)}: `, (answer) => {
      const trimmed = (answer || "").trim().toLowerCase();
      if (!trimmed) return resolve(defaultValue);
      if (trimmed === "y" || trimmed === "yes") return resolve(true);
      if (trimmed === "n" || trimmed === "no") return resolve(false);
      resolve(defaultValue);
    });
  });
}

// ---------------------------------------------------------------------------
// Config I/O
// ---------------------------------------------------------------------------

function readConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      projectName: "vite-bridge-boilerplate",
      version: "0.0.11",
      themeSlug: "my-theme",
      pwa: true,
      compression: {
        tinypng: {
          enabled: true,
          sourceDir: "frontend/src/assets/images",
          outputDir: "frontend/src/assets/images-tiny",
          cacheFile: "frontend/.tinypng-cache",
          envVar: "TINYPNG_API_KEYS",
        },
      },
      targets: {
        static: {
          description: "Static site build — full image optimization with WebP + AVIF",
          imageProcessing: { webp: true, avif: true, quality: { webp: 80, avif: 75 } },
        },
        cms: {
          description: "CMS/WordPress build — WebP only, AVIF disabled for lightweight builds and hosting safety",
          imageProcessing: { webp: true, avif: false, quality: { webp: 80, avif: 75 } },
        },
      },
      defaults: { target: "static", frontendSourceDir: "frontend/src" },
    };
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

function writeConfig(cfg) {
  // Ensure compression.tinypng exists
  if (!cfg.compression) cfg.compression = {};
  if (!cfg.compression.tinypng) {
    cfg.compression.tinypng = {
      enabled: true,
      sourceDir: "frontend/src/assets/images",
      outputDir: "frontend/src/assets/images-tiny",
      cacheFile: "frontend/.tinypng-cache",
      envVar: "TINYPNG_API_KEYS",
    };
  }
  // Ensure schema URL is present
  if (!cfg["$schema"]) {
    cfg["$schema"] = "https://json-schema.org/draft/2020-12/schema";
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const interactive = isInteractive() && !args.target; // force interactive only when no flags

  console.log(chalk.cyan("╔════════════════════════════════════════════════════════════════╗"));
  console.log(chalk.cyan("║          Vite Bridge Boilerplate — Project Setup Wizard         ║"));
  console.log(chalk.cyan("╚════════════════════════════════════════════════════════════════╝"));
  console.log();

  const existingConfig = readConfig();

  // ----- Prompt 1: Project Type -----
  const projectType = args.target || (
    interactive
      ? await askChoice(
          createRl(),
          chalk.bold("What kind of project are you building?"),
          ["Landing Page (Static)", "WordPress / CMS"],
          existingConfig.defaults?.target === "cms" ? 2 : 1,
        ).finally(() => {})
      : "Landing Page (Static)"
  );
  const target = projectType.toLowerCase().includes("wordpress") || projectType.toLowerCase() === "cms"
    ? "cms"
    : "static";
  console.log(chalk.green(`  ✓ Target: ${target} (${projectType})`));

  // ----- Prompt 2: Theme slug (CMS only) -----
  let themeSlug = args.theme || existingConfig.themeSlug || "my-theme";
  if (target === "cms" && interactive) {
    const rl = createRl();
    themeSlug = await ask(rl, chalk.bold("CMS theme folder name"), themeSlug);
    rl.close();
  }
  // Sanitize slug: lowercase, alnum + hyphens, no leading/trailing hyphens
  themeSlug = themeSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-") || "my-theme";
  console.log(chalk.green(`  ✓ Theme slug: ${themeSlug}`));

  // ----- Prompt 3: PWA integration -----
  // For CMS, PWA defaults to false to avoid WordPress caching/auth issues.
  let pwa;
  if (args.pwa !== undefined) {
    pwa = args.pwa === "true" || args.pwa === "1" || args.pwa === "yes";
  } else if (target === "cms") {
    pwa = false; // default for CMS
  } else {
    pwa = existingConfig.pwa !== false; // default true for static
  }
  if (interactive) {
    const rl = createRl();
    pwa = await askYesNo(rl, chalk.bold("Include PWA (Service Worker / Web Manifest)?"), pwa);
    rl.close();
  }
  console.log(chalk.green(`  ✓ PWA: ${pwa ? "enabled" : "disabled"}`));

  // ----- Save -----
  const cfg = readConfig();
  cfg.themeSlug = themeSlug;
  cfg.pwa = pwa;
  cfg.defaults = cfg.defaults || {};
  cfg.defaults.target = target;

  // Disable AVIF when targeting CMS, regardless of current config
  if (cfg.targets?.cms?.imageProcessing) {
    cfg.targets.cms.imageProcessing.webp = true;
    cfg.targets.cms.imageProcessing.avif = false;
  }
  if (target === "static" && cfg.targets?.static?.imageProcessing) {
    cfg.targets.static.imageProcessing.webp = true;
    cfg.targets.static.imageProcessing.avif = true;
  }

  writeConfig(cfg);

  console.log();
  console.log(chalk.green("✔ Configuration saved to project.config.json"));
  console.log();
  console.log(chalk.bold("Summary:"));
  console.log(`  • Target:        ${chalk.cyan(target)}`);
  console.log(`  • Theme slug:    ${chalk.cyan(themeSlug)}`);
  console.log(`  • PWA:           ${chalk.cyan(pwa ? "enabled" : "disabled")}`);
  console.log(`  • WebP:          ${chalk.cyan("always")}`);
  console.log(`  • AVIF:          ${chalk.cyan(target === "static" ? "static only" : "disabled (cms)")}`);
  console.log();
  console.log(chalk.gray("Run `pnpm build` to verify the pipeline picks up these settings."));
}

main().catch((err) => {
  console.error(chalk.red("[init-project] Error:"));
  console.error(err);
  process.exit(1);
});
