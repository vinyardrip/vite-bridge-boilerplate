/*!
 * =================================================================================================
 * scripts/plugins/vite-plugin-picture-transform.js
 * =================================================================================================
 *
 * Vite plugin that transforms local <img> tags into <picture> elements with
 * WebP/AVIF <source> tags after the production build completes.
 *
 * Strategy:
 *  1. In `closeBundle` (after all assets are written), scan the output directory
 *     and build a map: image-base-name → hashed output file (e.g. "img1" → "img/img1.feab7a40.webp").
 *  2. For each emitted HTML file, walk through <img> tags (respecting <picture> nesting).
 *  3. If the <img> src points to a local image that has webp/avif siblings in
 *     the output directory, wrap it in a <picture> element.
 *
 * Mode rules:
 *  - "static" mode → <source type="image/avif"> first, then <source type="image/webp">.
 *  - "cms" mode    → ONLY <source type="image/webp">.
 *
 * External images, data URIs, blob URLs, inline SVGs, and tags already
 * inside a <picture> are left untouched.
 *
 * =================================================================================================
 */

import path from "node:path";
import fs from "node:fs";
import { resolveBuildTarget } from "../build-target.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTransformableSrc(src) {
  if (!src) return false;
  return (
    !/^(https?:|\/\/)/i.test(src) &&
    !src.trim().startsWith("data:") &&
    !src.trim().startsWith("blob:") &&
    !/\.svg(\?|$)/i.test(src)
  );
}

/**
 * Scans a directory for image files and builds a map:
 *   baseName (no ext) → { webp?: string, avif?: string, original?: string }
 * where each value is the path as it should appear in the <source srcset>
 * attribute, RELATIVE TO the emitted HTML file. The HTML file sits at the
 * root of the build output, so paths must include the "./" prefix to be
 * resolved correctly by the browser.
 *
 * @param {string} dir - absolute directory to scan (recursive, typically the
 *                       output img/ directory)
 * @returns {Map<string, { webp?: string, avif?: string, original?: string }>}
 */
function buildImageMap(dir) {
  const map = new Map();
  if (!fs.existsSync(dir)) return map;

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) continue;

      // Vite produces files like "img1.8ba3a55b.jpg" — base is everything
      // before the FIRST dot in the basename. e.g. "img1.8ba3a55b.jpg" → "img1".
      const filename = entry.name;
      const firstDot = filename.indexOf(".");
      const base = firstDot > 0 ? filename.slice(0, firstDot) : filename;
      // Store the path relative to the OUT directory (not the scan dir) so
      // the <source srcset> paths in the HTML are correct from the HTML
      // file's location (which is at the out root, not in img/).
      const outDir = path.dirname(dir); // parent of img/
      const rel = path.relative(outDir, full).replace(/\\/g, "/");
      // Prefix with "./" so the HTML resolves the path correctly. Without
      // this, browsers resolve the path relative to the current document's
      // URL, but many build pipelines emit HTML files that need explicit
      // relative URLs to avoid breaking under sub-paths.
      const prefixed = rel.startsWith("./") || rel.startsWith("/")
        ? rel
        : `./${rel}`;
      if (!map.has(base)) map.set(base, {});
      const entry2 = map.get(base);
      if (ext === ".webp") entry2.webp = prefixed;
      else if (ext === ".avif") entry2.avif = prefixed;
      else entry2.original = prefixed;
    }
  };

  walk(dir);
  return map;
}

/**
 * Builds a <picture> element from the original <img> tag and the source
 * (or hashed output) paths to its webp/avif siblings.
 *
 * The paths in `webpFile` / `avifFile` may be:
 *  - dev mode:    absolute paths like "/src/assets/images/img1.webp"
 *  - build mode:  relative-from-html paths like "img/img1.feab7a40.webp"
 *
 * The function uses each path verbatim in the <source srcset> — no "./"
 * prefix is added, so paths like ".//images/img1.webp" never appear.
 *
 * The original <img> `src` attribute is preserved as-is (preserving the
 * .jpg/.png fallback). The browser will use the .avif/.webp <source> if
 * supported, and fall back to the original image otherwise.
 */
