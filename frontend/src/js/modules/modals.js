/**
 * =================================================================================================
 * modals.js
 * =================================================================================================
 *
 * Модуль для управления всеми модальными окнами на сайте.
 * - Открывает окна по клику на элементы с атрибутом `data-modal-trigger="<id_окна>"`.
 * - Закрывает активное окно по клику на оверлей, кнопку `data-modal-close` или по Esc.
 * - Управляет блокировкой скролла страницы при открытом окне.
 *
 * Экспортирует две функции:
 * - `initModals()`: Основная функция инициализации, вешает все обработчики.
 * - `openModal(modalId)`: Публичная функция для открытия модального окна из других скриптов.
 *
 * =================================================================================================
 */

// --- Вспомогательные функции для блокировки скролла ---
const getScrollbarWidth = () => {
  const div = document.createElement('div');
  div.style.width = '50px';
  div.style.height = '50px';
  div.style.overflowY = 'scroll';
  div.style.visibility = 'hidden';
  document.body.appendChild(div);
  const scrollWidth = div.offsetWidth - div.clientWidth;
  div.remove();
  return scrollWidth;
};

const scrollbarWidth = getScrollbarWidth();

const lockScroll = () => {
  document.body.style.overflow = 'hidden';
  document.body.style.paddingRight = `${scrollbarWidth}px`;
};

const unlockScroll = () => {
  document.body.style.overflow = '';
  document.body.style.paddingRight = '0px';
};

// --- Основная логика ---
const overlay = document.querySelector('#overlay');
const modalWindows = document.querySelectorAll('[data-modal-window]');

// Функция для открытия конкретного модального окна
export const openModal = (modalId) => {
  if (!overlay) return;

  // Сначала скрываем все окна
  modalWindows.forEach((window) => {
    window.style.display = 'none';
  });

  // Находим и показываем нужное окно
  const targetModal = document.querySelector(`[data-modal-window="${modalId}"]`);
  if (targetModal) {
    targetModal.style.display = 'block';
    overlay.classList.add('overlay-active');
    overlay.setAttribute('aria-hidden', 'false');
    lockScroll();
  }
};

// Функция для закрытия всех модальных окон
const closeModal = () => {
  if (!overlay) return;
  overlay.classList.remove('overlay-active');
  overlay.setAttribute('aria-hidden', 'true');
  unlockScroll();
};

// Основная функция инициализации
export const initModals = () => {
  if (!overlay) return;

  const triggers = document.querySelectorAll('[data-modal-trigger]');
  const closeButtons = document.querySelectorAll('[data-modal-close]');

  // Обработчики для кнопок-триггеров
  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const modalId = trigger.dataset.modalTrigger;
      openModal(modalId);
    });
  });

  // Обработчики для кнопок закрытия
  closeButtons.forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  // Закрытие по клику на оверлей
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // Закрытие по клавише Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('overlay-active')) {
      closeModal();
    }
  });
  // Предотвращает "мигание" оверлея при первой загрузке страницы.
  setTimeout(() => {
    if (overlay) {
      overlay.style.transition =
        'opacity .5s ease-in-out, visibility .5s ease-in-out';
    }
  }, 500); // 500мс достаточно, чтобы DOM был готов
};