/**
 * =================================================================================================
 * interactive.spec.js
 * =================================================================================================
 *
 * E2E-тесты интерактивных модулей: modals, mobile-menu, accordion,
 * scroll-to-top, video.
 *
 * =================================================================================================
 */
import { test, expect } from '@playwright/test';

test.describe('Модуль modals', () => {
  test('открывает окно по data-modal-trigger', async ({ page }) => {
    await page.goto('/');

    await page.click('[data-modal-trigger="thanks"]');

    const overlay = page.locator('#overlay');
    await expect(overlay).toHaveClass(/overlay-active/);
    await expect(overlay).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('[data-modal-window="thanks"]')).toBeVisible();
  });

  test('закрывает окно по Escape и разблокирует скролл', async ({ page }) => {
    await page.goto('/');

    await page.click('[data-modal-trigger="thanks"]');
    await expect(page.locator('#overlay')).toHaveClass(/overlay-active/);
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

    await page.keyboard.press('Escape');

    await expect(page.locator('#overlay')).not.toHaveClass(/overlay-active/);
    await expect(page.locator('#overlay')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });

  test('закрывает окно по клику на оверлей', async ({ page }) => {
    await page.goto('/');

    await page.click('[data-modal-trigger="policy"]');
    await expect(page.locator('#overlay')).toHaveClass(/overlay-active/);

    // Клик по самой подложке (не по окну)
    await page.locator('#overlay').click({ position: { x: 5, y: 5 } });

    await expect(page.locator('#overlay')).not.toHaveClass(/overlay-active/);
  });

  test('закрывает окно по кнопке data-modal-close', async ({ page }) => {
    await page.goto('/');

    await page.click('[data-modal-trigger="thanks"]');
    await expect(page.locator('#overlay')).toHaveClass(/overlay-active/);

    await page.click('[data-modal-close]');

    await expect(page.locator('#overlay')).not.toHaveClass(/overlay-active/);
  });
});

test.describe('Модуль mobile-menu', () => {
  test('переключает .active и aria-expanded по клику', async ({ page }) => {
    // Бургер существует только в мобильном брейкпоинте (<=940px):
    // на десктопе он скрыт, поэтому тест гоняем в мобильном вьюпорте
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const menu = page.locator('.menu');
    const button = menu.locator('.menu__btn');

    await expect(menu).not.toHaveClass(/active/);
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await button.click();
    await expect(menu).toHaveClass(/active/);
    await expect(button).toHaveAttribute('aria-expanded', 'true');

    await button.click();
    await expect(menu).not.toHaveClass(/active/);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Модуль accordion', () => {
  test('открывает один элемент и закрывает остальные', async ({ page }) => {
    await page.goto('/');

    const buttons = page.locator('.accordion__btn');
    await expect(buttons).toHaveCount(2);

    // Первый открыт по умолчанию (aria-expanded="true" в разметке)
    await expect(buttons.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(buttons.nth(1)).toHaveAttribute('aria-expanded', 'false');

    // Клик по второму: он открывается, первый закрывается
    await buttons.nth(1).click();
    await expect(buttons.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(buttons.nth(0)).toHaveAttribute('aria-expanded', 'false');

    // Повторный клик по открытому — закрывает его
    await buttons.nth(1).click();
    await expect(buttons.nth(1)).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Модуль scroll-to-top', () => {
  test('появляется после прокрутки и скроллит наверх по клику', async ({ page }) => {
    await page.goto('/');

    const button = page.locator('#scroll-to-top');
    await expect(button).toBeHidden();

    // Прокручиваем ниже порога 500px
    await page.evaluate(() => window.scrollTo(0, 800));
    await expect(button).toHaveClass(/btn-entrance/, { timeout: 3000 });

    await button.click();

    // После плавного скролла (750ms) страница вернулась наверх,
    // а кнопка корректно спряталась (класс btn-exit)
    await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 3000 });
    await expect(button).toHaveClass(/btn-exit/, { timeout: 3000 });
  });
});

test.describe('Модуль video', () => {
  test('заменяет превью на iframe YouTube по клику', async ({ page }) => {
    await page.goto('/');

    const video = page.locator('.video[data-video-id]');
    const link = video.locator('.video__link');

    // До клика: ссылка на месте, iframe нет
    await expect(link).toBeAttached();
    await expect(video.locator('iframe')).toHaveCount(0);

    await video.click();

    // После клика: превью удалено, iframe с autopl подставлен
    await expect(link).toHaveCount(0);
    const iframe = video.locator('iframe.video__media');
    await expect(iframe).toHaveCount(1);
    await expect(iframe).toHaveAttribute(
      'src',
      /youtube\.com\/embed\/xD5RyFonLSE\?rel=0&showinfo=0&autoplay=1/,
    );
  });
});
