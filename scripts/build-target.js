import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

export const rootDir = path.resolve(import.meta.dirname, "..");
const repoProjectName = path.basename(rootDir);

/**
 * Returns the CMS theme slug (folder name under wp-content/themes).
 * Priority: project.config.json → repo folder name (fallback).
 */
function resolveThemeSlug() {
  try {
    const cfg = JSON.parse(readFileSync(path.join(rootDir, "project.config.json"), "utf-8"));
    const slug = (cfg.themeSlug || "").trim();
    if (slug) return slug;
  } catch {
    // ignore
  }
  return repoProjectName;
}

/**
 * Resolves the output directory for a given target key.
 * CMS targets use project.config.json's `themeSlug` for the theme folder name
 * (not the raw repo name) so the WordPress theme is named cleanly.
 */
function dirForTarget(targetKey, themeSlug) {
  switch (targetKey) {
    case "static":
      return path.join(rootDir, "dist");
    case "wordpress":
    case "wp":
      return path.join(rootDir, "backend", "wp-content", "themes", themeSlug, "assets");
    case "bitrix":
      return path.join(rootDir, "backend", "local", "templates", themeSlug, "assets");
    case "drupal":
      return path.join(rootDir, "backend", "web", "themes", "custom", themeSlug, "assets");
    default:
      return path.join(rootDir, "dist");
  }
}

/**
 * Loads and caches project.config.json once per process.
 * @returns {object}
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
const _themeSlug = resolveThemeSlug();

/**
 * Static map of well-known targets. CMS targets are resolved dynamically via
 * `dirForTarget()` using project.config.json's themeSlug.
 */
export const TARGET_MAP = {
  static: dirForTarget("static", _themeSlug),
  wordpress: dirForTarget("wordpress", _themeSlug),
  wp: dirForTarget("wp", _themeSlug),
  bitrix: dirForTarget("bitrix", _themeSlug),
  drupal: dirForTarget("drupal", _themeSlug),
};

export { _themeSlug as themeSlug };

/**
 * Resolves the active build target (static/cms) from:
 *  1. BUILD_TARGET env variable
 *  2. project.config.json  → defaults.target
 *  3. package.json        → config.buildTarget
 *
 * @returns {{ mode: string, dir: string, source: string, config: object, themeSlug: string }}
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
    themeSlug: _themeSlug,
  };
}

/**
 * Returns the effective target mode string ('static' or 'cms').
 * Convenience shorthand for resolveBuildTarget().mode.
 */
export function resolveImageTarget() {
  return resolveBuildTarget().mode;
}
