Vite Bridge Boilerplate: План и Архитектура (v3.10 - Полная версия)
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
Слово-команда "дальше": Переход к следующему действию осуществляется только после подтверждения с вашей стороны (слово-команда: дальше). Это позволяет вносить коррективы и получать разъяснения в реальном времени.
Полнота предоставляемой информации: Когда требуется предоставить содержимое файла (например, vite.config.js), оно должно быть предоставлено полностью, без сокращений, пропусков и комментариев "внутри defineConfig". Файл должен быть готов к копированию и вставке "один в один".
Сохранение целостности плана: Этот документ (PLAN.md) должен всегда предоставляться в полной, не сокращенной версии. Любые изменения должны быть добавлениями или явными правками, но не удалением существующей информации, если это не согласовано отдельно.
Информативный вывод в консоли: Все скрипты и процессы сборки (dev и build) должны предоставлять четкую обратную связь. Успешные операции должны подтверждаться, а ошибки — выводиться с понятным логом. По возможности, некритичные ошибки не должны прерывать весь процесс сборки, а выводиться в итоговом отчете.
Поиск решений для новых задач: Если для новой задачи требуется плагин или зависимость, не описанная в первоначальном плане, я обязан найти актуальное, реально существующее решение в интернете. Я не буду придумывать названия пакетов. Если поиск не даст результата, я сообщу об этом, и мы будем использовать предоставленное вами решение.

1. Используемый стек и окружение
   Разрабатываем на Arch Linux + zsh + yay + micro + VS Code (nvim в планах).
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
   /vite-bridge-boilerplate <-- Корень проекта, единый package.json
   ├── /backend/
   │ ├── .ddev/
   │ ├── vendor/
   │ ├── wp-content/
   │ │ ├── /plugins/
   │ │ └── /themes/
   │ │ └── /my-theme/
   │ │ ├── /assets/
   │ │ ├── functions.php
   │ │ └── index.php
   │ ├── .env
   │ ├── composer.json
   │ └── wp-config.php
   ├── /frontend/
   │ ├── /dist/
   │ ├── /public/
   │ │ ├── favicon.svg <-- Исходник для всех иконок теперь здесь
   │ │ └── robots.txt
   │ └── /src/
   │ ├── /assets/
   │ │ ├── /fonts/
   │ │ ├── /images/
   │ │ ├── /icons/
   │ │ └── /svg/
   │ ├── /data/
   │ │ └── site.json
   │ ├── /js/
   │ │ ├── /lib/
   │ │ ├── /modules/
   │ │ ├── /integrations/
   │ │ └── app.js
   │ ├── /scss/
   │ │ ├── /abstracts/
   │ │ ├── /base/
   │ │ ├── /components/
   │ │ ├── /layout/
   │ │ └── app.scss
   │ └── /views/
   │ ├── /components/
   │ ├── /layouts/
   │ ├── /macros/
   │ ├── /partials/
   │ └── /pages/
   ├── /scripts/ <-- Папка для вспомогательных Node.js скриптов (post-build, etc.)
   │ └── make-critical.js
   ├── biome.json
   ├── package.json
   ├── vite.config.js
   └── ...
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
entryFileNames: 'js/[name].[hash].js', // Используем [name] для разделения app и vendor
chunkFileNames: 'js/chunk.[hash].js', // Для динамических импортов
assetFileNames: (assetInfo) => {
const extType = assetInfo.name.split('.').pop();
if (/css/i.test(extType)) {
return 'css/app.[hash].css';
}
if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp|avif/i.test(extType)) {
return 'img/[name].[hash][extname]';
}
if (/woff|woff2|eot|ttf|otf/i.test(extType)) {
return 'fonts/[name].[hash][extname]';
}
return '[name].[hash][extname]';
},
// Функция для создания отдельного vendor-чанка
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
Для гарантии качества мы внедряем автоматическое визуальное тестирование с помощью Playwright. Философия этого подхода — тестировать не сырой код с dev-сервера, а финальную production-сборку, то есть именно те файлы, которые увидит конечный пользователь.
Установка Playwright:
code
Bash
pnpm add -D @playwright/test
pnpm playwright install
Настройка playwright.config.js:
code
JavaScript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
testDir: './tests',
fullyParallel: true,
reporter: 'html',