function buildPicture(tag, webpFile, avifFile, enableAvif) {
  const attrs = new Map();
  const attrRe = /(\S+)=["']([^"']*)["']|(\S+)=(\S+)/g;
  let m;
  while ((m = attrRe.exec(tag)) !== null) {
    attrs.set(m[1] ?? m[3], m[2] ?? m[4] ?? "");
  }

  attrs.delete("srcset");
  attrs.delete("sizes");
  // DO NOT overwrite the original src — preserve the .jpg/.png fallback
  // for browsers that don't support <picture>.

  const sources = [];
  if (enableAvif && avifFile) {
    sources.push(`  <source type="image/avif" srcset="${avifFile}">`);
  }
  if (webpFile) {
    sources.push(`  <source type="image/webp" srcset="${webpFile}">`);
  }

  const fallbackAttrs = [...attrs.entries()].map(([k, v]) => `${k}="${v}"`).join(" ");

  return `<picture>\n${sources.join("\n")}\n  <img ${fallbackAttrs}>\n</picture>`;
}

/**
 * Transform an HTML string's local <img> tags into <picture> elements.
 *
 * @param {string} html
 * @param {Map} imageMap - map of base-name → { webp, avif, original }
 * @param {boolean} enableAvif
 * @returns {string}
 */
function transformHtml(html, imageMap, enableAvif) {
  let result = "";
  let cursor = 0;
  let pictureDepth = 0;

  const tagRe = /<\/?(picture)\b[^>]*>|<img\b[^>]*>/gs;

  let m;
  while ((m = tagRe.exec(html)) !== null) {
    result += html.slice(cursor, m.index);

    const fullMatch = m[0];
    const tagName = m[1]?.toLowerCase();
    const isImg = /^<img\b/.test(fullMatch);

    if (isImg) {
      // Inside a <picture> — leave as-is
      if (pictureDepth > 0) {
        result += fullMatch;
        cursor = tagRe.lastIndex;
        continue;
      }

      const srcMatch = fullMatch.match(/\bsrc=["']([^"']+)["']/);
      if (!srcMatch) {
        result += fullMatch;
        cursor = tagRe.lastIndex;
        continue;
      }

      const src = srcMatch[1];
      if (!isTransformableSrc(src)) {
        result += fullMatch;
        cursor = tagRe.lastIndex;
        continue;
      }

      // Extract the image base name from the src.
      // Supported formats:
      //   /src/assets/images/img1.jpg      → base = "img1"
      //   ./img/img1.feab7a40.jpg          → base = "img1"
      //   /src/assets/images/heroes/bg.jpg → base = "bg"
      let baseName = null;
      const cleanSrc = src.split(/[?#]/, 1)[0];
      if (cleanSrc.startsWith("/") || cleanSrc.startsWith("./")) {
        const filename = path.basename(cleanSrc);
        const firstDot = filename.indexOf(".");
        baseName = firstDot > 0 ? filename.slice(0, firstDot) : filename;
      }

      if (baseName && imageMap.has(baseName)) {
        const imgs = imageMap.get(baseName);
        if (imgs.webp) {
          const avifFile = enableAvif ? imgs.avif || null : null;
          result += buildPicture(fullMatch, imgs.webp, avifFile, enableAvif);
          cursor = tagRe.lastIndex;
          continue;
        }
      }

      // No transform — leave the original <img>
      result += fullMatch;
    } else if (tagName === "picture") {
      if (fullMatch.startsWith("</")) {
        pictureDepth = Math.max(0, pictureDepth - 1);
      } else {
        pictureDepth++;
      }
      result += fullMatch;
    }

    cursor = tagRe.lastIndex;
  }

  result += html.slice(cursor);
  return result;
}

// ---------------------------------------------------------------------------
// Source-image sibling scanner (for dev mode)
// ---------------------------------------------------------------------------

/**
 * In dev mode the dist/ folder doesn't exist yet, so we scan the source
 * assets directory instead. We check for siblings (foo.webp, foo.avif) for
 * each image referenced in the HTML. Returns the same Map<string, ...>
 * shape as `buildImageMap` but keyed by relative path under the Vite root.
 */
function buildSourceImageMap(sourceDir) {
  const map = new Map();
  if (!fs.existsSync(sourceDir)) return map;

  // Directories to skip when walking the source tree. These are build
  // outputs (TinyPNG cache, generated webp/avif) that should NOT influence
  // the picture-transform map.
  const SKIP_DIRS = new Set(["images-tiny", "node_modules", ".cache"]);

  const walk = (current, relBase) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full, relBase ? `${relBase}/${entry.name}` : entry.name);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) continue;

      const base = path.parse(entry.name).name; // e.g. "img1"
      // Store paths as a /src/assets/...-style absolute path so the dev
      // server can serve them directly. Do NOT prepend "./" here — that
      // was producing broken output like ".//images/img1.webp".
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      const normalizedRel = `/src/assets/${relPath}`.replace(/\\/g, "/");
      // Use the basename (without extension) as the canonical key so all
      // formats (jpg/webp/avif) of the same image share one entry object.
      if (!map.has(base)) {
        map.set(base, { original: null, webp: null, avif: null });
      }
      const entry2 = map.get(base);
      if (ext === ".webp") entry2.webp = normalizedRel;
      else if (ext === ".avif") entry2.avif = normalizedRel;
      else entry2.original = normalizedRel;
      // Also key by the full path for completeness (not currently used)
      map.set("/src/assets/" + relPath.replace(/\\/g, "/"), entry2);
    }
  };

  walk(sourceDir, "");
  return map;
}

