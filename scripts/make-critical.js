/*!
 * =================================================================================================
 * make-critical.js
 * =================================================================================================
 *
 * Critical CSS inlining. Runs after `pnpm build` and rewrites every emitted
 * HTML file so that the above-the-fold CSS is inlined into <style> tags
 * inside <head> and the original <link rel="stylesheet"> references become
 * non-blocking preload tags.
 *
 *   1. Spins up a local HTTP server on a random port that serves the build
 *      target (dist/ or CMS theme directory). This gives Critical a real
 *      http://127.0.0.1:PORT/ context, which is required for pages that
 *      use <script type="module"> and relative ./asset paths — a `file://`
 *      URL would fail because Puppeteer/Penthouse cannot resolve ES module
 *      imports from relative paths under the file:// origin.
 *   2. Runs `critical.generate()` for each HTML file at the server URL.
 *   3. Writes the inlined HTML back to disk.
 *
 * Failure modes are caught, logged with a stack trace, and exit 1 so the
 * build pipeline stops on a real error.
 *
 * Usage: `node scripts/make-critical.js` (called from `pnpm build`).
 *        Pass `--skip` to bypass critical CSS inlining without erroring.
 *
 * =================================================================================================
 */

import { generate } from "critical";
import { glob } from "glob";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";

import { resolveBuildTarget } from "./build-target.js";
import { wantsHelp, printHelp } from "./_help.js";

// ---------------------------------------------------------------------------
// CLI: -h / --help / --skip
// ---------------------------------------------------------------------------

if (wantsHelp()) {
  printHelp(
    "make-critical",
    "Inline above-the-fold Critical CSS into the emitted HTML using a local HTTP server context.",
    [
      ["--skip",       "Skip Critical CSS inlining (exit cleanly without modifying HTML)."],
      ["-h, --help",   "Show this help message and exit."],
    ],
    [
      "node scripts/make-critical.js",
      "pnpm build && pnpm build:critical   # standalone run",
    ],
  );
  process.exit(0);
}

// Resolve the build target directory (dist/ for static, <slug>/assets/ for CMS).
const distPath = resolveBuildTarget().dir;

// ---------------------------------------------------------------------------
// Local HTTP server — serves distPath on 127.0.0.1 with a random port.
// ---------------------------------------------------------------------------

/**
 * Start a tiny HTTP server that serves static files from `root`. Resolves
 * once the server is bound and listening. Returns { url, close }.
 */
function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        // Normalize URL — strip query/hash, default to index.html
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        let filePath = path.join(root, urlPath === "/" ? "index.html" : urlPath);

        // Prevent path traversal outside the served root
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(root))) {
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
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        url,
        port: addr.port,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => resolveClose());
          }),
      });
    });
  });
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

  // Verify Chrome/Chromium is available before launching puppeteer (via critical).
  // Set PUPPETEER_EXECUTABLE_PATH to point at your Chrome/Chromium binary.
  // If Chrome is not found, print a clear actionable error and exit 1.
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (execPath && !existsSync(execPath)) {
    console.error(
      chalk.red(
        `[make-critical] Error: PUPPETEER_EXECUTABLE_PATH=${execPath} does not exist.`,
      ),
    );
    console.error(
      chalk.red(
        "[make-critical] Either unset PUPPETEER_EXECUTABLE_PATH, install Chrome, or pass --skip.",
      ),
    );
    process.exit(1);
  }
  if (execPath) {
    console.log(
      chalk.gray(
        `[make-critical] Using Chrome at: ${execPath}`,
      ),
    );
  }

  if (!existsSync(distPath)) {
    console.error(
      chalk.red(
        `[make-critical] Error: build target directory not found at ${distPath}. Run 'pnpm build' first.`,
      ),
    );
    process.exit(1);
  }

  // Find all HTML files in the build target.
  const htmlFiles = await glob("**/*.html", { cwd: distPath });
  if (htmlFiles.length === 0) {
    console.log(
      chalk.gray(
        `[make-critical] Info: No HTML files found in ${distPath}. Skipping Critical CSS.`,
      ),
    );
    return;
  }

  // Start the local HTTP server.
  let serverInfo;
  try {
    serverInfo = await startStaticServer(distPath);
  } catch (err) {
    console.error(chalk.red("[make-critical] Error: failed to start local HTTP server."));
    console.error(err.stack || err);
    process.exit(1);
  }

  console.log(
    chalk.gray(
      `[make-critical] Local server: ${serverInfo.url} (serving ${distPath})`,
    ),
  );

  let successCount = 0;
  let failureCount = 0;

  try {
    for (const rel of htmlFiles) {
      const filePath = path.join(distPath, rel);
      const fileUrl = `${serverInfo.url}/${rel.replace(/\\/g, "/")}`;

      if (process.env.VERBOSE) {
        console.log(`[make-critical] Processing: ${rel}`);
      }

      try {
        // inline-critical emits a noisy "Could not parse CSS stylesheet"
        // warning via jsdom's virtualConsole for embedded SVG data URIs.
        // The warning is non-fatal (inline-critical falls back gracefully),
        // but it pollutes the build log. Suppress it for the duration of
        // the generate() call.
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;
        if (!process.env.VERBOSE) {
          console.error = () => {};
          console.warn = () => {};
        }
        let html;
        try {
          const result = await generate({
            // Use HTTP URL (avoids file:// CORS/ESM pitfalls)
            src: fileUrl,
            // Base path is the local server URL — all relative ./css/... and
            // ./js/... references in the HTML resolve through this server.
            base: `${serverInfo.url}/`,
            // Inline critical CSS into <style> tags inside <head>
            inline: true,
            // Two viewports: desktop and mobile
            dimensions: [
              { height: 900, width: 1300 },
              { height: 896, width: 414 },
            ],
            // Don't ship @font-face declarations — fonts load async anyway
            ignore: {
              atrule: ["@font-face"],
            },
            // Don't error on rules missing from the CSS bundle (e.g. fonts)
            strict: false,
            // Penthouse-specific options (timeout goes under penthouse, not
            // the top level).
            penthouse: {
              timeout: 45_000,
            },
            // Use a modern user agent for best CSS support
            userAgent:
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          });
          html = result.html;
        } finally {
          console.error = originalConsoleError;
          console.warn = originalConsoleWarn;
        }

        // Overwrite the HTML file with the inlined version.
        await writeFile(filePath, html, "utf-8");
        successCount++;

        if (process.env.VERBOSE) {
          const styleCount = (html.match(/<style/g) || []).length;
          console.log(
            chalk.gray(
              `[make-critical] ${rel}: inlined (${styleCount} <style> tag(s))`,
            ),
          );
        }
      } catch (err) {
        failureCount++;
        // Detect the common "Chrome not found" puppeteer error and give an
        // actionable hint instead of just dumping a stack trace.
        const msg = String(err?.message || err);
        if (/Could not find Chrome|Could not find Chromium/i.test(msg)) {
          console.error(
            chalk.red(
              `[make-critical] Failed to process ${rel}: Chrome/Chromium binary not found.`,
            ),
          );
          console.error(
            chalk.red(
              "  Set PUPPETEER_EXECUTABLE_PATH=/path/to/chrome, install Chrome,",
            ),
          );
          console.error(
            chalk.red(
              "  or re-run with --skip to bypass Critical CSS inlining.",
            ),
          );
        } else {
          console.error(
            chalk.red(`[make-critical] Failed to process ${rel}:`),
          );
          console.error(err.stack || err);
        }
      }
    }
  } finally {
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
