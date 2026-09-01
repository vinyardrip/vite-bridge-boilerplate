/*!
 * =================================================================================================
 * dev-dashboard.js
 * =================================================================================================
 *
 * Client-side script for /dev-dashboard page (dev-dashboard.njk).
 *
 * Responsibilities (all kept lightweight / vanilla):
 *
 *   1. Page discovery (Vite import.meta.glob):
 *      Auto-discover all *.njk pages under src/views/pages/ (excluding
 *      this dev-dashboard itself) and render them as a clickable list
 *      inside the left sidebar's "Pages" tab. Clicking a list item
 *      loads the page in the iframe and marks the link as active.
 *
 *   2. Viewport switching:
 *      A <select> lets the developer pick Mobile / Tablet / Laptop /
 *      Desktop / Full Width / Custom. The iframe width is adjusted
 *      accordingly so the preview matches the chosen device. The
 *      "Custom" option reveals a styled number input that respects the
 *      dashboard's dark-UI tokens. The current width is shown in a
 *      small indicator badge next to the select.
 *
 *   3. Tab switching:
 *      Two tabs in the left sidebar — "Pages" and "Typography & Fonts".
 *      Only one tab panel is visible at a time, switched via
 *      `aria-selected` on the tab buttons and `hidden` on the panels.
 *
 *   4. Font & fallback inspector:
 *      - Font stack toggle (web fonts / system fallback)
 *      - Base font selector
 *      - Bold/italic rows toggle
 *      - Active font family display (updates when stack/font changes
 *        so the developer can see exactly which stack is in effect —
 *        e.g. "JetBrains Mono" or "Arial (Fallback Mode)")
 *
 * This file is loaded only by dev-dashboard.njk, NOT by app.js, so it
 * never ships in production builds. Guarded by `typeof document` so the
 * module is safe to import in Node tests.
 *
 * =================================================================================================
 */

// ---------------------------------------------------------------------------
// Page discovery via Vite's import.meta.glob. At dev time Vite resolves
// this to a map of { '/src/views/pages/foo.njk': () => import(...) }
// for every matching file. We use the keys to derive the page list.
// ---------------------------------------------------------------------------

const pageModules = import.meta.glob("/src/views/pages/*.njk");

