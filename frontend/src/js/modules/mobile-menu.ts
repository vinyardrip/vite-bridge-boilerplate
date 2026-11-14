/**
 * =================================================================================================
 * mobile-menu.js
 * =================================================================================================
 *
 * Модуль для управления мобильным меню.
 * Находит на странице контейнер `.menu` и кнопку `.menu__btn` внутри него.
 * По клику на кнопку переключает класс `.active` на контейнере.
 *
 * =================================================================================================
 */
export const initMobileMenu = () => {
  const menuWrapper = document.querySelector<HTMLElement>('.menu');
  if (!menuWrapper) {
    return;
  }

  const button = menuWrapper.querySelector<HTMLButtonElement>('.menu__btn');
  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    menuWrapper.classList.toggle('active');
    // Управляем атрибутом aria-expanded для доступности
    const isExpanded = button.getAttribute('aria-expanded') === 'true';
    // setAttribute приводит значение к строке — передаем ее явно.
    button.setAttribute('aria-expanded', String(!isExpanded));
  });
};