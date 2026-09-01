/**
 * =================================================================================================
 * detect-formats.js
 * =================================================================================================
 *
 * Asynchronously detects browser support for modern image formats (WebP and
 * AVIF) and applies corresponding CSS classes (`webp`, `avif`) to the
 * `<html>` element. This lets CSS background-image mixins such as
 * `@mixin bg-responsive(...)` serve the right format per browser:
 *
 *   .webp .hero { background-image: url(/img/hero.webp); }
 *   .avif .hero { background-image: url(/img/hero.avif); }
 *
 * The checks run immediately on module load (no `DOMContentLoaded` wait)
 * so the `<html>` class is set as early as possible — well before any
 * first-paint CSS that depends on these classes.
 *
 * Data URIs are tiny 1×1 transparent images for each format. If the
 * browser can decode the data URI, the format is supported.
 *
 * Exports:
 *   - WEBP_DATA_URI / AVIF_DATA_URI : the test data URIs (for reuse)
 *   - probeFormat(dataUri)          : probe helper (returns Promise<bool>)
 *   - applySupportedClasses()       : run the detection and apply classes
 *
 * Side effect:
 *   - The module is intended to be imported for its side effect:
 *     `import './modules/detect-formats.js';`
 *     The side effect only runs in a browser environment (when `document`
 *     exists) so importing the module in Node tests is safe.
 *
 * =================================================================================================
 */

// Minimal 1×1 transparent WebP (lossless)
export const WEBP_DATA_URI =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJZQCdAEO/gbsAAA=";

// Minimal 1×1 AVIF (10 bytes)
export const AVIF_DATA_URI =
  "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=";

/**
 * Probe whether the browser can decode `dataUri`. Returns a Promise that
 * resolves to `true` on success and `false` on any error.
 *
 * We use a fresh `Image()` per probe to avoid races (some browsers share
 * decode cache between Image instances, which can mask a failing format).
 */
export function probeFormat(dataUri) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    // `.src =` fires the decode asynchronously; the promise settles on the
    // first onload/onerror event.
    img.src = dataUri;
  });
}

/**
 * Run all format probes in parallel and apply the corresponding class
 * to <html> for every supported format. Failures are silent — the
 * browser simply won't get the class, and the SCSS fallbacks (default
 * <picture> source or original image URL) will apply.
 */
export async function applySupportedClasses() {
  if (typeof document === "undefined") return; // not in a browser
  const html = document.documentElement;
  const [webp, avif] = await Promise.all([
    probeFormat(WEBP_DATA_URI),
    probeFormat(AVIF_DATA_URI),
  ]);
  if (webp) html.classList.add("webp");
  if (avif) html.classList.add("avif");
}

// Side effect: only run the detection in a browser environment.
if (typeof document !== "undefined") {
  // Fire-and-forget. The promise is intentionally not awaited at the
  // module level so the import side-effect returns immediately and doesn't
  // block the rest of app.js from loading.
  applySupportedClasses();
}
