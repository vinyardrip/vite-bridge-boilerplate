import { test, expect } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const distDir = path.join(repoRoot, "dist");

test.describe("Production build smoke", () => {
  test("dist/index.html loads cleanly via preview server", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status(), "preview server returned non-2xx for /").toBeLessThan(400);

    const html = (await response.text()).toLowerCase();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<html");
  });

  test("dist/manifest.json is a valid JSON file", async () => {
    const manifestPath = path.join(distDir, "manifest.json");
    expect(existsSync(manifestPath), `missing ${manifestPath}`).toBe(true);

    const raw = readFileSync(manifestPath, "utf-8");
    expect(() => JSON.parse(raw), "manifest.json is not valid JSON").not.toThrow();

    const manifest = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(manifest).length, "manifest.json is empty").toBeGreaterThan(0);
  });

  test("dist/ contains CSS and JS assets", async () => {
    const cssDir = path.join(distDir, "css");
    const jsDir = path.join(distDir, "js");
    expect(existsSync(cssDir), `missing ${cssDir}`).toBe(true);
    expect(existsSync(jsDir), `missing ${jsDir}`).toBe(true);

    const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith(".css"));
    const jsFiles = readdirSync(jsDir).filter((f) => f.endsWith(".js"));

    expect(cssFiles.length, "no CSS files emitted in dist/css").toBeGreaterThan(0);
    expect(jsFiles.length, "no JS files emitted in dist/js").toBeGreaterThan(0);
  });

  test("preview server actually serves the built CSS and JS", async ({ request }) => {
    const indexRes = await request.get("/");
    expect(indexRes.status()).toBeLessThan(400);
    const html = await indexRes.text();

    const cssMatch = html.match(/href="(\.?\.?\/)?css\/([^"]+\.css)"/);
    const jsMatch = html.match(/src="(\.?\.?\/)?js\/([^"]+\.js)"/);

    expect(cssMatch, "index.html has no <link href=...css/...>").not.toBeNull();
    expect(jsMatch, "index.html has no <script src=...js/...>").not.toBeNull();

    const cssUrl = cssMatch![0].match(/href="([^"]+)"/)![1];
    const jsUrl = jsMatch![0].match(/src="([^"]+)"/)![1];

    const cssRes = await request.get(cssUrl);
    const jsRes = await request.get(jsUrl);
    expect(cssRes.status(), `CSS asset ${cssUrl} not served`).toBeLessThan(400);
    expect(jsRes.status(), `JS asset ${jsUrl} not served`).toBeLessThan(400);
  });
});
