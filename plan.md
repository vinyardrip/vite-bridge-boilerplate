Шаг 1 (Финальная, полная и на 100% корректная версия): Обновление PLAN.md
Действие:
Пожалуйста, замените все содержимое вашего файла PLAN.md на этот код. Это последняя, полная версия.
code
Markdown

# Vite Bridge Boilerplate: План и Архитектура (v3.11 - Актуализированная структура)

Этот документ (PLAN.md) является единственным источником правды для архитектуры и плана реализации проекта. Все действия выполняются в строгом соответствии с этим планом.

## 1. Ключевые особенности и философия

- **Монорепозиторий (Monorepo):** Весь проект, включая frontend и backend части, находится в едином Git-репозитории. Ключевые файлы, такие как `package.json`, `vite.config.js` и папка `node_modules`, располагаются в корне проекта, а не внутри `/frontend`.
- **Разделение ответственности:** Проект имеет строгую двухкомпонентную структуру (`/frontend` и `/backend`).
- **Безопасный и предсказуемый рабочий процесс:** Мы следуем четкой последовательности: Разработка -> Коммит -> Сборка -> Синхронизация.
- **Гибридный подход к качеству кода:** Используется Biome для быстрой проверки JS/CSS и Prettier с плагином для надежного форматирования шаблонов Nunjucks.
- **Продвинутый шаблонизатор:** Nunjucks настроен с поддержкой Front Matter для данных на уровне страницы и глобальных файлов данных для всего сайта.
- **Профессиональная архитектура:** Файловая структура как исходников (`/frontend/src`), так и итоговой сборки (`/dist`) четко организована и предсказуема.
- **Автоматическое управление путями:** `manifest.json` и PHP-функция `get_asset()` решают проблему версионирования ассетов в бэкенд-системах вроде WordPress.
- **Надежный откат через Git:** Откат любых неудачных изменений производится стандартной командой `git revert`.

## 2. Рабочий процесс и Управление версиями

Для обеспечения предсказуемости и отслеживания истории изменений, мы придерживаемся следующего строгого пошагового процесса для завершения и публикации блока работ.

**Шаг 1: Закоммитить проделанную работу**
Сначала фиксируем все изменения в коде. Это основной коммит, описывающий, что было сделано (например, "feat(auth): add login form" или "fix(styles): correct header alignment").

