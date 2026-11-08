/**
 * =================================================================================================
 * bg-image.spec.js
 * =================================================================================================
 *
 * CSS-фон через миксин bgset() (abstracts/_mixins.scss): каскад
 * background-image с AVIF/WebP-вариантами и фолбэком-исходником, для
 * Firefox — image-set() с type()-хинтами внутри @-moz-document url-prefix().
 *
 * Проверяется собранная версия (pnpm preview): вычисленный background-image
 * не пуст в обоих браузерах и указывает на реально существующий файл в dist,
 * в Firefox дополнительно срабатывает image-set-хак.
 *
 * =================================================================================================
 */
import { test, expect } from '@playwright/test';

test.describe('bgset: CSS-фон с AVIF/WebP-фолбэками', () => {
  test('вычисленный background-image не пуст и указывает на существующий файл', async ({ page }) => {
    await page.goto('/');

    const bg = page.locator('.test-bg');
    await expect(bg).toBeAttached();

    const computed = await bg.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(computed, 'фон не должен быть none').not.toBe('none');
    expect(computed).toContain('url(');

    // Файл по вычисленному url обязан лежать в dist: битый url фона —
    // пустой блок. Хешированные варианты пишет Vite (bgset → dist/img/).
    const assetUrl = computed.match(/url\("?([^")]+)"?\)/)?.[1];
    expect(assetUrl, 'из background-image извлечен url').toBeTruthy();
    const response = await page.request.get(assetUrl);
    expect(response.status(), `файл фона должен существовать: ${assetUrl}`).toBe(200);
  });

  test('в Firefox применен image-set из @-moz-document url-prefix()', async ({ page }) => {
    await page.goto('/');

    const browserName = page.context().browser()?.browserType().name();
    test.skip(browserName !== 'firefox', 'хак @-moz-document применяется только в Firefox');

    const computed = await page.locator('.test-bg').evaluate(
      (el) => getComputedStyle(el).backgroundImage,
    );
    // Каскадные url() перекрыты последним объявлением — image-set с type()-хинтами.
    expect(computed).toContain('image-set');
    expect(computed).toContain('image/avif');
  });
});
