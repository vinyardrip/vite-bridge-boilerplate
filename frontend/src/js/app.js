/*!
 * =================================================================================================
 * app.js
 * =================================================================================================
 *
 * Главный JavaScript-файл проекта. Точка входа для всех скриптов.
 *
 * =================================================================================================
 */
// 1. Импорт основного файла стилей.
// Этот импорт должен быть в самом верху, чтобы Vite мог корректно
// собрать и внедрить CSS в страницу.
import '../scss/app.scss';

// 2. Inline webp/avif detector — runs before DOMContentLoaded to add
// .webp / .avif classes to <html> so CSS background-image mixins work.
(function () {
  const html = document.documentElement;
  const img = new Image();
  img.onload = function () {
    if (img.width > 0 && img.height > 0) html.classList.add('webp');
  };
  img.onerror = function () {
    // WebP not supported — browser will fall back to original images
  };
  img.src =
    'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAQAAAAfQ//73v/+BiOh/AAA=';
})();
/*!
 * =================================================================================================
 * !ВАЖНО: СКРИПТЫ ТОЛЬКО ДЛЯ РАЗРАБОТКИ
 * =================================================================================================
 *
 * Этот блок кода и все импорты внутри него будут выполнены только в режиме
 * разработки (`pnpm dev`) и будут полностью удалены из финальной сборки
 * благодаря `import.meta.env.DEV` и "tree-shaking".
 *
 * IIFE (Immediately Invoked Function Expression) используется для изоляции
 * области видимости, чтобы переменные из этого блока (например, fontTester)
 * не конфликтовали с основным кодом приложения.
 *
 * =================================================================================================
 */
(() => {
  if (import.meta.env.DEV) {
    /*! --- Инициализация тестера шрифтов --- */
    const fontTester = document.querySelector("#font-tester");

    if (fontTester) {
      import("./dev/test-fonts.js").then(({ initFontTester }) => {
        initFontTester(fontTester);
      });
    }

    /*! --- Детектор горизонтального переполнения --- */
    // Загружается динамически ТОЛЬКО в dev-режиме: благодаря import.meta.env.DEV
    // ветка вырезается при сборке, и модуль debug-css-overflow полностью
    // выпадает из production-бандла (tree-shaking).
    import("debug-css-overflow").then(({ initDebugCssOverflow }) => {
      initDebugCssOverflow();
    });
  }
})();

/*!
 * =================================================================================================
 * ОСНОВНОЙ КОД ПРИЛОЖЕНИЯ
 * =================================================================================================
 *
 * Здесь будет находиться ваш основной JavaScript-код, который попадет
 * в финальную сборку.
 *
 * =================================================================================================
 */
// Импорт утилит
import './modules/detect-touch.js';

// Регистрируем SVG-символы в спрайте (vite-plugin-svg-sprite).
// Символы инжектятся в DOM при загрузке и доступны через <use href="#icon-...">.
import '../assets/svg/logo.svg';
// Иконки из папки icons/ (доступны через макрос ui.icon('phone') и т.п.).
import '../assets/icons/phone.svg';

// Импорт модулей компонентов
import { initScrollToTop } from './modules/scroll-to-top.js';
import { initMobileMenu } from './modules/mobile-menu.js';
import { initModals } from './modules/modals.js';
import { initForms } from './modules/forms.js';
import { initLazyLoadVideos } from './modules/video.js';
import { initScrollableTables } from './modules/scrollable-tables.js';
import { initAccordion } from './modules/accordion.js';

// Запускаем скрипты после полной загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  initScrollToTop();
  initMobileMenu();
  initModals();
  initForms();
  initLazyLoadVideos();
  initScrollableTables();
  initAccordion();
});