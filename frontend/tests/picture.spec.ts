/**
 * =================================================================================================
 * picture.spec.js
 * =================================================================================================
 *
 * Image-пайплайн: разметку <picture> собирает макрос ui.picture()
 * (frontend/src/views/macros/_ui.njk → фильтр smartPicture →
 * pictureHtml плагина smart-assets) по исходнику frontend/raw/boiler-demo.jpg.
 *
 * Проверяется собранная версия (pnpm preview): разметка <picture> в демо-секции
 * #images, атрибуты <img>, доступность вариантов по путям из манифеста
 * (assets/img/boiler-demo.<hash>.* — имена хешированные) и то, что браузер
 * реально выбирает AVIF-источник.
 *
 * =================================================================================================
 */
import { test, expect } from '@playwright/test';

/** Хешированное имя варианта: assets/img/boiler-demo.<hash>[@2x].<fmt>. */
const VARIANT_RE = /^assets\/img\/boiler-demo\.[0-9a-f]{8}(@2x)?\.(avif|webp|jpg) (1x|2x)$/;

test.describe('Image-пайплайн: <picture> на главной', () => {
  test('img обернут в picture с AVIF- и WebP-источниками', async ({ page }) => {
    await page.goto('/');

    const picture = page.locator('.showcase picture');
    await expect(picture).toBeAttached();

    // AVIF — первый source (браузер берет первый поддерживаемый формат),
    // WebP — второй. Пути относительные (base: './'), в srcset — retina-пара
    // 1x/2x с контентными хешами (порядок вариантов — как в манифесте).
    // getAttribute вернет null только если source пропал — expect ниже упадет с понятным сообщением.
    const avifSrcset = (await picture.locator('source[type="image/avif"]').getAttribute('srcset')) ?? '';
    const webpSrcset = (await picture.locator('source[type="image/webp"]').getAttribute('srcset')) ?? '';

    for (const entry of avifSrcset.split(', ')) {
      expect(entry, `avif-вариант: ${entry}`).toMatch(VARIANT_RE);
    }
    for (const entry of webpSrcset.split(', ')) {
      expect(entry, `webp-вариант: ${entry}`).toMatch(VARIANT_RE);
    }
    expect(avifSrcset).toContain('@2x.avif 2x');
    expect(avifSrcset).toContain('.avif 1x');
    expect(webpSrcset).toContain('@2x.webp 2x');
    expect(webpSrcset).toContain('.webp 1x');
    for (const srcset of [avifSrcset, webpSrcset] as string[]) {
      expect(srcset.startsWith('/'), 'пути к вариантам должны быть относительными').toBe(false);
    }
  });

  test('img внутри picture сохранил класс, alt и размеры 1x', async ({ page }) => {
    await page.goto('/');

    const img = page.locator('.showcase picture img');
    await expect(img).toHaveClass(/showcase__img/);
    await expect(img).toHaveAttribute('alt', /Абстрактный пейзаж/);
    await expect(img).toHaveAttribute('loading', 'lazy');
    await expect(img).toHaveAttribute('decoding', 'async');
    // Размеры 1x из манифеста (исходник 1600×900 = 2x) — анти-CLS.
    await expect(img).toHaveAttribute('width', '800');
    await expect(img).toHaveAttribute('height', '450');
  });

  test('AVIF и WebP варианты реально отдаются сервером', async ({ request, page }) => {
    await page.goto('/');

    // Пути хешированные — берем реальные URL прямо из srcset собранной страницы.
    const avifSrcset = await page
      .locator('.showcase source[type="image/avif"]')
      .getAttribute('srcset');
    const webp2x = await page
      .locator('.showcase source[type="image/webp"]')
      .getAttribute('srcset');

    const avifSrcsetAll = (avifSrcset ?? '').split(', ');
    const webp2xAll = (webp2x ?? '').split(', ');
    const avifUrl = avifSrcsetAll.find((entry) => entry.includes('.avif 1x'));
    const webpUrl = webp2xAll.find((entry) => entry.includes('@2x.webp 2x'));
    expect(avifUrl, 'avif 1x найден в srcset').toBeTruthy();
    expect(webpUrl, 'webp 2x найден в srcset').toBeTruthy();

    const avif = await request.get(avifUrl!.split(' ')[0]);
    expect(avif.status()).toBe(200);
    expect(avif.headers()['content-type']).toContain('image/avif');

    const webp = await request.get(webpUrl!.split(' ')[0]);
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
      const currentSrc = await img.evaluate((el) => (el as HTMLImageElement).currentSrc);
      expect(currentSrc).toContain('.avif');
    }).toPass();
  });
});
