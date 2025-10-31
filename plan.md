Vite Bridge Boilerplate: План и Архитектура (v3.11 - Актуализированная структура)
Этот документ (PLAN.md) является единственным источником правды для архитектуры и плана реализации проекта. Все действия выполняются в строгом соответствии с этим планом.
Ключевые особенности и философия
Разделение ответственности: Проект имеет строгую двухкомпонентную структуру (/frontend и /backend).
Безопасный и предсказуемый рабочий процесс: Мы следуем четкой последовательности: Разработка -> Коммит -> Сборка -> Синхронизация.
Гибридный подход к качеству кода: Используется Biome для быстрой проверки JS/CSS и Prettier с плагином для надежного форматирования шаблонов Nunjucks.
Продвинутый шаблонизатор: Nunjucks настроен с поддержкой Front Matter для данных на уровне страницы и глобальных файлов данных для всего сайта.
Профессиональная архитектура: Файловая структура как исходников (/src), так и итоговой сборки (/dist) четко организована и предсказуема.
Автоматическое управление путями: manifest.json и PHP-функция get_asset() решают проблему версионирования ассетов в бэкенд-системах вроде WordPress.
Надежный откат через Git: Откат любых неудачных изменений производится стандартной командой git revert.
Правила нашей совместной работы
Методичный пошаговый подход: Все действия, особенно касающиеся настройки окружения и выполнения команд, выполняются строго пошагово (одна команда за раз).
Слово-команда "дальше": Переход к следующему действию осуществляется только после подтверждения с вашей стороны (слово-команда: дальше).
Полнота предоставляемой информации: Когда требуется предоставить содержимое файла (например, vite.config.js), оно должно быть предоставлено полностью, без сокращений и с сохранением всех комментариев.
Сохранение целостности плана: Этот документ (PLAN.md) должен всегда предоставляться в полной, не сокращенной версии.
Информативный вывод в консоли: Все скрипты и процессы сборки должны предоставлять четкую обратную связь.
Поиск решений для новых задач: Если для новой задачи требуется плагин или зависимость, не описанная в первоначальном плане, я обязан найти актуальное, реально существующее решение.

1. Используемый стек и окружение
   Разрабатываем на: Arch Linux + zsh + yay + micro + VS Code (nvim в планах).
   Инструмент Версия/Менеджер Назначение
   ОС Arch Linux Основная среда разработки.
   mise latest (из оф. репо) (Локально) Управляет версиями инструментов (Node.js, pnpm).
   pnpm mise (Локально) Основной пакетный менеджер для фронтенда.
   DDEV latest (Окружение) Управляет всем локальным серверным окружением на базе Docker.
   WP-CLI Встроен в DDEV (Окружение) Интерфейс командной строки для WordPress.
   Vite latest (Локально) Сборщик фронтенда.
   Underscores (\_s) latest (Пример) Стартовая тема-каркас для WordPress.
2. Архитектура и файловая структура
   code
   Code
   /vite-bridge-boilerplate <-- Корень проекта
   ├── /backend/
   │ └── /wp-content/
   │ ├── /plugins/
   │ └── /themes/
   │ └── /my-theme/
   ├── /frontend/
   │ ├── /public/
   │ │ ├── favicon.svg
   │ │ └── robots.txt
   │ └── /src/
   │ ├── /assets/
   │ │ ├── /fonts/
   │ │ ├── /icons/
   │ │ ├── /images/
   │ │ └── /svg/
   │ ├── /data/
   │ │ └── site.json
   │ ├── /js/
   │ │ ├── app.js
   │ │ ├── /lib/
   │ │ └── /modules/
   │ ├── /scss/
   │ │ ├── /abstracts/
   │ │ ├── app.scss
   │ │ ├── /base/
   │ │ ├── /components/
   │ │ ├── /layout/
   │ │ └── /pages/
   │ └── /views/
   │ ├── /components/
   │ ├── /layouts/
   │ ├── /macros/
   │ ├── /pages/
   │ └── /partials/
   ├── /scripts/
   │ ├── compress-images.js
   │ ├── convert-images.js
   │ ├── make-critical.js
   │ └── optimize-svg.js
   ├── biome.json
   ├── package.json
   ├── plan.md
   ├── playwright.config.js
   ├── postcss.config.js
   ├── posthtml.config.js
   ├── status.md
   └── vite.config.js