webServer: {
command: 'pnpm preview', // Запускаем сервер для ГОТОВОЙ СБОРКИ
url: 'http://127.0.0.1:4173', // Порт preview-сервера
reuseExistingServer: !process.env.CI,
},

use: {
baseURL: 'http://127.0.0.1:4173', // Базовый URL для тестов
trace: 'on-first-retry',
},

projects: [
{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
],
});
Скрипты в package.json:
code
JSON
{
"scripts": {
"dev": "vite",
"build": "vite build",
"preview": "vite preview",
"format": "pnpm format:code && pnpm format:templates",
"lint:code": "biome lint --apply ./src",

    // --- ОСНОВНОЙ СЦЕНАРИЙ ПРОВЕРКИ ПЕРЕД КОММИТОМ ---
    "verify": "pnpm build && pnpm playwright test",

    // --- ВСПОМОГАТЕЛЬНЫЕ КОМАНДЫ ---
    "test:ui": "pnpm playwright test --ui",
    "test:update": "pnpm build && pnpm playwright test --update-snapshots"

}
}
Гид по использованию визуального тестирования:
А) Первый запуск и создание эталонных снимков
Напишите тест (например, tests/homepage.spec.js).
Запустите pnpm verify. Playwright выполнит сборку и автоматически создаст эталонные снимки.
Важно: Добавьте новые файлы-снимки (.png) в Git и закоммитьте.
Б) Обновление эталонов после намеренных изменений
Запустите pnpm verify, чтобы увидеть ошибку.
Убедитесь, что изменения корректны.
Запустите pnpm test:update для обновления снимков.
Закоммитьте и код, и обновленные снимки.
В) Тестирование отдельных компонентов
Создайте "витрину" для компонентов (например, \_test-components.njk).
Напишите тест, который делает скриншот только блока с компонентом, используя локаторы.
code
JavaScript
// tests/components.spec.js
import { test, expect } from '@playwright/test';

