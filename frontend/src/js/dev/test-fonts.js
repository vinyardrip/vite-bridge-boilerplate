/*!
 * =================================================================================================
 * font-tester.js
 * =================================================================================================
 *
 * Модуль для диагностики загрузки веб-шрифтов.
 * Экспортирует одну функцию initFontTester, которая находит все тестовые карточки
 * на странице и запускает для них проверку.
 *
 * Этот модуль предназначен ТОЛЬКО для режима разработки и будет исключен
 * из финальной сборки с помощью условного импорта в app.js.
 *
 * =================================================================================================
 */

/**
 * Проверяет, загружен ли конкретный шрифт.
 * Использует FontFaceSet API (document.fonts.check).
 *
 * @param {string} family - Название font-family.
 * @param {string} weight - Значение font-weight.
 * @param {string} style - Значение font-style.
 * @returns {boolean} - true, если шрифт загружен, иначе false.
 */
const isFontLoaded = (family, weight, style) => {
  // Формируем строку для проверки, например: "bold 700 16px 'Spectral SC'"
  // Размер шрифта (16px) здесь не важен, но синтаксис его требует.
  const fontCheckString = `${style} ${weight} 16px "${family}"`;

  try {
    // document.fonts.check() - это современный и надежный способ
    // проверить, доступен ли шрифт для рендеринга.
    return document.fonts.check(fontCheckString);
  } catch (e) {
    console.error("Ошибка при проверке шрифта:", e);
    return false;
  }
};

/**
 * Находит все тестовые карточки на странице и запускает для них проверку.
 * @param {HTMLElement} container - DOM-элемент, в котором находятся карточки.
 */
export const initFontTester = (container) => {
  const cards = container.querySelectorAll(".font-test-card");

  if (cards.length === 0) {
    return;
  }

  // document.fonts.ready - это промис, который выполняется,
  // когда все шрифты, указанные в CSS, завершили загрузку (или загрузка провалилась).
  // Мы ждем этого события, чтобы наши тесты были максимально точными.
  document.fonts.ready.then(() => {
    cards.forEach((card) => {
      const { family, weight, style } = card.dataset;
      const statusElement = card.querySelector("[data-status]");

      if (!family || !weight || !style || !statusElement) {
        return;
      }

      const loaded = isFontLoaded(family, weight, style);

      if (loaded) {
        statusElement.dataset.status = "success";
        statusElement.textContent = "Успешно";
      } else {
        statusElement.dataset.status = "error";
        statusElement.textContent = "Ошибка";
      }
    });
  });
};
