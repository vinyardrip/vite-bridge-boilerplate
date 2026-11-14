/*!
 * =================================================================================================
 * app.ts
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
    /*! --- Инициализация дебаггера горизонтального переполнения --- */
    // Динамический импорт внутри DEV-блока гарантирует, что пакет
    // не попадет в production-сборку (dead code elimination).
    import('debug-css-overflow').then(({ initDebugCssOverflow }) => {
      initDebugCssOverflow();
    });

    /*! --- Инициализация тестера шрифтов --- */
    const fontTester = document.querySelector<HTMLElement>('#font-tester');

    if (fontTester) {
      import('./dev/test-fonts.ts').then(({ initFontTester }) => {
        initFontTester(fontTester);
      });
    }
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
import './modules/detect-touch.ts';

// Импорт модулей компонентов
import { initScrollToTop } from './modules/scroll-to-top.ts';
import { initMobileMenu } from './modules/mobile-menu.ts';
import { initModals } from './modules/modals.ts';
import { initForms } from './modules/forms.ts';
import { initLazyLoadVideos } from './modules/video.ts';
import { initScrollableTables } from './modules/scrollable-tables.ts';
import { initAccordion } from './modules/accordion.ts';

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