3. Настройка Vite: Шаблонизатор и структура сборки
   Установка зависимостей: pnpm add -D vite-plugin-nunjucks gray-matter vite-plugin-html-prettify
   Настройка vite.config.js для Nunjucks:
   code
   JavaScript
   import nunjucks from 'vite-plugin-nunjucks';
   import prettify from 'vite-plugin-html-prettify';
   import siteData from './src/data/site.json';

// Внутри defineConfig
plugins: [
nunjucks({
frontMatter: true,
context: {
site: { ...siteData, production: command === 'build' },
},
}),
prettify({ indent_size: 2 }),
],
Добавляем в vite.config.js настройку для разделения бандлов (manualChunks):
code
JavaScript
// Внутри defineConfig
build: {
outDir: 'dist',
manifest: true,
rollupOptions: {
output: {
entryFileNames: 'js/[name].[hash].js',
chunkFileNames: 'js/chunk.[hash].js',
assetFileNames: (assetInfo) => {
// ... логика распределения ассетов ...
},
manualChunks(id) {
if (id.includes('node_modules')) {
return 'vendor';
}
},
},
},
}, 4. Качество кода и форматирование: Гибридный подход Biome + Prettier
Установка зависимостей: pnpm add -D @biomejs/biome prettier @prettier/plugin-nunjucks
Скрипты в package.json:
code
JSON
{
"scripts": {
"format:code": "biome format --write ./src",
"format:templates": "prettier --write \"./src/views/\*_/_.njk\"",
"format": "pnpm format:code && pnpm format:templates",
"lint:code": "biome lint --apply ./src",
"check": "pnpm lint:code && pnpm format"
}
} 5. Рабочий процесс тестирования: "Проверяй то, что отдаешь"
(Настройки Playwright актуальны и находятся в playwright.config.js) 6. Безопасный рабочий процесс и интеграция с бэкендом
Скрипт sync:theme в package.json:
code
JSON
{
"scripts": {
"sync:theme": "if [ -n \"$(git status --porcelain)\" ]; then echo '❌ Ошибка: Обнаружены незакоммиченные изменения!'; exit 1; fi && echo '✅ Рабочая директория чиста, начинаю синхронизацию...' && rsync -av --delete dist/ ../backend/wp-content/themes/my-theme/assets/"
}
}
PHP-функция get_asset в functions.php:
code
PHP
function get_asset($entry) {
// ... реализация функции ...
} 7. Обязательный плагин для WordPress: Контроль ресурсов
Современная frontend-сборка с помощью Vite решает только половину задачи по оптимизации. Вторая — контроль над ресурсами, которые загружают сторонние плагины в WordPress. Для этого обязательна установка плагина-менеджера ресурсов, например, Asset CleanUp: Page Speed Booster. 8. План реализации (Финальный чек-лист)
Фаза 0: Фундамент (ЗАВЕРШЕНА)
Фаза 1: Базовая настройка Frontend-сборки (ЗАВЕРШЕНА)
Фаза 1.5: Дополнительная настройка фронтенда (ЗАВЕРШЕНА)
ТЕКУЩИЙ ЭТАП -> Фаза 1.7: Интеграционное тестирование фронтенда
Фаза 2: Настройка бэкенда (WordPress)
Фаза 3: Интеграция и DX
Фаза 4: Развертывание (Деплой)
Фаза 5: Упаковка в Yeoman-генератор 9. План на будущее: Превращение шаблона в "Конструктор"
Когда вы будете готовы, вот как это будет реализовано. Ваш Yeoman-генератор будет использовать prompts (вопросы), чтобы спрашивать у пользователя, что он хочет, а затем условную логику, чтобы включать или выключать части нашего чек-листа.
Пример, как это будет работать:
Запуск генератора: yo my-generator
Вопрос 1 (Тип проекта):
code
Code
? Какой тип проекта вы создаете?

> Landing Page (Статический сайт)
> WordPress + DDEV
> Вопрос 2 (Шаблонизатор):
> code
> Code
> ? Какой шаблонизатор вы хотите использовать?
> Nunjucks
> Mustache
> Plain HTML (с инклюдами)
> Вопрос 3 (CSS):
> code
> Code
> ? Какой препроцессор CSS?
> SASS/SCSS
> PostCSS-only 10. Вспомогательные (Utility) Скрипты
> Помимо основных команд dev и build, проект включает отдельные скрипты для выполнения разовых задач.
> favicons:generate
> images:compress
> images:convert
> svg:optimize
> test:fonts