// Convert a .njk path to a URL path. Mirrors what vite-plugin-njk-frontmatter
// does in its dev-server middleware:
//   "src/views/pages/index.njk"     → "/"
//   "src/views/pages/foo.njk"       → "/foo.html"
//   "src/views/pages/dev-dashboard.njk" → excluded (service page)
function njkModulePathToUrl(modPath) {
  const rel = modPath.replace(/^\/?src\/views\/pages\//, "").replace(/\.njk$/, "");
  if (rel === "index" || rel.endsWith("/index")) {
    return rel === "index" ? "/" : rel.replace(/\/index$/, "/");
  }
  return `/${rel}.html`;
}

// Convert a URL path to a human-readable name. Falls back to the slug.
function prettifyName(p) {
  const slug = (p.replace(/^\//, "").replace(/\.html$/, "").replace(/\/$/, "") || "index");
  const text = slug
    .split(/[-_\/]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  return text || "Index";
}

const SKIP_NAMES = new Set(["dev-dashboard"]);

function buildPageList() {
  const items = [];
  for (const modPath of Object.keys(pageModules)) {
    const base = modPath.replace(/^.*\//, "").replace(/\.njk$/, "");
    if (SKIP_NAMES.has(base)) continue;
    const url = njkModulePathToUrl(modPath);
    items.push({
      slug: base,
      name: prettifyName(url),
      path: url,
    });
  }
  items.sort((a, b) => a.path.localeCompare(b.path));
  return items;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

if (typeof document === "undefined") {
  // Not in a browser — no-op (kept for parity with other side-effect modules).
} else {
  const root = document.querySelector("[data-dev-dashboard]");
  if (root) init(root);
}

function init(root) {
  // ----- Element refs -----
  const tabs = Array.from(root.querySelectorAll("[data-tab]"));
  const panels = Array.from(root.querySelectorAll("[data-panel]"));
  const pageList = root.querySelector("[data-page-list]");
  const pagesEmpty = root.querySelector("[data-pages-empty]");
  const iframe = root.querySelector("[data-preview-iframe]");
  const viewportSelect = root.querySelector("[data-viewport-select]");
  const viewportCustom = root.querySelector("[data-viewport-custom]");
  const viewportIndicator = root.querySelector("[data-viewport-indicator]");
  const fallbackToggle = root.querySelector("[data-fallback-toggle]");
  const fontStack = root.querySelector("[data-font-stack]");
  const baseFont = root.querySelector("[data-base-font]");
  const boldItalic = root.querySelector("[data-bold-italic]");
  const typoSample = root.querySelector("[data-typo-sample]");
  const activeFontName = root.querySelector("[data-active-font-name]");
  const activeFontHint = root.querySelector("[data-active-font-hint]");

  // =====================================================================
  // 1. Tab switching
  // =====================================================================
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) =>
        t.setAttribute("aria-selected", t === tab ? "true" : "false"),
      );
      panels.forEach((p) => {
        const match = p.dataset.panel === target;
        p.hidden = !match;
      });
    });
  });

  // =====================================================================
  // 2. Page list (auto-discovered)
  // =====================================================================
  const pages = buildPageList();
  if (pageList) {
    if (pages.length === 0) {
      if (pagesEmpty) pagesEmpty.hidden = false;
    } else {
      // Clear placeholder, then render each page as a clickable item.
      pageList.innerHTML = "";
      pages.forEach((page) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "#";
        a.className = "dev-dash__page-link";
        a.dataset.src = page.path;
        a.setAttribute("aria-current", "false");
        a.textContent = page.name;
        const slug = document.createElement("span");
        slug.className = "dev-dash__page-link-slug";
        slug.textContent = page.path;
        a.appendChild(slug);
        a.addEventListener("click", (e) => {
          e.preventDefault();
          if (iframe) iframe.src = page.path;
          pageList
            .querySelectorAll("[data-src]")
            .forEach((el) =>
              el.setAttribute(
                "aria-current",
                el === a ? "true" : "false",
              ),
            );
        });
        li.appendChild(a);
        pageList.appendChild(li);
      });
    }
  }

  // =====================================================================
  // 3. Viewport switching
  //
  // Implementation notes:
  //  - When the user selects "Custom…", the number input is revealed and
  //    auto-focused exactly once (so the cursor lands at the end, ready to
  //    type a fresh width). We do NOT call .select() on every keystroke
  //    because that would replace all subsequent characters the user types.
  //  - We update the iframe width on every "input" event so the developer
  //    sees the preview resize live as they type. We only mutate
  //    iframe.style.width and the indicator text — we never touch the
  //    input element's value, so the cursor and selection are preserved.
  //  - The Enter key applies the final value and is also useful for
  //    committing (some browsers re-format the value on Enter).
  // =====================================================================
  function applyCustomWidth() {
    if (!iframe) return;
    const px = parseInt(viewportCustom?.value, 10);
    if (Number.isFinite(px) && px > 0) {
      iframe.style.width = `${px}px`;
      if (viewportIndicator) viewportIndicator.textContent = `${px} px`;
    } else {
      if (viewportIndicator) viewportIndicator.textContent = "Custom…";
    }
  }

  function applyViewport({ initial = false } = {}) {
    if (!iframe) return;
    const value = viewportSelect ? viewportSelect.value : "1440";
    if (value === "100%") {
      // Stretch to the full width of the available central preview
      // container. The iframe wrapper centers it.
      iframe.style.width = "100%";
      if (viewportIndicator) viewportIndicator.textContent = "100%";
      if (viewportCustom) viewportCustom.hidden = true;
    } else if (value === "custom") {
      if (viewportCustom) {
        viewportCustom.hidden = false;
        // Auto-focus the custom input exactly once when entering custom
        // mode, so the user can type a fresh value. The select() call
        // pre-selects any pre-existing text so the first keystroke
        // replaces it (which is the natural "type a new value" intent).
        // We only do this on the initial transition into custom mode —
        // we never touch selection on subsequent input events.
        if (initial) {
          viewportCustom.focus();
          viewportCustom.select();
        }
      }
      applyCustomWidth();
    } else {
      if (viewportCustom) viewportCustom.hidden = true;
      iframe.style.width = `${value}px`;
      if (viewportIndicator) viewportIndicator.textContent = `${value} px`;
    }
  }

  if (viewportSelect) {
    viewportSelect.addEventListener("change", () => applyViewport({ initial: true }));
  }
  if (viewportCustom) {
    // Live preview as the user types — but DO NOT touch cursor / selection
    // by reading the value, NOT re-setting it. This is the key fix for
    // the "second character overwrites" bug.
    viewportCustom.addEventListener("input", applyCustomWidth);
    // Pressing Enter in the custom input also applies
    viewportCustom.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyCustomWidth();
        viewportCustom.blur();
      }
    });
    // blur/change also commits the value (useful for tabbing out)
    viewportCustom.addEventListener("change", applyCustomWidth);
    viewportCustom.addEventListener("blur", applyCustomWidth);
  }
  applyViewport({ initial: true });

  // =====================================================================
  // 4. Font fallback toggle (postMessage to iframe)
  // =====================================================================
  if (fallbackToggle && iframe) {
    fallbackToggle.addEventListener("change", () => {
      try {
        iframe.contentWindow.postMessage(
          { type: "dev-dash-font-fallback", enabled: fallbackToggle.checked },
          "*",
        );
      } catch (_err) {
        // Cross-origin iframes can throw — silent fallback.
      }
    });
  }

  // =====================================================================
  // 5. Inspector: font stack, base font, bold/italic
  //    Updates the local typography sample's CSS variables and the
  //    "Active font" display so the developer sees the exact stack
  //    currently in effect.
  // =====================================================================

  // The default web-font stacks mirror what templates.js configures.
  const WEB_STACKS = {
    body: '"JetBrains Mono", "Courier New", monospace',
    headings: 'Oswald, Arial, sans-serif',
  };
  const FALLBACK_STACKS = {
    body: 'monospace',
    headings: 'sans-serif',
  };

  function currentStacks() {
    const stack = fontStack ? fontStack.value : "web";
    return stack === "web" ? WEB_STACKS : FALLBACK_STACKS;
  }

  function applyBaseFont() {
    if (!typoSample) return;
    const family = baseFont ? baseFont.value : "JetBrains Mono";
    // Quote values with whitespace; leave generic families unquoted.
    const needsQuotes =
      /\s/.test(family) && !/^(monospace|sans-serif|serif)$/.test(family);
    const formatted = needsQuotes ? `"${family}"` : family;
    typoSample.style.setProperty("--sample-font-body", formatted);
    updateActiveFontDisplay();
  }

  function applyLocalStack() {
    if (!typoSample) return;
    const stacks = currentStacks();
    typoSample.style.setProperty("--sample-font-body", stacks.body);
    typoSample.style.setProperty("--sample-font-headings", stacks.headings);
    updateActiveFontDisplay();
  }

  function applyBoldItalic() {
    if (!typoSample || !boldItalic) return;
    const show = boldItalic.checked;
    typoSample.querySelectorAll("[data-bold-row], [data-italic-row]").forEach((el) => {
      el.style.display = show ? "" : "none";
    });
  }

  function updateActiveFontDisplay() {
    if (!typoSample) return;
    // Compute the resolved family in the sample — read from the actual
    // <p> child if present, otherwise just show the configured value.
    const sampleP = typoSample.querySelector("p");
    const stackMode = fontStack ? fontStack.value : "web";
    const familyValue = baseFont ? baseFont.value : "JetBrains Mono";

    if (stackMode === "fallback") {
      // Show fallback font name (e.g. sans-serif / Arial) instead of the
      // primary web font, per the spec.
      if (activeFontName) {
        activeFontName.textContent = resolveFallbackName(familyValue);
      }
      if (activeFontHint) {
        activeFontHint.textContent = "Fallback Mode — system stack only";
      }
    } else {
      if (activeFontName) activeFontName.textContent = familyValue;
      if (activeFontHint) activeFontHint.textContent = "Web fonts (current build)";
    }
  }

  /**
   * Map a primary web font name to a sensible fallback family for display
   * when the user switches to "Fallback Mode". E.g. "JetBrains Mono" → monospace.
   */
  function resolveFallbackName(family) {
    if (/Mono|mono/i.test(family)) return "monospace";
    if (/SC$|serif/i.test(family)) return "serif";
    if (/Oswald|sans/i.test(family)) return "sans-serif";
    return "system-ui, sans-serif";
  }

  if (fontStack) fontStack.addEventListener("change", applyLocalStack);
  if (baseFont) baseFont.addEventListener("change", applyBaseFont);
  if (boldItalic) boldItalic.addEventListener("change", applyBoldItalic);

  applyLocalStack();
  applyBaseFont();
  applyBoldItalic();
}
