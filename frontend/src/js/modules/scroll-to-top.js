/**
 * =================================================================================================
 * scroll-to-top.js
 * =================================================================================================
 *
 * Модуль для кнопки "Вернуться наверх".
 * Экспортирует функцию `initScrollToTop`, которая находит кнопку на странице
 * и вешает на нее все необходимые обработчики событий.
 *
 * =================================================================================================
 */

// --- Helpers -----------------------------------------------------------------
/**
 * Функция плавного скролла с кастомной продолжительностью.
 * @param {number} endPosition - Конечная позиция скролла (в px от верха).
 * @param {number} duration - Продолжительность анимации в мс.
 */
const smoothScrollTo = (endPosition, duration) => {
  const startPosition = window.scrollY;
  const distance = endPosition - startPosition;
  let startTime = null;

  const easeInOutCubic = (t, b, c, d) => {
    t /= d / 2;
    if (t < 1) return (c / 2) * t * t * t + b;
    t -= 2;
    return (c / 2) * (t * t * t + 2) + b;
  };

  const animation = (currentTime) => {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const run = easeInOutCubic(timeElapsed, startPosition, distance, duration);
    window.scrollTo(0, run);
    if (timeElapsed < duration) requestAnimationFrame(animation);
  };

  requestAnimationFrame(animation);
};

// --- Main Function -----------------------------------------------------------
export const initScrollToTop = () => {
  // --- Constants -------------------------------------------------------------
  const button = document.querySelector('#scroll-to-top');
  const scrollThreshold = 500; // Порог в px, после которого кнопка появляется
  const animationDuration = 750; // Длительность плавного скролла в мс

  if (!button) {
    return;
  }

  // --- Handlers --------------------------------------------------------------
  const handleScroll = () => {
    if (window.scrollY > scrollThreshold) {
      if (!button.classList.contains('btn-entrance')) {
        button.classList.remove('btn-exit');
        button.classList.add('btn-entrance');
        button.style.display = 'block';
      }
    } else {
      if (button.classList.contains('btn-entrance')) {
        button.classList.remove('btn-entrance');
        button.classList.add('btn-exit');
        setTimeout(() => {
          if (button.classList.contains('btn-exit')) {
            button.style.display = 'none';
          }
        }, 250); // Должно совпадать с длительностью анимации .btn-exit
      }
    }
  };

  const handleClick = () => {
    smoothScrollTo(0, animationDuration);
  };

  // --- Event Listeners -------------------------------------------------------
  window.addEventListener('scroll', handleScroll);
  button.addEventListener('click', handleClick);
};