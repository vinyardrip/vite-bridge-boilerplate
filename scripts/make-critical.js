/*!
 * =================================================================================================
 * make-critical.js
 * =================================================================================================
 *
 * Critical CSS inlining. Runs after `pnpm build` and rewrites every emitted
 * HTML file so that above-the-fold CSS is inlined into <style> tags inside
 * <head> and the original <link rel="stylesheet"> becomes a non-blocking
 * preload-style link (`media="print" onload="this.media='all'"`) with a
 * <noscript> fallback.
 *
 * This version uses Playwright (chromium) directly instead of Puppeteer:
 *   1. Spin up a local HTTP server on 127.0.0.1 with a random port that
 *      serves the build target. This gives a real http:// context, which is
 *      required for pages that use <script type="module"> and relative
 *      ./asset paths — a `file://` URL would fail because Chromium refuses to
 *      load ES module imports from a `file://` origin.
 *   2. Launch Playwright chromium once, then for each HTML file:
 *        a. Open a new page at http://127.0.0.1:PORT/<file>
 *        b. Start CSS coverage on the page (Playwright wraps the DevTools
 *           Protocol API).
 *        c. Wait for the page to be in a stable state.
 *        d. Stop coverage, intersect it with the actual CSS file, and inline
 *           the used rules into a <style> tag in <head>.
 *   3. Close the browser + server.
 *
 * No Puppeteer binary download is required — Playwright uses the chromium
 * binary already installed by `pnpm exec playwright install` (used by the
 * e2e tests). If the browser is not installed, the script fails with a
 * clear actionable error.
 *
 * Usage:
 *   pnpm build                            # runs as part of the build pipeline
 *   pnpm build:critical                   # standalone
 *   node scripts/make-critical.js -h      # help
 *   node scripts/make-critical.js --skip  # bypass inlining
 *
 * =================================================================================================
 */

import { glob } from "glob";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { chromium } from "playwright";

import { resolveBuildTarget } from "./build-target.js";
import { wantsHelp, printHelp } from "./_help.js";

// ---------------------------------------------------------------------------
// CLI: -h / --help / --skip
// ---------------------------------------------------------------------------

if (wantsHelp()) {
  printHelp(
    "make-critical",
    "Inline above-the-fold Critical CSS into emitted HTML using Playwright Chromium.",
    [
      ["--skip",       "Skip Critical CSS inlining (exit cleanly without modifying HTML)."],
      ["-h, --help",   "Show this help message and exit."],
    ],
    [
      "pnpm build",
      "pnpm build:critical",
    ],
  );
  process.exit(0);
}

// Resolve the build target directory (dist/ for static, <slug>/assets/ for CMS).
const distPath = resolveBuildTarget().dir;

// ---------------------------------------------------------------------------
// Local HTTP server
// ---------------------------------------------------------------------------

/**
 * Start a tiny HTTP server that serves static files from `root`.
 * Resolves once the server is bound. Returns { url, port, close }.
 */