// ---------------------------------------------------------------------------
// Vite plugin
// ---------------------------------------------------------------------------

export function pictureTransformPlugin({ sourceRoot: sourceRootOption } = {}) {
  let enableAvif = false;
  let resolvedOutDir = "";
  let resolvedSourceRoot = "";
  let isDev = false;

  return {
    name: "vite-plugin-picture-transform",

    configResolved(config) {
      const { mode: targetMode } = resolveBuildTarget();
      enableAvif = targetMode === "static";
      isDev = config.command === "serve";

      const viteRoot = config.root
        ? path.resolve(process.cwd(), config.root)
        : process.cwd();
      resolvedOutDir = path.isAbsolute(config.build?.outDir ?? "")
        ? config.build.outDir
        : path.resolve(viteRoot, config.build?.outDir ?? "dist");
      resolvedSourceRoot = sourceRootOption
        ? path.resolve(process.cwd(), sourceRootOption)
        : viteRoot;
    },

    /**
     * Dev-mode hook. Runs on every HTML page served by Vite's dev server.
     * Scans the source assets directory for webp/avif siblings of local
     * images and wraps <img> tags in <picture> on the fly.
     *
     * Why this is needed: in dev, the dist/ output directory does not
     * exist yet, so closeBundle (which runs only at build time) is never
     * executed. Without this hook, local <img> tags in the browser are
     * never wrapped in <picture>, and the user only sees the original
     * jpg/png without avif/webp fallbacks.
     */
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!isDev) return html;
        const sourceAssetsDir = path.join(resolvedSourceRoot, "src/assets");
        const imageMap = buildSourceImageMap(sourceAssetsDir);
        if (imageMap.size === 0) return html;
        return transformHtml(html, imageMap, enableAvif);
      },
    },

    /**
     * closeBundle fires after all assets are written to disk and the
     * Vite manifest is available. We scan the dist/img/ directory to
     * build a map of image base names → hashed output files.
     */
    async closeBundle() {
      if (isDev) return; // skip in dev

      // Build the image map from the output directory
      const imgDir = path.join(resolvedOutDir, "img");
      const imageMap = buildImageMap(imgDir);

      if (imageMap.size === 0) return; // nothing to do

      // Process every HTML file
      const htmlFiles = fs
        .readdirSync(resolvedOutDir)
        .filter((f) => f.endsWith(".html"));

      for (const htmlFile of htmlFiles) {
        const htmlPath = path.join(resolvedOutDir, htmlFile);
        const html = fs.readFileSync(htmlPath, "utf-8");
        const transformed = transformHtml(html, imageMap, enableAvif);
        if (transformed !== html) {
          fs.writeFileSync(htmlPath, transformed, "utf-8");
        }
      }
    },
  };
}