test('buttons have no visual regressions', async ({ page }) => {
// 1. Переходим на нашу страницу-витрину
await page.goto('/\_test-components.html');

// 2. Находим контейнер с кнопками по data-testid
const buttonShowcase = page.getByTestId('button-showcase');

// 3. Делаем скриншот ТОЛЬКО этого блока
await expect(buttonShowcase).toHaveScreenshot('buttons.png');
}); 6. Безопасный рабочий процесс и интеграция с бэкендом
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
    static $manifest = null;
    if ($manifest === null) {
$manifestPath = get_template_directory() . '/assets/manifest.json';
        if (file_exists($manifestPath)) {
$manifest = json_decode(file_get_contents($manifestPath), true);
} else {
$manifest = [];
        }
    }
    if (isset($manifest[$entry]['file'])) {
return get_template_directory_uri() . '/assets/' . $manifest[$entry]['file'];
}
return '';
} 7. Обязательный плагин для WordPress: Контроль ресурсов
Современная frontend-сборка с помощью Vite решает только половину задачи по оптимизации. Вторая — контроль над ресурсами, которые загружают сторонние плагины в WordPress. Для этого обязательна установка плагина-менеджера ресурсов, например, Asset CleanUp: Page Speed Booster. 8. План реализации (Финальный чек-лист)
Фаза 0: Фундамент (ЗАВЕРШЕНА)
Фаза 1: Базовая настройка Frontend-сборки (ЗАВЕРШЕНА)
Настроен vite.config.js для управления структурой папки dist.
Настроен PostCSS с autoprefixer.
Настроено Качество Кода (Biome + Prettier).
Настроен процесс визуального тестирования (Playwright).
Настроены плагины для ассетов (Nunjucks, SVG-спрайты).
Фаза 1.5: Дополнительная настройка фронтенда (ТЕКУЩИЙ ЭТАП)
Этап включает реализацию frontend-задач. После каждой задачи выполняется коммит.
ЗАВЕРШЕНО: Автоматическая оптимизация изображений (<img> -> <picture> с avif/webp).
ЗАВЕРШЕНО: Автоматическая генерация и подключение веб-шрифтов (.ttf/.otf -> .woff2 + CSS).
ЗАВЕРШЕНО: Автоматическая генерация и встраивание Critical CSS после сборки.
ЗАВЕРШЕНО: Автоматическая генерация Favicons и manifest'а для всех платформ.
Фаза 1.7: Интеграционное тестирование фронтенда
Этот этап начнется после завершения всех задач из Фазы 1.5.
Цель: Проверить работоспособность всей frontend-сборки на реальном, сложном проекте.
Процесс:
В готовую структуру /src копируется код существующего рабочего проекта (верстка, стили, скрипты).
Выполняется запуск pnpm dev и pnpm build для выявления и исправления возможных ошибок интеграции.
Проводятся всесторонние тесты (визуальные, функциональные) для подтверждения корректной работы всех систем.
Вносятся финальные исправления и улучшения в конфигурацию сборки.
Фаза 2: Настройка бэкенда (WordPress)
Основа: Установить WordPress и тему \_s.
Оптимизация: Установить и настроить плагин Asset CleanUp (п. 7).
Бэкенд-зависимости: Установить зависимости через Composer в папке /backend.
Конфигурация: Настроить wp-config.php для работы с .env.
Фаза 3: Интеграция и DX
Убедиться, что build.manifest: true в конфиге Vite.
Реализовать скрипт sync:theme с проверкой Git-статуса (п. 6.1).
Реализовать PHP-функцию get_asset() в functions.php (п. 6.2).
Настроить хуки wp_enqueue_scripts для корректного подключения стилей и скриптов.
Фаза 4: Развертывание (Деплой)
Настроить скрипт deploy:package, который выполняет pnpm build, pnpm sync:theme и копирует "чистую" папку /backend в /deploy.
Фаза 5: Упаковка в Yeoman-генератор
Оформить всю настроенную структуру в виде Yeoman-генератора. 9. План на будущее: Превращение шаблона в "Конструктор"
Когда вы будете готовы, вот как это будет реализовано. Ваш Yeoman-генератор будет использовать prompts (вопросы), чтобы спрашивать у пользователя, что он хочет, а затем условную логику, чтобы включать или выключать части нашего чек-листа.
Пример, как это будет работать:
Запуск генератора: yo my-generator
Вопрос 1 (Тип проекта):
code
Code
? Какой тип проекта вы создаете?

> Landing Page (Статический сайт)
> WordPress + DDEV
> Вопрос 2 (Шаблонизатор):```
> ? Какой шаблонизатор вы хотите использовать?
> Nunjucks
> Mustache
> Plain HTML (с инклюдами)
> code
> Code
> Вопрос 3 (CSS):
> ? Какой препроцессор CSS?
> SASS/SCSS
> PostCSS-only
> code
> Code

### 10. Вспомогательные (Utility) Скрипты

Помимо основных команд `dev` и `build`, проект будет включать отдельные скрипты для выполнения разовых задач. Это аналог отдельных Gulp-тасков.

- #### `favicons:generate` (К реализации)
  - **Задача:** Выполнить принудительную (пере)генерацию всего набора иконок и манифеста из исходного файла `/frontend/public/favicon.svg`.
  - **Когда использовать:** Один раз при старте нового проекта или после изменения мастер-иконки.
  - **Реализация:** Будет использовать CLI, поставляемый с `vite-plugin-pwa` (`pwa assets generate`), чтобы выполнить только эту задачу, не запуская полную сборку проекта.

- #### `images:compress` (К реализации)
  - **Задача:** Сжать изображения в указанной папке, используя настройки, схожие с TinyPNG.
  - **Когда использовать:** Для разовой обработки изображений, которые не являются частью основного потока разработки (например, для подготовки контента перед загрузкой в CMS).
  - **Важное замечание:** Этот скрипт является вспомогательным. Наша основная сборка (`pnpm build`) **уже автоматически** оптимизирует все изображения, на которые есть ссылки в коде (`<img src="...">`). Этот скрипт нужен для "внешних" задач.
  - **Реализация:** Будет использовать CLI-инструменты, такие как `imagemin-cli` или собственный Node.js-скрипт на базе `sharp`, для обработки указанной директории.

---

Вот теперь `PLAN.md` действительно полный.
