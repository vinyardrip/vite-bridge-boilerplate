Vite Bridge Boilerplate: План и Архитектура (v3.1 - Полная версия)
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
   /vite-bridge-boilerplate
   ├── /frontend/
   │ ├── /dist/ # Папка для ГОТОВОЙ СБОРКИ (генерируется автоматически)
   │ ├── /public/ # Статичные файлы, копируемые "как есть" В КОРЕНЬ СБОРКИ
   │ │ └── robots.txt
   │ ├── /src/
   │ │ ├── /assets/ # --- АССЕТЫ, ПРОХОДЯЩИЕ ОБРАБОТКУ VITE ---
   │ │ │ ├── /fonts/ # Исходники шрифтов (ttf, otf -> woff2)
   │ │ │ ├── /images/ # Растровые изображения (jpg, png -> webp, avif)
   │ │ │ ├── /icons/ # SVG-иконки для сборки в спрайт
   │ │ │ ├── /svg/ # Отдельные SVG-файлы (логотипы, иллюстрации)
   │ │ │ └── favicon.svg # Единственный ИСХОДНИК для генерации всех фавиконок и webmanifest
   │ │ ├── /data/ # --- ГЛОБАЛЬНЫЕ ДАННЫЕ ДЛЯ NUNJUCKS ---
   │ │ │ └── site.json # Данные, доступные во всех шаблонах
   │ │ ├── /js/ # --- СТРУКТУРА JAVASCRIPT ---
   │ │ │ ├── /lib/ # Переиспользуемые, универсальные модули
   │ │ │ ├── /modules/ # Модули, отвечающие за основную логику проекта
   │ │ │ ├── /integrations/ # Модули для интеграции сторонних библиотек (слайдеры, галереи)
   │ │ │ └── app.js # Главный файл (точка входа)
   │ │ ├── /scss/ # --- СТРУКТУРА СТИЛЕЙ ---
   │ │ │ ├── /abstracts/ # Код, не генерирующий CSS (переменные, миксины)
   │ │ │ ├── /base/ # Глобальные стили, типографика, ресеты
   │ │ │ ├── /components/ # Стили для UI-компонентов
   │ │ │ ├── /layout/ # Стили для крупных блоков (хедер, футер)
   │ │ │ └── app.scss # Главный файл, импортирующий все остальное
   │ │ └── /views/ # --- СТРУКТУРА ШАБЛОНОВ (NUNJUCKS) ---
   │ │ ├── /components/ # Небольшие UI-компоненты (button.njk)
   │ │ ├── /layouts/ # Базовые каркасы страниц (\_base.njk)
   │ │ ├── /macros/ # HTML-миксины (аналог функций)
   │ │ ├── /partials/ # Крупные секции страниц (header.njk)
   │ │ └── /pages/ # Точки входа - конечные страницы (index.njk)
   │ ├── .env
   │ ├── biome.json
   │ ├── .prettierrc.json
   │ ├── package.json
   │ └── vite.config.js
   │
   └── /backend/ # --- СТРУКТУРА БЭКЕНДА (например, WordPress) ---
   ├── .ddev/ # Конфигурация DDEV
   ├── vendor/ # PHP-зависимости (Composer)
   ├── wp-content/
   │ ├── /plugins/
   │ └── /themes/
   │ └── /my-theme/ # Наша тема
   │ └── /assets/ # Папка, куда КОПИРУЮТСЯ ассеты из /frontend/dist
   │ ├── functions.php
   │ └── index.php
   ├── .env
   ├── composer.json
   └── wp-config.php
   /src/assets — это "мастерская". Все, что лежит здесь, будет обработано Vite: картинки сожмутся, иконки соберутся в спрайт. favicon.svg будет использован как исходник для генерации всего набора фавиконок и файла site.webmanifest. 99% ваших ассетов должны находиться здесь.
   /public — это "склад готовой продукции". Файлы отсюда не обрабатываются, а просто копируются в корень итоговой сборки (dist) один в один. Это нужно для файлов, которые должны иметь строгое имя и расположение, например, robots.txt.
   Мы используем продвинутый подход, который обеспечивает максимальную скорость загрузки и эффективное кэширование.
   Основной бандл (app.js): Это точка входа и ядро нашего приложения. Он содержит основную логику, инициализацию общих для всего сайта скриптов и, что самое важное, логику для условной загрузки более тяжелых модулей. Этот файл загружается на каждой странице.
   Общий вендорный бандл (vendor.js): Сюда Vite автоматически помещает весь общий код из node_modules. Если вы используете небольшие утилиты (например, lodash-es) в разных частях вашего кода, они попадут сюда. Этот файл агрессивно кэшируется браузером, так как изменяется крайне редко.
   Асинхронные "вендорные" модули (swiper.js, photoswipe.js и т.д.): Это самая важная часть. Мы не импортируем "тяжелые" библиотеки напрямую в app.js. Вместо этого мы используем динамические импорты. Vite видит это и автоматически создает для каждой такой библиотеки отдельный JS-файл ("чанк"). Этот файл загружается браузером только тогда, когда выполняется условие.
   Пример реализации в app.js:
   code
   JavaScript
   // src/js/app.js
   import { initCommonScripts } from './modules/common';

