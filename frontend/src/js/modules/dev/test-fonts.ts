/*!
 * =================================================================================================
 * test-fonts.ts (dev-only)
 * =================================================================================================
 *
 * Модуль диагностики шрифтов для страницы /test-fonts.html.
 *
 * Разделение ответственности:
 *   • ШАБЛОН (test-fonts.njk) рендерит карточки с ДВУМЯ строками сравнения —
 *     «Ожидание» (target: '{{ family }}' + фолбэк, нужный вес/стиль) и
 *     «Результат» (системный фолбэк тем же весом/стилем). Строки статичны
 *     и видны даже без JS — в том числе в собранной test-fonts.html:
 *     njk-страницы рендерятся в обход dev-IIFE app.ts, который в проде
 *     вырезается tree-shaking'ом.
 *   • ЭТОТ модуль подключается только в dev (import.meta.env.DEV в app.ts)
 *     и добавляет статус: после document.fonts.ready проверяет каждую
 *     карточку через document.fonts.check() и ставит бейдж
 *     «Успешно» (data-status="success") / «Ошибка» (data-status="error").
 *
 * !ВАЖНО про check(): для НЕИЗВЕСТНОГО семейства document.fonts.check()
 * возвращает true (граней нет — нечего загружать, браузер рисует фолбэком),
 * поэтому голый '16px "Family"' нельзя считать честной проверкой. Здесь
 * проверка выполняется с весом и стилем карточки
 * ('${style} ${weight} 16px "${family}"') — грань 300 у карточки «Weight: 700»
 * не выдаст ложный «Успешно».
 * =================================================================================================
 */

/**
 * Проверяет, загружена ли конкретная грань шрифта (семейство + вес + стиль).
 * Использует FontFaceSet API (document.fonts.check).
 *
 * @param family  Название font-family.
 * @param weight  Значение font-weight карточки.
 * @param style   Значение font-style карточки.
 * @returns true, если грань доступна для рендеринга.
 */
const isFontLoaded = (
  family: string,
  weight: string,
  style: string,
): boolean => {
  // Строка проверки вида "normal 700 16px 'Spectral SC'".
  // Размер (16px) синтаксисом требуется, на результат не влияет.
  const fontCheckString = `${style} ${weight} 16px "${family}"`;

  try {
    return document.fonts.check(fontCheckString);
  } catch (e) {
    console.error('[test-fonts] Ошибка при проверке шрифта:', e);
    return false;
  }
};

/**
 * Находит все тестовые карточки в контейнере и обновляет их статусы.
 * Статусы выставляются ПОСЛЕ document.fonts.ready — когда все CSS-шрифты
 * завершили загрузку (или провалились), чтобы результат был точным.
 *
 * @param container Корневой элемент #font-tester.
 */
export const initFontTester = (container: HTMLElement): void => {
  const cards = container.querySelectorAll<HTMLElement>('.font-test-card');

  if (cards.length === 0) {
    return;
  }

  document.fonts.ready.then(() => {
    cards.forEach((card) => {
      const { family, weight, style } = card.dataset;
      const statusElement = card.querySelector<HTMLElement>('[data-status]');

      if (!family || !weight || !style || !statusElement) {
        return;
      }

      const loaded = isFontLoaded(family, weight, style);
      statusElement.dataset.status = loaded ? 'success' : 'error';
      statusElement.textContent = loaded ? 'Успешно' : 'Ошибка';
    });
  });
};
