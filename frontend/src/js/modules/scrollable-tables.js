/**
 * =================================================================================================
 * scrollable-tables.js
 * =================================================================================================
 *
 * Модуль для создания адаптивных таблиц с горизонтальной прокруткой.
 * - Находит все теги <table> на странице.
 * - Оборачивает каждую таблицу в <div> для обеспечения прокрутки.
 * - Добавляет/удаляет классы для индикации возможности скролла влево/вправо
 *   (чтобы можно было стилизовать тени-индикаторы).
 *
 * =================================================================================================
 */

// --- Вспомогательная функция для обновления состояния одной таблицы ---
const updateTableState = (wrapper) => {
  const table = wrapper.querySelector('table');
  if (!table) return;

  const boxWidth = wrapper.offsetWidth;
  const tableWidth = table.scrollWidth;

  wrapper.classList.remove('scroll-left');

  // Если таблица шире обертки, добавляем класс-индикатор
  if (tableWidth > boxWidth) {
    wrapper.classList.add('scroll-right');
  } else {
    wrapper.classList.remove('scroll-right');
  }
};

// --- Основная функция-инициализатор ---
export const initScrollableTables = () => {
  const tables = document.querySelectorAll('table');
  if (!tables.length) {
    return;
  }

  // 1. Оборачиваем каждую таблицу
  tables.forEach((table) => {
    // Проверяем, не была ли таблица уже обернута
    if (table.parentNode.classList.contains('big-table')) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'big-table';

    // Вставляем обертку перед таблицей, а затем перемещаем таблицу внутрь
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);

    // 2. Добавляем обработчик скролла для таблицы внутри обертки
    table.addEventListener('scroll', () => {
      const scrollLeft = table.scrollLeft;
      const tableWidth = table.scrollWidth;
      const innerWidth = table.clientWidth;

      const isScrolledToEnd = Math.ceil(scrollLeft + innerWidth) >= tableWidth;
      const isScrolledToStart = scrollLeft === 0;

      if (isScrolledToEnd) {
        wrapper.classList.remove('scroll-right');
      } else if (isScrolledToStart) {
        wrapper.classList.remove('scroll-left');
      } else {
        wrapper.classList.add('scroll-right');
        wrapper.classList.add('scroll-left');
      }
    });

    // 3. Первоначальное обновление состояния
    updateTableState(wrapper);
  });

  // 4. Обновляем состояние всех таблиц при ресайзе окна
  window.addEventListener('resize', () => {
    document.querySelectorAll('.big-table').forEach(updateTableState);
  });
};