# tests/frontend/

Tests that exercise the **frontend** part of the project (UI, build output,
asset generation, Playwright E2E scenarios).

- `unit/`   — JS/SCSS/HTML unit tests
- `e2e/`    — Playwright end-to-end scenarios
  - `picture-transform.spec.js` — verifies `<picture>` tag generation per target
  - `smoke.spec.ts` — production-build smoke tests (assets, manifest, preview server)
