/**
 * =================================================================================================
 * accordion.js
 * =================================================================================================
 *
 * Модуль для управления компонентом "аккордеон".
 * Находит все кнопки `.accordion__btn` и по клику на одну из них
 * закрывает все остальные, а активную - открывает.
 *
 * =================================================================================================
 */
export const initAccordion = () => {
  const items = document.querySelectorAll('.accordion__btn');
  if (!items.length) {
    return;
  }

  const toggleAccordion = (clickedItem) => {
    const isExpanded = clickedItem.getAttribute('aria-expanded') === 'true';

    // Сначала закрываем все элементы
    items.forEach(item => item.setAttribute('aria-expanded', 'false'));

    // Если кликнутый элемент был закрыт, открываем его
    if (!isExpanded) {
      clickedItem.setAttribute('aria-expanded', 'true');
    }
  };

  items.forEach(item => {
    item.addEventListener('click', () => toggleAccordion(item));
  });
};