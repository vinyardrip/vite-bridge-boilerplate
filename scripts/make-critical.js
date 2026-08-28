import { generate } from "critical";
import { glob } from "glob";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveBuildTarget } from "./build-target.js";

// Финальный каталог сборки определяется режимом проекта (см. build-target.js):
// dist/ для статики или assets/ папки темы CMS.
// Скрипт должен запускаться ПОСЛЕ `pnpm build`.
const distPath = resolveBuildTarget().dir;

async function run() {
  try {
    // 1. Find all HTML files in the build folder (CMS theme directory).
    const htmlFiles = await glob("**/*.html", { cwd: distPath });

    if (htmlFiles.length === 0) {
      console.warn(
        "[make-critical] Info: No HTML files found in the build folder. Skipping Critical CSS.",
      );
      return;
    }

    // 2. Process each file and inline its Critical CSS.
    for (const file of htmlFiles) {
      const filePath = path.join(distPath, file);
      if (process.env.VERBOSE) {
        console.log(`[make-critical] Processing: ${file}`);
      }

      const { html } = await generate({
        // Inline the CSS directly into the HTML.
        inline: true,
        // Base path is our build folder.
        base: distPath,
        // Source HTML file.
        src: file,
        // Viewport sizes that define the "above-the-fold" area.
        dimensions: [
          { height: 900, width: 1300 },
          { height: 896, width: 414 },
        ],
        // Skip @font-face rules since fonts load asynchronously.
        ignore: {
          atrule: ["@font-face"],
        },
      });

      // 3. Overwrite the HTML file with the inlined-CSS version.
      await writeFile(filePath, html);
    }

    console.log(
      `[make-critical] Done: Critical CSS inlined for ${htmlFiles.length} HTML file(s).`,
    );
  } catch (error) {
    console.error("[make-critical] Error during Critical CSS generation:");
    console.error(error);
    process.exit(1);
  }
}

run();
