/**
 * =================================================================================================
 * svg-inline.spec.js
 * =================================================================================================
 *
 * Inline-SVG: макрос ui.icon() (macros/_ui.njk) через фильтр smartSvg +
 * projectSvg (vite.config.js / vite-plugin-smart-assets) инлайнит
 * нормализованную иконку из frontend/raw в HTML прямо на этапе сборки —
 * без внешнего спрайта и HTTP-запроса.
 *
 * Проверяется собранная версия (pnpm preview) на демо-иконке phone
 * в секции контактов главной: настоящий inline <svg> (без <use>),
 * наследование цвета (currentColor вносит конвейер на нормализации) и
 * aria-атрибуты декоративной иконки.
 *
 * =================================================================================================
 */
import { test, expect } from '@playwright/test';

test.describe('Inline SVG: ui.icon() на главной', () => {
  test('иконка инлайнится в HTML без <use> и наследует цвет', async ({ page }) => {
    await page.goto('/');

    const icon = page.locator('.contacts__svg-demo-icon');
    await expect(icon).toHaveCount(1);
    await expect(icon).toBeVisible();

    // Это настоящий inline <svg> с viewBox исходника, а не ссылка на спрайт
    // через <use>.
    await expect(icon).toHaveAttribute('viewBox', /61\s+61/);
    expect(await icon.locator('use').count()).toBe(0);

    // Цвет наследуется от CSS color: конвейер заменил единственный цвет
    // исходника на currentColor (у контурной phone — stroke), зашитых #hex
    // в разметке не осталось.
    const markup = await icon.evaluate((el) => el.outerHTML);
    expect(markup, 'в inline-разметке должен быть currentColor').toContain(
      'stroke="currentColor"',
    );
    expect(markup, 'в inline-разметке не должно быть зашитых цветов').not.toMatch(
      /(fill|stroke)="#/i,
    );
  });

  test('декоративная иконка скрыта от скринридеров', async ({ page }) => {
    await page.goto('/');

    const icon = page.locator('.contacts__svg-demo-icon');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon).toHaveAttribute('focusable', 'false');
  });
});