function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const filePath = path.join(
          root,
          urlPath === "/" ? "index.html" : urlPath,
        );

        const resolved = path.resolve(filePath);
        const rootAbs = path.resolve(root);
        if (!resolved.startsWith(rootAbs)) {
          res.writeHead(403, { "Content-Type": "text/plain" });
          res.end("Forbidden");
          return;
        }
        if (!existsSync(resolved)) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
          return;
        }

        const ext = path.extname(resolved).toLowerCase();
        const mime = {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".mjs": "application/javascript; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".avif": "image/avif",
          ".svg": "image/svg+xml",
          ".woff": "font/woff",
          ".woff2": "font/woff2",
          ".ico": "image/x-icon",
          ".txt": "text/plain; charset=utf-8",
        }[ext] || "application/octet-stream";

        const data = await readFile(resolved);
        res.writeHead(200, {
          "Content-Type": mime,
          "Content-Length": data.length,
        });
        res.end(data);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Internal error: ${err.message}`);
      }
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        close: () =>
          new Promise((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// CSS coverage → critical rules
// ---------------------------------------------------------------------------

/**
 * Compute the set of CSS rules used during the first paint at a given
 * viewport. Uses Playwright's coverage API (which wraps CDP).
 *
 * @param {import('playwright').Page} page
 * @param {{ width: number, height: number }} viewport
 * @returns {Promise<{ inline: string, byHref: Map<string, string> }>}
 *          inline — the combined CSS string to inject into <style>
 *          byHref — map of stylesheet URL → its used portion (unused
 *                   CSS is left in the file for non-blocking load)
 */
async function collectCriticalCss(page, viewport, url) {
  // Playwright's CSS coverage API has a quirk: it only captures stylesheets
  // that are loaded AFTER coverage is started AND the page navigates. The
  // recipe is:
  //   1. Navigate to the URL (or to about:blank first if the page is fresh).
  //   2. Start coverage.
  //   3. page.reload() — this forces the stylesheet to be re-loaded and
  //      captured by the coverage tracker.
  //   4. Wait for load, then stop coverage.
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  // Initial navigation (no coverage yet)
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  } catch {
    // Ignore — we'll retry via reload below
  }

  // Start CSS coverage
  await page.coverage.startCSSCoverage({
    resetOnNavigation: false,
  });

  // Force a reload so the stylesheet is loaded while coverage is active
  try {
    await page.reload({ waitUntil: "load", timeout: 30_000 });
  } catch (err) {
    // If reload fails, we have no coverage to report — return empty.
    await page.coverage.stopCSSCoverage().catch(() => {});
    return { inline: "", byHref: new Map() };
  }

  // Wait for the page to settle. networkidle with a short timeout is enough
  // for critical CSS extraction (we don't wait for full idle, which would
  // catch below-the-fold content too).
  try {
    await page.waitForLoadState("networkidle", { timeout: 5_000 });
  } catch {
    // networkidle often times out on pages with persistent connections
  }

  const entries = await page.coverage.stopCSSCoverage();

  // For each covered entry, intersect used ranges with the original text.
  // We keep the original file (with optional trim later) for non-blocking
  // load, and emit only the *used* subset into the inline <style> tag.
  // NOTE: Playwright's CSS coverage returns the stylesheet text in
  // `entry.text` (not `entry.source`).
  const byHref = new Map();
  const used = new Map();

  for (const entry of entries) {
    const eurl = entry.url || "";
    if (!eurl || eurl.startsWith("data:") || eurl.startsWith("blob:")) continue;
    const text = entry.text || entry.source || "";
    if (!text) continue;
    const inline = extractUsedRanges(text, entry.ranges || []);
    if (inline.trim().length > 0) {
      byHref.set(eurl, text);
      used.set(eurl, inline);
    }
  }

  // Also pull the content of any <style> tags that the page rendered. Those
  // are typically framework-injected critical styles. We extract them via
  // page.evaluate and add them to the inline output.
  const inlineStyleContents = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent || "")
      .filter((s) => s.trim().length > 0)
      .join("\n");
  });

  const combined =
    Array.from(used.values()).join("\n") +
    (inlineStyleContents ? "\n" + inlineStyleContents : "");

  return { inline: combined, byHref };
}

/**
 * Returns the union of all used byte ranges in `text` as a new string.
 * Ranges are merged if they overlap, preserving order.
 *
 * @param {string} text - the full source CSS
 * @param {Array<{start:number, end:number}>} ranges - non-overlapping
 *        ranges from Playwright (it returns them in document order)
 * @returns {string}
 */
function extractUsedRanges(text, ranges) {
  if (!ranges || ranges.length === 0) return "";
  // Sort by start
  const sorted = ranges
    .map((r) => ({ start: Math.max(0, r.start | 0), end: Math.max(0, r.end | 0) }))
    .sort((a, b) => a.start - b.start);
  // Merge overlapping / adjacent ranges
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  // Slice text per merged range
  let out = "";
  for (const m of merged) {
    out += text.slice(m.start, m.end);
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML rewriting — inline <style> + non-blocking <link>
// ---------------------------------------------------------------------------

/**
 * Rewrites the given HTML so that:
 *  - All <link rel="stylesheet" href="..."> for the given hrefs are
 *    converted to `media="print" onload="this.media='all'"` (the standard
 *    non-blocking CSS pattern), with a <noscript> fallback.
 *  - A <style> block with the inlined critical CSS is inserted into <head>
 *    (right after the existing <meta> tags).
 *
 * @param {string} html
 * @param {string} criticalCss
 * @param {Set<string>} stylesheetHrefs - hrefs that were inlined (from CSS coverage)
 * @returns {string}
 */
function rewriteHtml(html, criticalCss, stylesheetHrefs) {
  // 1. Replace <link rel="stylesheet" href="X"> for X in stylesheetHrefs
  //    with the non-blocking variant + <noscript> fallback.
  let out = html;
  for (const href of stylesheetHrefs) {
    // Escape the href for use in a regex (basic — hrefs come from the
    // local server, so they should be safe ASCII).
    const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `<link\\s+[^>]*rel=["']stylesheet["'][^>]*href=["']${escaped}["'][^>]*>`,
      "i",
    );
    out = out.replace(re, (tag) => {
      // Strip the closing /> and add non-blocking attrs
      const stripped = tag.replace(/\/?>$/, "");
      const noscriptHref = href;
      return (
        `${stripped} media="print" onload="this.media='all'">` +
        `\n    <noscript><link rel="stylesheet" href="${noscriptHref}"></noscript>`
      );
    });
  }

  // 2. Insert the inline <style> at the end of <head> (or just before </head>).
  if (criticalCss && criticalCss.trim().length > 0) {
    const styleTag = `<style>${criticalCss}</style>`;
    if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, `  ${styleTag}\n  </head>`);
    } else {
      // Fallback: prepend to the document
      out = `${styleTag}\n${out}`;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  if (process.argv.includes("--skip")) {
    console.log(
      chalk.gray(
        "[make-critical] --skip flag: skipping Critical CSS inlining.",
      ),
    );
    return;
  }

  if (!existsSync(distPath)) {
    console.error(
      chalk.red(
        `[make-critical] Error: build target directory not found at ${distPath}. Run 'pnpm build' first.`,
      ),
    );
    process.exit(1);
  }

  const htmlFiles = await glob("**/*.html", { cwd: distPath });
  if (htmlFiles.length === 0) {
    console.log(
      chalk.gray(
        `[make-critical] Info: No HTML files found in ${distPath}. Skipping Critical CSS.`,
      ),
    );
    return;
  }

  // Start local HTTP server.
  let serverInfo;
  try {
    serverInfo = await startStaticServer(distPath);
  } catch (err) {
    console.error(
      chalk.red("[make-critical] Error: failed to start local HTTP server."),
    );
    console.error(err.stack || err);
    process.exit(1);
  }

  // Launch Playwright chromium.
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  } catch (err) {
    await serverInfo.close();
    const msg = String(err?.message || err);
    if (/Executable doesn't exist|browser was not found/i.test(msg)) {
      console.error(
        chalk.red(
          "[make-critical] Error: Playwright Chromium binary not found.",
        ),
      );
      console.error(
        chalk.red(
          "  Install it with: pnpm exec playwright install chromium",
        ),
      );
      console.error(
        chalk.red(
          "  Or re-run with --skip to bypass Critical CSS inlining.",
        ),
      );
    } else {
      console.error(chalk.red("[make-critical] Error: failed to launch Chromium."));
      console.error(err.stack || err);
    }
    process.exit(1);
  }

  console.log(
    chalk.gray(
      `[make-critical] Local server: ${serverInfo.url} (serving ${distPath})`,
    ),
  );

  const viewports = [
    { width: 1300, height: 900 },  // desktop
    { width: 414, height: 896 },   // mobile
  ];

  let successCount = 0;
  let failureCount = 0;

  try {
    for (const rel of htmlFiles) {
      const filePath = path.join(distPath, rel);
      const fileUrl = `${serverInfo.url}/${rel.replace(/\\/g, "/")}`;

      if (process.env.VERBOSE) {
        console.log(`[make-critical] Processing: ${rel}`);
      }

      const context = await browser.newContext();

      try {
        // Collect critical CSS at each viewport using a fresh page so
        // coverage starts cleanly per viewport.
        const allInline = new Set();
        const allHrefs = new Set();

        for (const viewport of viewports) {
          const vpPage = await context.newPage();
          try {
            const result = await collectCriticalCss(vpPage, viewport, fileUrl);
            if (result.inline) {
              result.inline
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .forEach((rule) => allInline.add(rule));
            }
            for (const href of result.byHref.keys()) {
              allHrefs.add(href);
            }
          } catch (err) {
            if (process.env.VERBOSE) {
              console.error(
                chalk.gray(
                  `[make-critical] viewport ${viewport.width}x${viewport.height} failed for ${rel}:`,
                ),
                err.message || err,
              );
            }
          } finally {
            await vpPage.close();
          }
        }

        // Read the original HTML and rewrite it.
        const original = await readFile(filePath, "utf-8");
        const stylesheetHrefs = new Set();
        for (const href of allHrefs) {
          // Only consider local http urls (skip CDN/external)
          if (href.startsWith(serverInfo.url)) {
            // Convert absolute URL → relative path matching what the HTML
            // references (e.g. "http://127.0.0.1:PORT/css/app.css" → "./css/app.css")
            let rel = href.slice(serverInfo.url.length);
            if (rel.startsWith("/")) rel = "." + rel;
            stylesheetHrefs.add(rel);
          }
        }

        const criticalCss = Array.from(allInline).join("\n");
        const rewritten = rewriteHtml(original, criticalCss, stylesheetHrefs);

        await writeFile(filePath, rewritten, "utf-8");
        successCount++;

        if (process.env.VERBOSE) {
          console.log(
            chalk.gray(
              `[make-critical] ${rel}: ${allInline.size} CSS rule(s) inlined, ${stylesheetHrefs.size} stylesheet(s) marked non-blocking`,
            ),
          );
        }
      } catch (err) {
        failureCount++;
        console.error(chalk.red(`[make-critical] Failed to process ${rel}:`));
        console.error(err.stack || err);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await serverInfo.close();
  }

  if (failureCount > 0) {
    console.error(
      chalk.red(
        `[make-critical] Error: ${failureCount} HTML file(s) failed Critical CSS inlining.`,
      ),
    );
    process.exit(1);
  }

  console.log(
    chalk.green(
      `[make-critical] Done: Critical CSS inlined for ${successCount} HTML file(s).`,
    ),
  );
}

run().catch((err) => {
  console.error(chalk.red("[make-critical] Fatal error:"));
  console.error(err.stack || err);
  process.exit(1);
});
