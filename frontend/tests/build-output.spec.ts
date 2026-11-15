/**
 * =================================================================================================
 * build-output.spec.js
 * =================================================================================================
 *
 * Проверка собранного dist/ как самостоятельного артефакта:
 * страницы открываются через file:// (двойной клик) СО СТИЛЯМИ.
 *
 * Пути к ассетам в HTML должны быть относительными (base: './' в vite.config.ts).
 *
 * !ВАЖНО: исполняемый JS (type="module") браузеры блокируют на file://
 * (CORS-ограничение ES-модулей) — это нормально. Стили (<link rel=stylesheet>)
 * через file:// загружаются, поэтому рендер проверяем по ним.
 *
 * =================================================================================================
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distIndex = `file://${path.join(projectRoot, 'dist/index.html')}`;

test.describe('dist как самостоятельный артефакт (file://)', () => {
  test('страница открывается через file:// и загружает стили', async ({ page }) => {
    await page.goto(distIndex);

    // Проверка исходного кода страницы: нет абсолютных путей к ассетам,
    // есть относительный <link rel="stylesheet">
    const html = await page.content();
    expect(html).not.toMatch(/(src|href)="\/(css|js)\//);
    expect(html).toMatch(/<link rel="stylesheet" href="css\/app\.[\w-]+\.css">/);
    expect(html).toMatch(/<script type="module" src="js\/app\.[\w-]+\.js"><\/script>/);
  });

  test('стили реально применены: position у кнопки аккордеона', async ({ page }) => {
    await page.goto(distIndex);

    // CSS-таблица реально загружена браузером (styleSheets содержит только
    // УСПЕШНО загруженные таблицы; cssRules не трогаем — на file:// в Chromium
    // доступ к ним блокирован CORS)
    const loadedSheets = await page.evaluate(() =>
      Array.from(document.styleSheets).map((sheet) => sheet.href ?? 'inline'),
    );
    expect(
      loadedSheets.some((href) => href.includes('css/app.')),
      'css/app.*.css загружен через file://',
    ).toBe(true);

    // Стиль из app.scss реально применен к элементу
    // (.accordion__btn { position: relative } — из components/_accordion.scss)
    const accordionBtn = page.locator('.accordion__btn').first();
    await expect(accordionBtn).toHaveCSS('position', 'relative');
  });

  test('favicon подключен относительным путем', async ({ page }) => {
    await page.goto(distIndex);

    // Генератор favicons кладет иконки в assets/favicons/ (frontend/public,
    // см. раздел 9 docs/ASSETS_GUIDE.md): <link rel="icon"> — два тега
    // (ICO-фолбэк + SVG для современных браузеров). Оба пути обязаны быть
    // относительными — иначе file://-открытие потеряет иконку.
    const faviconHrefs = await page
      .locator('link[rel="icon"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')));

    expect(faviconHrefs.length).toBe(2);
    for (const href of faviconHrefs) {
      expect(href, `href="${href}"`).toMatch(/^\.\/assets\/favicons\//);
    }
  });
});
