/*!
 * =================================================================================================
 * test-fonts.js
 * =================================================================================================
 *
 * Dev-only module for diagnosing web font loading.
 * Exports a single initFontTester function that locates all font test cards
 * on the page and runs document.fonts.check() against each one.
 *
 * This module is imported conditionally in app.js (import.meta.env.DEV)
 * and is tree-shaken out of production builds.
 *
 * =================================================================================================
 */

/**
 * Checks whether a specific font face is loaded in the browser.
 *
 * @param {string} family  The font-family name.
 * @param {string} weight  The font-weight value.
 * @param {string} style   The font-style value.
 * @returns {boolean} true when the font is available for rendering.
 */
const isFontLoaded = (family, weight, style) => {
  // Build the check string, e.g. "normal 700 16px 'Spectral SC'".
  // The px size is required by the spec but does not affect the result.
  const fontCheckString = `${style} ${weight} 16px "${family}"`;

  try {
    return document.fonts.check(fontCheckString);
  } catch (e) {
    console.error("[test-fonts] Font check failed:", e);
    return false;
  }
};

/**
 * Finds every .font-test-card on the page and updates its status badge.
 * @param {HTMLElement} container - the #font-tester root element.
 */
export const initFontTester = (container) => {
  const cards = container.querySelectorAll(".font-test-card");

  if (cards.length === 0) {
    return;
  }

  // Wait for all CSS-declared fonts to finish loading (or fail) before
  // running checks, so results are as accurate as possible.
  document.fonts.ready.then(() => {
    cards.forEach((card) => {
      const { family, weight, style } = card.dataset;
      const statusElement = card.querySelector("[data-status]");

      if (!family || !weight || !style || !statusElement) {
        return;
      }

      const loaded = isFontLoaded(family, weight, style);

      if (loaded) {
        statusElement.dataset.status = "success";
        statusElement.textContent = "Loaded";
      } else {
        statusElement.dataset.status = "error";
        statusElement.textContent = "Failed";
      }
    });
  });
};
