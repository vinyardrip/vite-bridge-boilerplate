/**
 * =================================================================================================
 * detect-touch.js
 * =================================================================================================
 *
 * Определяет наличие сенсорного ввода на устройстве и добавляет соответствующий
 * класс (`touch` или `no-touch`) к элементу `<html>`.
 *
 * Это позволяет адаптировать поведение (JS) для разных типов устройств.
 * Модуль является самовызывающимся и должен быть импортирован в app.js
 * один раз для выполнения при загрузке страницы.
 *
 * =================================================================================================
 */

(() => {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (isTouchDevice) {
    document.documentElement.classList.add('touch');
    document.documentElement.classList.remove('no-touch');
  } else {
    document.documentElement.classList.add('no-touch');
    document.documentElement.classList.remove('touch');
  }
})();