/**
 * =================================================================================================
 * page-smoke.spec.ts
 * =================================================================================================
 *
 * Базовые проверки собранной версии: страницы открываются, разметка на месте,
 * в консоли нет ошибок выполнения.
 *
 * =================================================================================================
 */
import { test, expect } from '@playwright/test';

test.describe('Собранные страницы', () => {
  test('главная страница открывается с корректным заголовком', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Главная \| Vite Bridge Boilerplate/);
    await expect(page.locator('h1')).toContainText('Стартовый шаблон для быстрых статических сайтов');
  });

  test('разметка компонентов присутствует на главной', async ({ page }) => {
    await page.goto('/');

    // Хедер, меню, футер, кнопка наверх, оверлей модалок
    await expect(page.locator('header.header')).toBeAttached();
    await expect(page.locator('.menu')).toBeAttached();
    await expect(page.locator('footer.footer')).toBeAttached();
    await expect(page.locator('#scroll-to-top')).toBeAttached();
    await expect(page.locator('#overlay')).toBeAttached();
    await expect(page.locator('.accordion')).toBeAttached();
    await expect(page.locator('.video[data-video-id]')).toBeAttached();
  });

  test('страница тестирования шрифтов открывается', async ({ page }) => {
    await page.goto('/test-fonts.html');
    await expect(page).toHaveTitle(/Диагностика веб-шрифтов/);
    await expect(page.locator('#font-tester')).toBeAttached();
    // Карточки шрифтов сгенерированы из site.json
    await expect(page.locator('.font-test-card')).toHaveCount(4);
  });

  test('в html присутствует класс no-touch на десктопе', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/no-touch/);
  });

  test('в консоли нет ошибок выполнения', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(pageErrors).toEqual([]);
  });
});