````bash
git add .
git commit -m "feat(images): implement automatic image optimization"
Шаг 2: Повысить версию проекта
Теперь, когда код зафиксирован, используем pnpm для формального повышения версии согласно SemVer (major, minor, patch). Эта команда автоматически создаст второй коммит (например, v1.0.1) и Git-тег v1.0.1 на нём.
code
Bash
pnpm version patch
Шаг 3: Отправить всё на сервер
Используем флаг --follow-tags, чтобы одной командой отправить и все коммиты, и связанный с ними новый тег.
code
Bash
git push --follow-tags
3. Правила нашей совместной работы
Методичный пошаговый подход: Все действия, особенно касающиеся настройки окружения и выполнения команд, выполняются строго пошагово (одна команда за раз).
Слово-команда "дальше": Переход к следующему действию осуществляется только после подтверждения с вашей стороны (слово-команда: дальше).
Полнота предоставляемой информации: Когда требуется предоставить содержимое файла (например, vite.config.js), оно должно быть предоставлено полностью, без сокращений и с сохранением всех комментариев.
Сохранение целостности плана: Этот документ (PLAN.md) должен всегда предоставляться в полной, не сокращенной версии.
Информативный вывод в консоли: Все скрипты и процессы сборки должны предоставлять четкую обратную связь.
Поиск решений для новых задач: Если для новой задачи требуется плагин или зависимость, не описанная в первоначальном плане, я обязан найти актуальное, реально существующее решение.
4. Используемый стек и окружение
Разрабатываем на: Arch Linux + zsh + yay + micro + VS Code (nvim в планах).
Инструмент	Версия/Менеджер	Назначение
ОС	Arch Linux	Основная среда разработки.
mise	latest (из оф. репо)	(Локально) Управляет версиями инструментов (Node.js, pnpm).
pnpm	mise (Локально)	Основной пакетный менеджер для фронтенда.
DDEV	latest (Окружение)	Управляет всем локальным серверным окружением на базе Docker.
WP-CLI	Встроен в DDEV (Окружение)	Интерфейс командной строки для WordPress.
Vite	latest (Локально)	Сборщик фронтенда.
Underscores (_s)	latest (Пример)	Стартовая тема-каркас для WordPress.
5. Архитектура и файловая структура
code
Code
.
├── backend
│   ├── .env
│   └── wp-content
│       ├── plugins
│       └── themes
│           └── my-theme
├── biome.json
├── frontend
│   ├── .env
│   ├── public
│   │   ├── favicon.svg
│   │   └── robots.txt
│   └── src
│       ├── assets
│       │   ├── fonts
│       │   ├── icons
│       │   ├── images
│       │   └── svg
│       ├── data
│       │   └── site.json
│       ├── js
│       │   ├── app.js
│       │   ├── lib
│       │   └── modules
│       ├── scss
│       │   ├── abstracts
│       │   ├── app.scss
│       │   ├── base
│       │   ├── components
│       │   ├── layout
│       │   └── pages
│       └── views
│           ├── components
│           ├── layouts
│           ├── macros
│           ├── pages
│           └── partials
├── .gitignore
├── node_modules/
├── package.json
├── plan.md
├── playwright.config.js
├── pnpm-lock.yaml
├── postcss.config.js
├── posthtml.config.js
├── .prettierrc.json
├── scripts
│   ├── compress-images.js
│   ├── convert-images.js
│   ├── make-critical.js
│   └── optimize-svg.js
├── status.md
├── temp.txt
├── .tool-versions
└── vite.config.js
6. Настройка Vite: Шаблонизатор и структура сборки
Настройка build.rollupOptions.output в vite.config.js:
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
        const extType = (assetInfo.fileName || assetInfo.name).split(".").pop();
        if (/css/i.test(extType)) return "css/app.[hash].css";
        if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp|avif/i.test(extType)) return "img/[name].[hash][extname]";
        if (/woff|woff2|eot|ttf|otf/i.test(extType)) return "fonts/[name].[hash][extname]";
        return "[name].[hash][extname]";
      },
      manualChunks(id) {
        if (id.includes('node_modules')) {
          return 'vendor';
        }
      },
    },
  },
},```

## 7. Качество кода и форматирование: Гибридный подход Biome + Prettier
**Установка зависимостей:** `pnpm add -D @biomejs/biome prettier @prettier/plugin-nunjucks`

**Скрипты в `package.json` (с корректными путями):**
```json
{
  "scripts": {
    "format:code": "biome format --write ./frontend/src",
    "format:templates": "prettier --write \"./frontend/src/views/**/*.njk\"",
    "format": "pnpm format:code && pnpm format:templates",
    "lint:code": "biome lint --apply ./frontend/src",
    "check": "pnpm lint:code && pnpm format"
  }
}
8. Рабочий процесс тестирования: "Проверяй то, что отдаешь"
(Настройки Playwright актуальны и находятся в playwright.config.js)
9. Безопасный рабочий процесс и интеграция с бэкендом
Скрипт sync:theme в package.json:```json
{
"scripts": {
"sync:theme": "if [ -n "$(git status --porcelain)" ]; then echo '❌ Ошибка: Обнаружены незакоммиченные изменения!'; exit 1; fi && echo '✅ Рабочая директория чиста, начинаю синхронизацию...' && rsync -av --delete dist/ backend/wp-content/themes/my-theme/assets/"
}
}
code
Code
**PHP-функция `get_asset` в `functions.php` (WordPress):**
```php
<?php
function get_asset($entry) {
    static $manifest = null;
    $manifestPath = get_template_directory() . '/assets/manifest.json';

    // Читаем manifest.json только один раз для производительности
    if ($manifest === null) {
        if (!file_exists($manifestPath)) {
            // В режиме разработки manifest.json может не существовать
            // Возвращаем путь к dev-серверу Vite
            $dev_server_url = 'http://localhost:5173'; // Убедитесь, что порт совпадает
            return $dev_server_url . '/frontend/src/' . $entry;
        }
        $manifest = json_decode(file_get_contents($manifestPath), true);
    }

    // Ищем запрошенный файл в манифесте
    if (isset($manifest[$entry]['file'])) {
        return get_template_directory_uri() . '/assets/' . $manifest[$entry]['file'];
    }

    // Если файл не найден, возвращаем пустую строку или выбрасываем ошибку
    // Это предотвращает загрузку несуществующих ресурсов
    error_log("Asset not found in manifest.json: " . $entry);
    return '';
}
10. Обязательный плагин для WordPress: Контроль ресурсов
Современная frontend-сборка с помощью Vite решает только половину задачи по оптимизации. Вторая — контроль над ресурсами, которые загружают сторонние плагины в WordPress. Для этого обязательна установка плагина-менеджера ресурсов, например, Asset CleanUp: Page Speed Booster.
11. План реализации (Финальный чек-лист)
Фаза 0: Фундамент (ЗАВЕРШЕНА)
Фаза 1: Базовая настройка Frontend-сборки (ЗАВЕРШЕНА)
Фаза 1.5: Дополнительная настройка фронтенда (ЗАВЕРШЕНА)
ТЕКУЩИЙ ЭТАП -> Фаза 1.7: Рефакторинг исходного кода
Этот этап посвящен полной переработке и адаптации исходного кода проекта под новую сборочную систему и современные практики.
SCSS: Глубокий рефакторинг с переходом на модульную систему @use и @forward.
Nunjucks: Анализ и структурирование шаблонов (layouts, partials, macros).
JavaScript: Перенос логики в модульную структуру.
СЛЕДУЮЩИЙ ЭТАП -> Фаза 1.8: Финальное интеграционное тестирование
После завершения рефакторинга и переноса реального кода проекта мы проведем комплексное тестирование всей frontend-сборки "от и до".
Запуск Dev-сервера: Проверить корректность запуска, доступ по локальной сети, скорость HMR.
Проверка fontaine: Убедиться, что в итоговом CSS генерируются @font-face правила для fallback-шрифтов.
Проверка SCSS: Убедиться, что все стили компилируются корректно с новой модульной структурой.
Проверка SVG-спрайта: Убедиться, что спрайт генерируется и иконки доступны в Nunjucks.
Запуск Production-сборки: Выполнить pnpm build и проверить, что директория /dist создается согласно структуре в vite.config.js.
Запуск анализатора: Выполнить pnpm build:stats и проверить, что бандлы (app, vendor) выглядят корректно.
Фаза 2: Настройка бэкенда (WordPress)
Фаза 3: Интеграция и DX
Фаза 4: Развертывание (Деплой)
Фаза 5: Упаковка в Yeoman-генератор
12. План на будущее: Превращение шаблона в "Конструктор"
Когда вы будете готовы, вот как это будет реализовано. Ваш Yeoman-генератор будет использовать prompts (вопросы), чтобы спрашивать у пользователя, что он хочет, а затем условную логику, чтобы включать или выключать части нашего чек-листа.
Пример, как это будет работать:
Запуск генератора: yo my-generator
Вопрос 1 (Тип проекта):
code
Code
? Какой тип проекта вы создаете?
> Landing Page (Статический сайт)
> WordPress + DDEV
Вопрос 2 (Шаблонизатор):
code
? Какой шаблонизатор вы хотите использовать?
> Nunjucks
> Mustache
> Plain HTML (с инклюдами)
Вопрос 3 (CSS):
code
Code
? Какой препроцессор CSS?
> SASS/SCSS
> PostCSS-only
13. Вспомогательные (Utility) Скрипты
Помимо основных команд dev и build, проект включает отдельные скрипты для выполнения разовых задач.
favicons:generate
images:compress
images:convert
svg:optimize
test:fonts
````
