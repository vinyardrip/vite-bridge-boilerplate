/*!
 * =================================================================================================
 * dev-dashboard.js
 * =================================================================================================
 *
 * Client-side script for /dev-dashboard page (dev-dashboard.njk).
 *
 * Responsibilities (all kept lightweight / vanilla):
 *  1. Page switching: clicking a sidebar entry updates the iframe `src`
 *     and marks the link as the active one.
 *  2. Viewport switching: a <select> lets the developer pick Mobile /
 *     Tablet / Laptop / Desktop / Full Width / Custom. The iframe width is
 *     adjusted accordingly so the preview matches the chosen device.
 *  3. Font fallback toggle: a checkbox switches the iframe's body class to
 *     "fonts-fallback" which the SCSS uses to remap web fonts to system
 *     stacks. The same checkbox on the inspector controls a *local* stack
 *     on the typography sample so CLS / size-adjust alignment can be
 *     compared side-by-side.
 *
 * This file is loaded only by dev-dashboard.njk, NOT by app.js, so it
 * never ships in production builds. Guarded by `typeof document` so the
 * module is safe to import in Node tests.
 *
 * =================================================================================================
 */

if (typeof document === "undefined") {
  // Not in a browser — no-op (kept for parity with other side-effect modules).
} else {
  const root = document.querySelector("[data-dev-dashboard]");
  if (root) init(root);
}

function init(root) {
  const iframe = root.querySelector("[data-preview-iframe]");
  const pageLinks = Array.from(root.querySelectorAll("[data-page-link]"));
  const viewportSelect = root.querySelector("[data-viewport-select]");
  const viewportCustom = root.querySelector("[data-viewport-custom]");
  const viewportMetaEls = Array.from(
    root.querySelectorAll("[data-viewport-meta], [data-viewport-meta-bottom]"),
  );
  const fallbackToggle = root.querySelector("[data-fallback-toggle]");
  const fontStack = root.querySelector("[data-font-stack]");
  const baseFont = root.querySelector("[data-base-font]");
  const boldItalic = root.querySelector("[data-bold-italic]");
  const typoSample = root.querySelector("[data-typo-sample]");

  // ---------------------------------------------------------------------
  // 1. Page switching
  // ---------------------------------------------------------------------
  pageLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const src = link.dataset.src;
      if (!src || !iframe) return;
      iframe.src = src;
      pageLinks.forEach((a) =>
        a.setAttribute(
          "aria-current",
          a === link ? "true" : "false",
        ),
      );
    });
  });

  // ---------------------------------------------------------------------
  // 2. Viewport switching
  // ---------------------------------------------------------------------
  function applyViewport() {
    if (!iframe) return;
    const value = viewportSelect ? viewportSelect.value : "1440";
    if (value === "100%") {
      iframe.style.width = "100%";
    } else if (value === "custom") {
      if (viewportCustom) viewportCustom.hidden = false;
      const px = parseInt(viewportCustom.value, 10);
      if (Number.isFinite(px) && px > 0) {
        iframe.style.width = `${px}px`;
        viewportMetaEls.forEach((el) => (el.textContent = `${px} px`));
      }
      return;
    } else {
      if (viewportCustom) viewportCustom.hidden = true;
      iframe.style.width = `${value}px`;
      viewportMetaEls.forEach((el) => (el.textContent = `${value} px`));
    }
  }

  if (viewportSelect) viewportSelect.addEventListener("change", applyViewport);
  if (viewportCustom) viewportCustom.addEventListener("input", applyViewport);
  applyViewport();

  // ---------------------------------------------------------------------
  // 3. Font fallback toggle (affects the iframe preview)
  // ---------------------------------------------------------------------
  if (fallbackToggle && iframe) {
    fallbackToggle.addEventListener("change", () => {
      // Send a postMessage to the iframe to toggle its own body class.
      try {
        iframe.contentWindow.postMessage(
          { type: "dev-dash-font-fallback", enabled: fallbackToggle.checked },
          "*",
        );
      } catch (err) {
        // Cross-origin iframes can throw — fall back to the data-attr approach
        // (the iframe page's own init script handles the message).
      }
    });
  }

  // ---------------------------------------------------------------------
  // 4. Inspector: local typography sample (does NOT affect iframe)
  // ---------------------------------------------------------------------
  function applyLocalStack() {
    if (!typoSample) return;
    const mode = fontStack ? fontStack.value : "web";
    if (mode === "web") {
      // Match the real fonts the build configures (see templates.js)
      typoSample.style.setProperty(
        "--sample-font-body",
        '"JetBrains Mono", "Courier New", monospace',
      );
      typoSample.style.setProperty(
        "--sample-font-headings",
        'Oswald, Arial, sans-serif',
      );
    } else {
      // System fallback only — measure CLS / size-adjust alignment
      typoSample.style.setProperty(
        "--sample-font-body",
        'monospace',
      );
      typoSample.style.setProperty(
        "--sample-font-headings",
        'sans-serif',
      );
    }
  }
  function applyBaseFont() {
    if (!typoSample) return;
    const family = baseFont ? baseFont.value : "JetBrains Mono";
    // Quote the value if it contains spaces, leave monospace/sans-serif/serif unquoted.
    const needsQuotes = /\s/.test(family) && !/^(monospace|sans-serif|serif)$/.test(family);
    const formatted = needsQuotes ? `"${family}"` : family;
    typoSample.style.setProperty("--sample-font-body", formatted);
  }
  function applyBoldItalic() {
    if (!typoSample || !boldItalic) return;
    const show = boldItalic.checked;
    typoSample.querySelectorAll("[data-bold-row], [data-italic-row]").forEach((el) => {
      el.style.display = show ? "" : "none";
    });
  }

  if (fontStack) fontStack.addEventListener("change", applyLocalStack);
  if (baseFont) baseFont.addEventListener("change", applyBaseFont);
  if (boldItalic) boldItalic.addEventListener("change", applyBoldItalic);

  applyLocalStack();
  applyBaseFont();
  applyBoldItalic();
}
