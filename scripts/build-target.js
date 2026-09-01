import path from "node:path";
import { readFileSync, existsSync, mkdirSync } from "node:fs";

export const rootDir = path.resolve(import.meta.dirname, "..");
const repoProjectName = path.basename(rootDir);

/**
 * Returns the CMS theme slug (folder name under wp-content/themes).
 *
 * Priority:
 *   1. process.env.THEME_NAME  (explicit runtime override)
 *   2. project.config.json → themeSlug
 *   3. Repo root folder name (fallback)
 */
function resolveThemeSlug() {
  // 1. Explicit environment override (highest priority)
  const envSlug = (process.env.THEME_NAME || "").trim();
  if (envSlug) return envSlug;

  // 2. project.config.json
  try {
    const cfg = JSON.parse(
      readFileSync(path.join(rootDir, "project.config.json"), "utf-8"),
    );
    const slug = (cfg.themeSlug || "").trim();
    if (slug) return slug;
  } catch {
    // ignore
  }

  // 3. Fallback: repo root directory name (e.g. "vite-bridge-boilerplate")
  return repoProjectName;
}

/**
 * Resolves the output directory for a given target key.
 *
 *   - "static"     → <rootDir>/dist/                              (local sandbox build)
 *   - "wordpress"  → <rootDir>/backend/wp-content/themes/<slug>/assets/
 *   - "wp"         → alias of wordpress
 *   - "bitrix"     → <rootDir>/backend/local/templates/<slug>/assets/
 *   - "drupal"     → <rootDir>/backend/web/themes/custom/<slug>/assets/
 *
 * The WordPress / Bitrix / Drupal paths use the dynamically resolved
 * `themeSlug` for the theme folder name, so the deployed theme is named
 * cleanly (e.g. "vite-bridge-boilerplate") rather than a raw repo name.
 */
function dirForTarget(targetKey, themeSlug) {
  switch (targetKey) {
    case "static":
      return path.join(rootDir, "dist");
    case "wordpress":
    case "wp":
      return path.join(
        rootDir,
        "backend",
        "wp-content",
        "themes",
        themeSlug,
        "assets",
      );
    case "bitrix":
      return path.join(
        rootDir,
        "backend",
        "local",
        "templates",
        themeSlug,
        "assets",
      );
    case "drupal":
      return path.join(
        rootDir,
        "backend",
        "web",
        "themes",
        "custom",
        themeSlug,
        "assets",
      );
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
  return { defaults: { target: "wordpress" } };
}

const _config = loadProjectConfig();
const _themeSlug = resolveThemeSlug();

/**
 * Static map of well-known targets. CMS targets are resolved dynamically via
 * `dirForTarget()` using the resolved themeSlug.
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
 * Resolves the active build target (static / cms) from:
 *  1. BUILD_TARGET env variable
 *  2. project.config.json  → defaults.target
 *  3. package.json        → config.buildTarget
 *
 * The default fallback is "wordpress" (i.e. deploy to the WordPress
 * theme assets directory). This matches the deployment model: a single
 * target output that lands directly in the configured WordPress theme
 * (backend/wp-content/themes/<theme-name>/assets/).
 *
 * @returns {{ mode: string, dir: string, source: string, config: object, themeSlug: string }}
 */
export function resolveBuildTarget() {
  let targetKey = "wordpress";
  let source = "default";

  // 1. ENV wins over everything
  const envTarget = (process.env.BUILD_TARGET || "").trim().toLowerCase();
  if (envTarget && TARGET_MAP[envTarget]) {
    targetKey = envTarget;
    source = "ENV";
  } else if (
    _config.defaults?.target &&
    TARGET_MAP[_config.defaults.target]
  ) {
    // 2. project.config.json
    targetKey = _config.defaults.target;
    source = "project.config.json";
  } else {
    // 3. package.json fallback
    try {
      const pkg = JSON.parse(
        readFileSync(path.join(rootDir, "package.json"), "utf-8"),
      );
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

  const resolvedDir = TARGET_MAP[targetKey];

  // Ensure the destination directory exists so the build doesn't fail
  // when the CMS theme folder hasn't been initialised yet. We mkdir with
  // { recursive: true } so any missing parent segments (e.g. themes/)
  // are created as well.
  try {
    mkdirSync(resolvedDir, { recursive: true });
  } catch (err) {
    // Permission errors or read-only filesystems fall through and surface
    // a clearer error at the actual Vite build step.
    console.warn(
      `[build-target] Warning: could not pre-create ${resolvedDir}: ${err.message}`,
    );
  }

  return {
    mode: targetKey,
    dir: resolvedDir,
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
