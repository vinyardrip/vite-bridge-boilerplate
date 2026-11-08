// postcss.config.js

export default {
  plugins: {
    // Включаем плагин для сортировки медиа-запросов.
    // 'mobile-first' - это стратегия сортировки по умолчанию,
    // которая расставляет @media (min-width) от меньшего к большему.
    // Это самый распространенный и рекомендуемый подход.
    "postcss-sort-media-queries": {
      //sort: "mobile-first",
      sort: "desktop-first",
    },

    // Autoprefixer также должен быть здесь.
    // Vite добавит его автоматически, но лучше указать явно для ясности.
    autoprefixer: {},
  },
};
