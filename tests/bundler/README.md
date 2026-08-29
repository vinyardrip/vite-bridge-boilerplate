# tests/bundler/

Unit tests for the **Vite plugins and build-output helpers** in
`scripts/plugins/`. These test pure-function helpers (HTML transforms, asset
path patterns, hashing) without spinning up a full Vite dev server.

- `html-inject.test.js`        — `scripts/plugins/vite-html-asset-inject.js` helpers
- `picture-transform.test.js`  — `scripts/plugins/vite-plugin-picture-transform.js` helpers