// Запускаем общие для всего сайта скрипты
initCommonScripts();

// --- Условная загрузка тяжелых модулей ---
const heroSlider = document.querySelector('.hero-slider');
if (heroSlider) {
// Vite создаст отдельный chunk для swiper.js,
// и он загрузится только если на странице есть '.hero-slider'
import('./integrations/initSwiper.js').then(module => {
module.default(heroSlider);
});
}
Такой подход позволяет нам иметь легковесный основной бандл и подгружать тяжелые зависимости только там, где они действительно нужны.
Это финальная структура, которую сгенерирует Vite. Она будет скопирована в бэкенд.
code
Code
/frontend/dist/
├── css/
│ └── app.[hash].css
├── fonts/
│ └── JetBrainsMono.[hash].woff2
├── img/
│ ├── favicons/
│ └── sprite.svg
├── js/
│ ├── app.[hash].js
│ ├── vendor.[hash].js
│ └── swiper.[hash].js # Пример динамически загружаемого чанка
├── index.html
├── manifest.json # Карта ассетов для бэкенда
└── site.webmanifest 3. Настройка Vite: Шаблонизатор и структура сборки
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
},```

#### **4. Качество кода и форматирование: Гибридный подход Biome + Prettier**

Установка зависимостей: `pnpm add -D @biomejs/biome prettier @prettier/plugin-nunjucks`

Скрипты в `package.json`:

````json
{
  "scripts": {
    "format:code": "biome format --write ./src",
    "format:templates": "prettier --write \"./src/views/**/*.njk\"",
    "format": "pnpm format:code && pnpm format:templates",
    "lint:code": "biome lint --apply ./src",
    "check": "pnpm lint:code && pnpm format"
  }
}
5. Рабочий процесс тестирования: "Проверяй то, что отдаешь"
Для гарантии качества мы внедряем автоматическое визуальное тестирование с помощью Playwright. Философия этого подхода — тестировать не сырой код с dev-сервера, а финальную production-сборку, то есть именно те файлы, которые увидит конечный пользователь.
code
Bash
pnpm add -D @playwright/test
pnpm playwright install
Настраиваем Playwright (frontend/playwright.config.js) на работу с vite preview — локальным сервером, который показывает готовую сборку из папки /dist.
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
Это ваш гид по использованию визуального тестирования в проекте.
А) Первый запуск и создание эталонных снимков
Когда вы создаете новый тест для страницы или компонента, у вас еще нет "эталона" для сравнения.
Напишите тест. Например, создайте файл tests/homepage.spec.js для главной страницы.
Запустите основную команду проверки: pnpm verify.
Результат: Playwright выполнит сборку, запустит тесты и, увидев, что снимков нет, автоматически создаст их.
Важный шаг: Эти новые файлы-снимки (.png) необходимо добавить в Git и закоммитить.
Б) Обновление эталонов после намеренных изменений
Вы изменили дизайн, и тесты падают. Это ожидаемо.
Запустите pnpm verify, чтобы увидеть ошибку и проанализировать HTML-отчет.
Убедитесь, что изменения корректны.
Запустите специальную команду для обновления: pnpm test:update.
Закоммитьте как изменения в коде, так и обновленные файлы снимков.
В) Тестирование отдельных компонентов
Создайте "витрину" для компонентов: отдельную страницу-тестбед, например, _test-components.njk.
Напишите тест, который переходит на эту страницу и делает скриншот только блока с вашим компонентом, используя локаторы (getByTestId).
code
JavaScript
// tests/components.spec.js
import { test, expect } from '@playwright/test';

test('buttons have no visual regressions', async ({ page }) => {
  // 1. Переходим на нашу страницу-витрину
  await page.goto('/_test-components.html');

  // 2. Находим контейнер с кнопками по data-testid
  const buttonShowcase = page.getByTestId('button-showcase');

  // 3. Делаем скриншот ТОЛЬКО этого блока
  await expect(buttonShowcase).toHaveScreenshot('buttons.png');
});
Этот подход позволяет создавать точные, быстрые и независимые тесты для каждого UI-элемента вашей системы.
6. Безопасный рабочий процесс и интеграция с бэкендом
Скрипт в frontend/package.json для безопасного копирования собранных файлов в тему.
code
JSON
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "sync:theme": "if [ -n \"$(git status --porcelain)\" ]; then echo '❌ Ошибка: Обнаружены незакоммиченные изменения!'; exit 1; fi && echo '✅ Рабочая директория чиста, начинаю синхронизацию...' && rsync -av --delete dist/ ../backend/wp-content/themes/my-theme/assets/"
  }
}
Эта функция в functions.php читает manifest.json и возвращает правильные пути к ассетам.
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
}
7. Обязательный плагин для WordPress: Контроль ресурсов
Современная frontend-сборка с помощью Vite решает только половину задачи по оптимизации производительности. Вторая, не менее важная половина — это контроль над ресурсами, которые загружают сторонние плагины в WordPress.
Проблема: Большинство плагинов WordPress загружают свои CSS и JS файлы на всех страницах сайта.
Решение: Установка плагина-менеджера ресурсов, который позволяет точечно отключать загрузку скриптов и стилей.
Рекомендуемый плагин: Asset CleanUp: Page Speed Booster.
Почему это обязательно? Этот плагин является неотъемлемой частью архитектуры. Vite отвечает за оптимизацию наших ассетов (темы). Asset CleanUp отвечает за оптимизацию ассетов сторонних плагинов.
8. План реализации (Финальный чек-лист)
Фаза 0: Фундамент (ЗАВЕРШЕНА)
Фаза 1: Настройка сборки во /frontend
Настроить vite.config.js для управления структурой папки dist, Nunjucks и разделения бандлов (manualChunks) (п. 3).
Настроить PostCSS с autoprefixer.
Настроить Качество Кода (п. 4).
Настроить автоматизированный процесс визуального тестирования (п. 5).
Настроить плагины для ассетов.
Фаза 2: Настройка бэкенда (WordPress)
Основа: Установить WordPress и тему _s.
Оптимизация: Установить и настроить плагин Asset CleanUp (п. 7).
Бэкенд-зависимости: Установить зависимости через Composer в папке /backend.
Конфигурация: Настроить wp-config.php для работы с .env.
Фаза 3: Интеграция и DX
Убедиться, что build.manifest: true в конфиге Vite.
Реализовать скрипт sync:theme с проверкой Git-статуса (п. 6.1).
Реализовать PHP-функцию get_asset() в functions.php (п. 6.2). Важно: функция get_asset будет использоваться для подключения основных бандлов (app.css, app.js, vendor.js). Динамические чанки будут подгружаться автоматически через app.js.
Настроить хуки wp_enqueue_scripts для корректного подключения стилей и скриптов.
Фаза 4: Развертывание (Деплой)
Настроить скрипт deploy:package, который выполняет pnpm build, pnpm sync:theme и копирует "чистую" папку /backend в /deploy.
Фаза 5: Упаковка в Yeoman-генератор
Оформить всю настроенную структуру в виде Yeoman-генератора.
9. План на будущее: Превращение шаблона в "Конструктор"
Когда вы будете готовы, вот как это будет реализовано. Ваш Yeoman-генератор будет использовать prompts (вопросы), чтобы спрашивать у пользователя, что он хочет, а затем условную логику, чтобы включать или выключать части нашего чек-листа.
Пример, как это будет работать:
Запуск генератора: yo my-generator
Вопрос 1 (Тип проекта):
code
Code
? Какой тип проекта вы создаете?
> Landing Page (Статический сайт)
  WordPress + DDEV
Вопрос 2 (Шаблонизатор):
code
Code
? Какой шаблонизатор вы хотите использовать?
> Nunjucks
  Mustache
  Plain HTML (с инклюдами)
Вопрос 3 (CSS):
code
Code
? Какой препроцессор CSS?
> SASS/SCSS
  PostCSS-only```

---
````
