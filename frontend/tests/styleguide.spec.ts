/**
 * =================================================================================================
 * styleguide.spec.js
 * =================================================================================================
 *
 * Проверки страницы-документации UI-кита (styleguide.html):
 * открывается без ошибок консоли, все разделы документации на месте
 * и содержат живые примеры компонентов.
 *
 * Styleguide — dev-only страница (DEV_ONLY_PAGES в vite.config.ts, в dist
 * не собирается), поэтому прогоняется против dev-сервера — проект
 * "styleguide-dev" в playwright.config.ts.
 *
 * =================================================================================================
 */
import { test, expect } from '@playwright/test';

test.describe('Styleguide (живая документация UI-кита)', () => {
  test('страница открывается с корректным заголовком', async ({ page }) => {
    await page.goto('/styleguide.html');
    await expect(page).toHaveTitle(/Styleguide \| Vite Bridge Boilerplate/);
    await expect(page.locator('.sg-hero__title')).toHaveText('Styleguide');
  });

  test('все разделы документации присутствуют', async ({ page }) => {
    await page.goto('/styleguide.html');

    for (const sectionId of ['sg-start', 'sg-colors', 'sg-typography', 'sg-buttons', 'sg-fields', 'sg-cards']) {
      await expect(page.locator(`#${sectionId}`), `раздел #${sectionId}`).toBeAttached();
    }

    // Навигация ссылается на все разделы
    await expect(page.locator('.sg-nav__link')).toHaveCount(6);
  });

  test('разделы содержат живой пример и блок с кодом', async ({ page }) => {
    await page.goto('/styleguide.html');

    const sectionsWithDemo = ['sg-buttons', 'sg-fields', 'sg-cards'];
    for (const sectionId of sectionsWithDemo) {
      const section = page.locator(`#${sectionId}`);
      await expect(section.locator('.sg-code'), `${sectionId}: блок кода`).toBeAttached();
      // У раздела кнопок две площадки (варианты + размеры)
      await expect(section.locator('.sg-demo'), `${sectionId}: демо-площадка`).not.toHaveCount(0);
    }
  });

  test('кнопки в демо имеют модификаторы .btn--*', async ({ page }) => {
    await page.goto('/styleguide.html');

    const buttonsSection = page.locator('#sg-buttons');
    await expect(buttonsSection.locator('button.btn.btn--primary')).not.toHaveCount(0);
    await expect(buttonsSection.locator('button.btn.btn--secondary')).toHaveCount(1);
    await expect(buttonsSection.locator('button.btn.btn--outline')).not.toHaveCount(0);
    await expect(buttonsSection.locator('button.btn.btn--ghost')).not.toHaveCount(0);
    await expect(buttonsSection.locator('button.btn[disabled]')).toHaveCount(1);
  });

  test('поля ввода в демо используют классы UI-кита', async ({ page }) => {
    await page.goto('/styleguide.html');

    const fieldsSection = page.locator('#sg-fields');
    await expect(fieldsSection.locator('.field')).not.toHaveCount(0);
    await expect(fieldsSection.locator('.input')).not.toHaveCount(0);
    await expect(fieldsSection.locator('.textarea')).toHaveCount(1);
    // Демо состояния ошибки показывает и сообщение
    await expect(fieldsSection.locator('.field--error .field__error')).toBeVisible();
  });

  test('карточки в демо выстроены в сетку и прижаты футером вниз', async ({ page }) => {
    await page.goto('/styleguide.html');

    const cardsSection = page.locator('#sg-cards');
    const grid = cardsSection.locator('.sg-demo--grid');
    await expect(grid).toHaveCSS('display', 'grid');
    await expect(cardsSection.locator('.card')).toHaveCount(3);
    await expect(cardsSection.locator('.card__footer')).toHaveCount(2);
  });

  test('палитра показывает карточки-образцы токенов', async ({ page }) => {
    await page.goto('/styleguide.html');

    // 8 токенов из abstracts/_variables.scss
    await expect(page.locator('.sg-swatch')).toHaveCount(8);
    // Образцы ссылаются на CSS-переменные, а не на «магические» цвета
    const accent = page.locator('.sg-swatch__color--accent');
    await expect(accent).toHaveCSS('background-color', 'rgb(0, 145, 234)');
  });

  test('в консоли нет ошибок выполнения', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/styleguide.html');
    await page.waitForLoadState('networkidle');

    expect(pageErrors).toEqual([]);
  });
});
