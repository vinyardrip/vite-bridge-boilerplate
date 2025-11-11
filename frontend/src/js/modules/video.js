/**
 * =================================================================================================
 * video.js
 * =================================================================================================
 *
 * Модуль для "ленивой" загрузки YouTube видео.
 * Находит все элементы с классом `.video` и атрибутом `data-video-id`,
 * по клику заменяет превью на встроенный iframe с автопроигрыванием.
 *
 * =================================================================================================
 */

// --- Вспомогательные функции ---

// Создает iframe
const createIframe = (id) => {
  const iframe = document.createElement('iframe');
  const query = '?rel=0&showinfo=0&autoplay=1';
  const url = `https://www.youtube.com/embed/${id}${query}`;

  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('allow', 'autoplay');
  iframe.setAttribute('src', url);
  iframe.classList.add('video__media');

  return iframe;
};

// Настраивает конкретный видео-блок
const setupVideo = (video) => {
  const link = video.querySelector('.video__link');
  const button = video.querySelector('.video__btn');
  const id = video.dataset.videoId;

  if (!id || !link || !button) {
    console.warn('Не удалось инициализировать видео: отсутствует ID, ссылка или кнопка.', video);
    return;
  }

  // Удаляем href, чтобы избежать перехода по ссылке
  link.removeAttribute('href');
  video.classList.add('video--enabled');

  video.addEventListener('click', () => {
    const iframe = createIframe(id);
    link.remove();
    button.remove();
    video.appendChild(iframe);
  }, { once: true }); // Обработчик сработает только один раз
};

// --- Основная функция-инициализатор ---

export const initLazyLoadVideos = () => {
  const videos = document.querySelectorAll('.video[data-video-id]');
  if (videos.length) {
    videos.forEach(setupVideo);
  }
};