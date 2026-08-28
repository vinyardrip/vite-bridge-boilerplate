import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

export const rootDir = path.resolve(import.meta.dirname, "..");

// Dynamically derive the project name (used for theme directories)
const projectName = path.basename(rootDir);

// Flexible Target Registry
export const TARGET_MAP = {
  static: path.join(rootDir, "dist"),
  wordpress: path.join(rootDir, "backend", "wp-content", "themes", projectName, "assets"),
  wp: path.join(rootDir, "backend", "wp-content", "themes", projectName, "assets"),
  bitrix: path.join(rootDir, "backend", "local", "templates", projectName, "assets"),
  drupal: path.join(rootDir, "backend", "web", "themes", "custom", projectName, "assets"),
};

export function resolveBuildTarget() {
  let targetKey = "static";
  let source = "default";

  // 1. Check Environment Variable
  const envTarget = (process.env.BUILD_TARGET || "").trim().toLowerCase();
  if (envTarget && TARGET_MAP[envTarget]) {
    targetKey = envTarget;
    source = "ENV";
  } else {
    // 2. Check package.json config
    try {
      const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf-8"));
      const pkgTarget = (pkg.config?.buildTarget || "").trim().toLowerCase();
      if (pkgTarget && TARGET_MAP[pkgTarget]) {
        targetKey = pkgTarget;
        source = "package.json";
      }
    } catch (error) {
      // Graceful pass
    }
  }

  // 3. Fail-Safe Mechanics: Ensure CMS backend exists
  if (targetKey !== "static" && !existsSync(path.join(rootDir, "backend"))) {
    console.warn(
      `[build-target] Warning: Target '${targetKey}' selected, but 'backend/' directory is missing. Falling back to 'static' build mode.`,
    );
    targetKey = "static";
    source = "fail-safe fallback";
  }

  return {
    mode: targetKey,
    dir: TARGET_MAP[targetKey],
    source
  };
}
