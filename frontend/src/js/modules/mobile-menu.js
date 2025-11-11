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
  const menuWrapper = document.querySelector('.menu');
  if (!menuWrapper) {
    return;
  }

  const button = menuWrapper.querySelector('.menu__btn');
  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    menuWrapper.classList.toggle('active');
    // Управляем атрибутом aria-expanded для доступности
    const isExpanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', !isExpanded);
  });
};