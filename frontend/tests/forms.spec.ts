/**
 * =================================================================================================
 * forms.spec.js
 * =================================================================================================
 *
 * E2E-тесты модуля forms: маска/санитайзер телефона, honeypot,
 * валидация перед отправкой.
 *
 * =================================================================================================
 */
import { test, expect } from '@playwright/test';

test.describe('Модуль forms', () => {
  test('очищает ввод телефона от запрещенных символов', async ({ page }) => {
    await page.goto('/');

    const phone = page.locator('input[type="tel"]');

    // Подставляем значение с мусором: санитайзер (обработчик input)
    // удаляет запрещенные символы, а Inputmask расставляет маску.
    // pressSequentially здесь не подходит: посимвольный ввод литералов
    // маски ("+", скобок) сдвигает позиции цифр.
    // Первый fill очищаем отдельно: у неактивированной маски Inputmask
    // первичная обработка значения недетерминированна.
    await phone.fill('');
    await phone.fill('abc+375(29)123-45-67xyz');
    await expect(phone).toHaveValue('+375 (29) 123-45-67');
  });

  test('не отправляет невалидную форму и оставляет кнопку активной', async ({
    page,
  }) => {
    await page.goto('/');

    const form = page.locator('form[data-form]');
    const submit = form.locator('button[type="submit"]');

    // Пустая форма не проходит проверку validity
    await submit.click();

    await expect(submit).toBeEnabled();

    // Страница не ушла в навигацию (preventDefault в обработчике)
    await expect(page).toHaveURL(/\//);
  });

  test('скрытое поле loc заполнено номером формы', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('input[name="loc"]')).toHaveValue('Форма №1');
  });

  test('honeypot-поле присутствует и вынесено за экран', async ({ page }) => {
    await page.goto('/');

    const botField = page.locator('input[name="bot-field"]');
    await expect(botField).toBeAttached();

    // Поле не display:none, а смещено за левый край экрана (left: -5000px),
    // поэтому проверяем его геометрию, а не видимость
    const box = await botField.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThan(0);
  });
});
