/**
 * =================================================================================================
 * picture.spec.js
 * =================================================================================================
 *
 * Image-пайплайн: чистый <img> в Nunjucks при сборке оборачивается в
 * <picture> с AVIF/WebP-источниками (image-optimize + img-to-picture
 * через обертку njkImgToPicture в vite.config.js).
 *
 * Проверяется собранная версия (pnpm preview): разметка <picture>,
 * атрибуты обернутого <img>, доступность вариантов по относительным
 * путям и то, что браузер реально выбирает AVIF-источник.
 *
 * =================================================================================================
 */
import { test, expect } from '@playwright/test';

test.describe('Image-пайплайн: <picture> на главной', () => {
  test('img обернут в picture с AVIF- и WebP-источниками', async ({ page }) => {
    await page.goto('/');

    const picture = page.locator('.showcase picture');
    await expect(picture).toBeAttached();

    // AVIF — первый source (браузер берет первый поддерживаемый формат),
    // WebP — второй. Пути относительные (base: './'), 1x/2x — retina-пара.
    const avifSrcset = await picture.locator('source[type="image/avif"]').getAttribute('srcset');
    const webpSrcset = await picture.locator('source[type="image/webp"]').getAttribute('srcset');

    expect(avifSrcset).toContain('img/boiler-demo.avif 1x');
    expect(avifSrcset).toContain('img/boiler-demo@2x.avif 2x');
    expect(webpSrcset).toContain('img/boiler-demo.webp 1x');
    expect(webpSrcset).toContain('img/boiler-demo@2x.webp 2x');
    for (const srcset of [avifSrcset, webpSrcset]) {
      expect(srcset.startsWith('/'), 'пути к вариантам должны быть относительными').toBe(false);
    }
  });

  test('обернутый img сохранил класс, alt и корректный aspect', async ({ page }) => {
    await page.goto('/');

    const img = page.locator('.showcase picture img');
    await expect(img).toHaveClass(/showcase__img/);
    await expect(img).toHaveAttribute('alt', /Абстрактный пейзаж/);
    await expect(img).toHaveAttribute('loading', 'lazy');
    await expect(img).toHaveAttribute('decoding', 'async');
    // height починен по реальному аспекту исходника (16:9) — плагин без
    // обертки писал бы height=width (см. njkImgToPicture в vite.config.js)
    await expect(img).toHaveAttribute('width', '800');
    await expect(img).toHaveAttribute('height', '450');
  });

  test('AVIF и WebP варианты реально отдаются сервером', async ({ request }) => {
    const avif = await request.get('img/boiler-demo.avif');
    expect(avif.status()).toBe(200);
    expect(avif.headers()['content-type']).toContain('image/avif');

    const webp = await request.get('img/boiler-demo@2x.webp');
    expect(webp.status()).toBe(200);
    expect(webp.headers()['content-type']).toContain('image/webp');
  });

  test('браузер реально выбирает AVIF-источник из picture', async ({ page }) => {
    await page.goto('/');

    // Картинка loading="lazy" и ниже первого экрана: скроллим и ждем,
    // пока браузер выберет и начнет грузить источник.
    await page.locator('.showcase').scrollIntoViewIfNeeded();
    const img = page.locator('.showcase picture img');
    await expect(async () => {
      const currentSrc = await img.evaluate((el) => el.currentSrc);
      expect(currentSrc).toContain('.avif');
    }).toPass();
  });
});
