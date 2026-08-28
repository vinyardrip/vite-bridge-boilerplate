import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

export const rootDir = path.resolve(import.meta.dirname, "..");

const projectName = path.basename(rootDir);

export const TARGET_MAP = {
  static: path.join(rootDir, "dist"),
  wordpress: path.join(rootDir, "backend", "wp-content", "themes", projectName, "assets"),
  wp: path.join(rootDir, "backend", "wp-content", "themes", projectName, "assets"),
  bitrix: path.join(rootDir, "backend", "local", "templates", projectName, "assets"),
  drupal: path.join(rootDir, "backend", "web", "themes", "custom", projectName, "assets"),
};

/**
 * Loads and caches project.config.json once per process.
 * @returns {{ target: string, imageProcessing: object }}
 */
function loadProjectConfig() {
  try {
    const configPath = path.join(rootDir, "project.config.json");
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, "utf-8"));
    }
  } catch {
    // Graceful pass — use defaults below
  }
  return { defaults: { target: "static" } };
}

const _config = loadProjectConfig();

/**
 * Resolves the active build target (static/cms) from:
 *  1. BUILD_TARGET env variable
 *  2. project.config.json  → defaults.target
 *  3. package.json        → config.buildTarget
 *
 * @returns {{ mode: string, dir: string, source: string, config: object }}
 */
export function resolveBuildTarget() {
  let targetKey = "static";
  let source = "default";

  // 1. ENV wins over everything
  const envTarget = (process.env.BUILD_TARGET || "").trim().toLowerCase();
  if (envTarget && TARGET_MAP[envTarget]) {
    targetKey = envTarget;
    source = "ENV";
  } else if (_config.defaults?.target && TARGET_MAP[_config.defaults.target]) {
    // 2. project.config.json
    targetKey = _config.defaults.target;
    source = "project.config.json";
  } else {
    // 3. package.json fallback
    try {
      const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf-8"));
      const pkgTarget = (pkg.config?.buildTarget || "").trim().toLowerCase();
      if (pkgTarget && TARGET_MAP[pkgTarget]) {
        targetKey = pkgTarget;
        source = "package.json";
      }
    } catch {
      // Graceful pass
    }
  }

  // Fail-safe: CMS target requires a backend/ directory
  if (targetKey !== "static" && !existsSync(path.join(rootDir, "backend"))) {
    console.warn(
      `[build-target] Warning: Target '${targetKey}' selected, but 'backend/' directory is missing. Falling back to 'static'.`,
    );
    targetKey = "static";
    source = "fail-safe fallback";
  }

  return {
    mode: targetKey,
    dir: TARGET_MAP[targetKey],
    source,
    config: _config,
  };
}

/**
 * Returns the effective target mode string ('static' or 'cms').
 * Convenience shorthand for resolveBuildTarget().mode.
 */
export function resolveImageTarget() {
  return resolveBuildTarget().mode;
}
