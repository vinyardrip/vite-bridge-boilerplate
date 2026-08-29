# tests/scripts/

Unit tests for the **CLI helper scripts** in `scripts/`. Run with
`node --test --test-concurrency=1 tests/scripts/*.test.js`.

- `compress-images.test.js`  — `scripts/compress-images.js` (TinyPNG + Sharp fallback)
- `convert-images.test.js`   — `scripts/convert-images.js` (WebP/AVIF generation)
- `sync-theme.test.js`       — `scripts/sync-theme.js` (WordPress theme sync)
- `config.test.js`           — `scripts/init-project.js` (config wizard) and
                              `scripts/compress-images.js` config helpers
