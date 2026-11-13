# Vite Bridge Boilerplate

Монорепозиторий-заготовка для быстрого старта вёрстки с мостом в WordPress.
Фронтенд собирается Vite'ом из `frontend/src`, готовые ассеты подключаются в
тему WordPress через `manifest.json` и PHP-хелпер `get_asset()`.

## Стек

- **Vite** — сборщик фронтенда (dev-сервер, production-сборка, manifest).
- **Nunjucks** — шаблонизатор HTML (front matter, макросы, layouts/partials/components).
- **SCSS / ITCSS** — модульная архитектура стилей на `@use` / `@forward` с "бочковыми" `_index.scss`.
- **WordPress / DDEV** — бэкенд: тема в `backend/wp-content/themes/my-theme`, серверное окружение через DDEV.
- **mise** — управление версиями инструментов (см. `.tool-versions`).
- **pnpm** — пакетный менеджер (только pnpm, без npm/yarn).
- **zsh** — все shell-скрипты проекта совместимы с zsh.
- **Biome + Prettier** — гибридное качество кода: Biome для JS/CSS, Prettier для Nunjucks-шаблонов.
- **Playwright** — e2e-тесты собранной версии ("проверяй то, что отдаёшь").

## Требования

**⚠️ Node.js LTS (v20 или v22) — строго обязательно.** На «свежих» не-LTS
версиях (например, v24) нет пребилдов нативных модулей (sharp и др.) —
`pnpm install` падает в компиляцию через node-gyp и обрывается с ошибкой
сборки. Проверка встроена в установку: `preinstall`-скрипт
`scripts/check-node.js` читает `process.version` и на не-LTS Node
прерывает `pnpm install` красным баннером с инструкцией. Исправление:

```bash
mise use node@22   # переключить проект на LTS и прописать в .tool-versions
pnpm install       # повторить установку
```

Если на машине есть **системный libvips** (пакет `libvips` в репозитории
дистрибутива): не возвращайте sharp в `onlyBuiltDependencies` — его
install-скрипт увидит системный libvips и уйдет в сборку из исходников,
похоронив `pnpm install`. Пребилды sharp работают без этого скрипта
(подробности — комментарий в `pnpm-workspace.yaml`).

- [Docker](https://docs.docker.com/get-docker/) — среда контейнеров для локального WordPress-окружения.
- [DDEV](https://ddev.readthedocs.io/en/stable/) — управление бэкенд-окружением в `backend/` (`ddev start`, `ddev wp ...`).
- [mise](https://mise.jdx.dev/) (версии node/pnpm берутся из `.tool-versions`; проект — Node 22 LTS)
- rsync (для `sync:theme`)
- DPX (опционально) — надстройка над DDEV (`~/.local/bin/dpx`): создание проектов (`dpx new-wp`), публичные туннели, `db pull` с продакшена.
- CK — Context Keeper (опционально, `~/.local/bin/ck`) — «внешняя память» разработчика: задачи и контекст сессий (папка `.ck/` в корне репозитория).

## Быстрый старт

```bash
pnpm install   # установить зависимости
pnpm dev       # запустить dev-сервер (http://localhost:5173)
```

## Основные команды

| Команда | Описание |
| --- | --- |
| `pnpm dev` | Dev-сервер Vite с горячей перезагрузкой. |
| `pnpm build` | Production-сборка: оптимизация изображений/SVG → `vite build` → `dist/`. |
| `pnpm preview` | Локальный сервер для проверки собранной версии (`dist/`). |
| `pnpm verify` | `pnpm build` + прогон Playwright-тестов. |
| `pnpm test:ui` | Playwright-тесты в UI-режиме. |
| `pnpm test:update` | Пересборка + обновление снапшотов Playwright. |
| `pnpm check` | Линт (Biome) + форматирование (Biome + Prettier). |
| `pnpm test:build` | Build-smoke: проверка артефактов сборки в `dist/` (см. `scripts/check-build.js`). |
| `pnpm sync:theme` | Синхронизация `dist/` в тему WordPress (блокируется при грязном `git status`). |
| `pnpm build:wp-strip-avif` | Вырезает AVIF-фрагменты из PHP/HTML/CSS темы (перед деплоем на шаред-хостинг, см. «Деплой»). |

### Вспомогательные (utility) скрипты

| Команда | Описание |
| --- | --- |
| `pnpm test:fonts` | Страница тестирования шрифтов (`/pages/test-fonts.html`) в dev-режиме. |
| `pnpm favicons:generate` | Генерация favicon/PWA-ассетов из `frontend/public/favicon.svg`. |
| `pnpm images:convert` | Конвертация изображений в WebP/AVIF (sharp). |
| `pnpm images:compress` | Сжатие изображений (входит в `pnpm build`). |
| `pnpm svg:optimize` | Оптимизация SVG (svgo, входит в `pnpm build`). |

## Структура проекта

```
.
├── backend/                  # WordPress: ядро (gitignored), DDEV-конфиг (.ddev/), тема wp-content/themes/my-theme
│   └── wp-content/themes/my-theme/
├── frontend/
│   ├── public/               # Статика, копируемая в сборку как есть
│   └── src/
│       ├── assets/           # fonts, icons, images, svg
│       ├── data/             # Глобальные данные шаблонов (site.json)
│       ├── js/               # app.js (точка входа), lib/, modules/
│       ├── scss/             # ITCSS: abstracts, base, layout, components, pages, utils, vendor
│       └── views/            # Nunjucks: layouts, pages, partials, components, macros
├── scripts/                  # Utility-скрипты (изображения, SVG, critical CSS)
├── vite.config.js            # Конфигурация сборки
├── playwright.config.js      # Конфигурация e2e-тестов
└── PLAN.md                   # Архитектура и чек-лист фаз (источник правды)
```

## Image-пайплайн: AVIF/WebP и `<picture>`

В шаблонах пишут обычный `<img>` — сборка сама оборачивает его в
`<picture>` и генерирует AVIF/WebP-варианты. Живой пример — секция
«Оптимизация изображений» на главной: в `index.njk` написан чистый
`<img>`, в `dist/index.html` он уже внутри `<picture>`.

**Картинки контента** (для `<img>` в Nunjucks):

1. Положите исходник в `frontend/src/assets/images/` — в размере 2x
   (ретина): 1x-вариант сборка получает ресайзом пополам.
2. Подключите в шаблоне: `<img src="assets/images/foo.jpg" alt="...">`.
3. `pnpm build` сделает остальное: в `dist/img/` появятся `foo.avif`,
   `foo.webp`, `foo.jpg` и их `@2x`-пары, а `<img>` превратится в
   `<picture>` с `<source type="image/avif">`, `<source type="image/webp">`
   и фолбэком-`<img>` (1x + 2x в srcset, `sizes`, `loading="lazy"`).

**Картинки по прямому URL** (CSS `background-image`, og:image, разметка
PHP-шаблонов) кладите в `frontend/public/img/`: они копируются в сборку
как есть, а `vite-plugin-image-optimize` генерирует рядом `.webp`/`.avif`-
сиблинги — ссылайтесь через CSS `image-set()` или вручную собранный
`<picture>`. Сгенерированные сиблинги — артефакт сборки, в git не
попадают (`.gitignore`). В WP-режиме HTML не собирается, поэтому для
PHP-разметки `<picture>` собирается руками (пример — превью YouTube в
`front-page.php`).

Как это устроено (порядок в `vite.config.js` важен — сначала генерация
форматов, потом HTML-трансформация):

| Шаг | Что делает |
| --- | --- |
| `vite-plugin-image-optimize` | До сборки — сиблинги AVIF/WebP для `public/img`; после — дожимает jpg/png/svg в `dist/img`. AVIF/WebP из дожима исключены: их уже сгенерировал img-to-picture, повторное перекодирование портило бы качество. |
| `@atrocityz/vite-plugin-html-img-to-picture` | Генерирует варианты (1x/2x × AVIF/WebP/JPG) и оборачивает `<img>` в `<picture>`. Умеет обрабатывать только реальные HTML-файлы, а страницы этого проекта собираются из `.njk` — поэтому… |
| обертка `njkImgToPicture` (локальный плагин) | …делегирует ему каждый собранный HTML-asset в `generateBundle` и после трансформации чинит `height` по реальному аспекту исходника (плагин пишет `height=width`). Подробности — комментарий в `vite.config.js`. |

Нюансы:

- `outputDir: "img"` у img-to-picture — пути в `<picture>` относительные
  (`img/...`), это требование `base: './'` (file://-открытие dist);
  абсолютные пути к ассетам запрещает build-smoke (`pnpm test:build`).
- Качество конвертации — `quality: 80` (img-to-picture); сжатие
  исходников до сборки — `compress-images.js` (TinyPNG): нет валидных
  ключей — warning, сборка не падает. Сжатые копии (`images-tiny/`) —
  артефакт, в `<picture>`-пайплайн они не подмешиваются.
- Не обрабатываются: внешние `http(s)`-ссылки, data-URI, абсолютные пути
  (`/...`) и SVG.

## Что svgo делает и чего не делает

- viewBox гарантирован. Если в исходнике его не было — синтезируется из
  width/height. Нет ни того, ни другого → сборка падает с понятной ошибкой.
- id/классы/url(#) сохраняются. cleanupIds отключён — иначе сломались бы
  градиенты и symbol/use.
- Пути (d) не оптимизируются. convertPathData отключён ради стабильного
  canonicalHash (детект дублей на шаге 2). Экономия на иконочных наборах
  оценивается в 5–15%, отказ осознанный. Кому надо — флаг `--aggressive`
  (появится позже, ломает parity-тест — не включать в CI).
- removeUnknownsAndDefaults отключён. Атрибуты вроде xmlns:xlink и role
  сохраняются — плагин удаляет их по эвристике, которая нам не подходит.
- `<style>` с @media / вложенными селекторами не покрыт тестами на этом шаге.
  Префиксация и её тесты — шаг 3.

## Как плагин классифицирует SVG

Каждый SVG проходит через `classifyOne()` — чистое дерево решений:

| Признак | kind | mode |
|---|---|---|
| есть `<symbol>` | sprite | sprite |
| есть `<animate*>` / `@keyframes` / `animation:` / `<script>` | animated | inline |
| есть `url(#...)` или `<image>` | illustration | img |
| есть `currentColor` | icon | inline или sprite |
| ≤2 цветов + маленький viewBox (<64) или размер <4KB | icon | inline или sprite |
| ≤2 цветов, большой viewBox | illustration | img |
| >2 цветов | illustration | img |
| иначе | unknown | error |

Порог inline-vs-sprite (только для `icon`): все три условия, иначе sprite.
- count ≤ 15
- raw ≤ 30 KB
- gzip ≤ 15 KB

Gzip без raw недооценивает стоимость инлайна (inline повторяется в каждой странице).

## Сборка спрайта (sprite.svg)

Иконки с `mode: 'sprite'` собираются в единый `sprite.svg`. 
Чтобы избежать коллизий, все `id`, `url(#...)`, классы в `<style>` и имена `@keyframes` 
автоматически префиксируются именем иконки (например, `user-grad`, `.user-cls-1`).

Корневой `<svg>` спрайта имеет `width="0" height="0" style="position:absolute;overflow:hidden"` 
для совместимости со старыми браузерами. Использование: `<use href="sprite.svg#user">`.

## Манифест SVG (manifest.json)

Все обработанные SVG попадают в общий `manifest.json` (массив `entries`). 
Для каждого файла указываются поля: `source` (исходный путь), `file` (путь в dist), 
`kind`, `mode`, `symbol` (для спрайтов) и `hash`.

**Важно:** пути в `file` всегда относительные (без ведущего `/`), например: 
`assets/icons/sprite.1a2b3c4d.svg`.

## Хелперы проекции (projectSvg)

Функция `projectSvg(entry, options, inlineContent)` превращает запись из манифеста в HTML.

- `mode: 'inline'`: возвращает `<svg>` с `aria-hidden` и `focusable="false"`.
- `mode: 'sprite'`: возвращает `<svg><use href="sprite.abc.svg#user"></use></svg>` (пути относительные, без `/`).
- `mode: 'img'`: возвращает `<img>` с `loading="lazy"` и `alt` из `options`.

## Префиксация (prefixSvg)

Чтобы инлайн-иконки на одной странице не перезаписывали `id`, `url(#)` и классы друг друга, 
они проходят через `prefixSvg(svg, prefix)`. Функция префиксует `id`, `class`, `url(#)`, 
а также селекторы и `@keyframes` внутри `<style>`.

## Интеграция в Vite

Vite-плагин автоматически сканирует SVG-файлы в исходниках, прогоняет их через пайплайн
(нормализация → классификация → префиксация → сборка) и раскладывает по папкам `dist/assets/ui/` 
и `dist/assets/icons/`. Информация о них попадает в общий `assets-manifest.json`.

## Статус реализации

Подробный чек-лист — в `PLAN.md`, раздел "11. План реализации".

- [x] Фаза 0 — Фундамент
- [x] Фаза 1 — Базовая настройка frontend-сборки
- [x] Фаза 1.5 — Дополнительная настройка фронтенда
- [x] Фаза 1.7 — Рефакторинг исходного кода (SCSS / Nunjucks / JS)
- [x] Фаза 1.8 — Финальное интеграционное тестирование
- [ ] Фаза 2 — Настройка бэкенда (WordPress)
- [ ] Фаза 3 — Интеграция и DX
- [ ] Фаза 4 — Развертывание (деплой)

## Тестирование

**Build-smoke** (`pnpm test:build`, скрипт `scripts/check-build.js`) проверяет артефакты
сборки: HTML-страницы собраны, `manifest.json` валиден и все его файлы существуют,
в HTML нет dev-артефактов (`@vite/client`, адрес dev-сервера, NJK-комментариев),
в исполняемом JS нет `debug-css-overflow`, нет осиротевших sourcemap'ов, статика
из `frontend/public` скопирована, в `index.html` есть `<picture>` с AVIF-источником
и все файлы из srcset лежат в `dist/img`.

**E2E** (`pnpm playwright test`) — тесты в `frontend/tests/` против собранной версии
(preview-сервер, порты из `playwright.config.js`):

- `page-smoke.spec.js` — страницы открываются, разметка на месте, нет ошибок в консоли;
- `interactive.spec.js` — модули modals (открытие/закрытие, Esc, оверлей, кнопка закрытия),
  mobile-menu (`.active` + `aria-expanded`), accordion, scroll-to-top, video (iframe по клику);
- `forms.spec.js` — санитайзер телефона + маска Inputmask, honeypot, скрытое поле `loc`,
  блокировка отправки невалидной формы;
- `picture.spec.js` — image-пайплайн: `<picture>` с AVIF/WebP на главной,
  атрибуты обернутого `<img>`, варианты отдаются сервером, браузер выбирает AVIF.

Прогон: **64 теста (chromium + firefox) — все зелёные**; build-smoke: **42/42**.
WebKit временно отключён в конфиге — в песочнице нет системных зависимостей
(нужен `pnpm playwright install-deps webkit` с sudo); как вернуть — см. комментарий
в `playwright.config.js`.

## Бэкенд: модульная тема WordPress

### Локальное окружение (DDEV)

Бэкенд поднимается в DDEV: проект `boiler-vite`, тип `wordpress`, docroot `backend/`,
конфигурация — `backend/.ddev/config.yaml` (создаётся командой
`ddev config --project-type=wordpress --docroot=. --project-name=boiler-vite --auto`).

```bash
cd backend
ddev start                 # поднять окружение → https://boiler-vite.ddev.site
ddev wp core download      # скачать ядро WordPress (при инициализации уже выполнено)
ddev wp core install --url=https://boiler-vite.ddev.site --title="Boiler Vite" \
  --admin_user=admin --admin_password=admin --admin_email=admin@example.com
ddev wp theme activate my-theme
```

- При первом `ddev start` DDEV сам создаёт `backend/wp-config.php` (метка
  `#ddev-generated`) — отдельный `wp config create` не нужен: доступы к БД
  (`db`/`db`/`db`) подключаются из `wp-config-ddev.php` внутри контейнера.
- Админка: https://boiler-vite.ddev.site/wp-admin (`admin`/`admin` — только
  для локального окружения, на продакшен эти доступы не переносятся).
- Ядро WordPress (`wp-admin/`, `wp-includes/`, `wp-*.php`, `xmlrpc.php`,
  дистрибутивные темы и плагины), `backend/.ddev/` и `wp-config-ddev.php`
  добавлены в `.gitignore`: в Git отслеживаются только исходники темы
  (`wp-content/themes/my-theme/`) и собственные файлы проекта.
- Полезные команды: `ddev describe` (URL и порты), `ddev wp ...` (WP-CLI),
  `ddev ssh`, `ddev logs`, `ddev poweroff` (остановить все проекты).

### DPX — обёртка над DDEV

`dpx` (опционально, `~/.local/bin/dpx`) умеет выполнять любые DDEV-команды за вас:
внутри папки проекта команда уходит напрямую в DDEV, вне проектов dpx показывает
интерактивное меню выбора проекта.

```bash
cd backend
dpx ddev restart            # то же, что ddev restart
dpx ddev wp rewrite flush   # WP-CLI через обёртку (сброс ЧПУ)
dpx ddev logs -f            # логи с любыми флагами DDEV

dpx list                    # проекты, зарегистрированные в dpx (metadata ~/.config/dpx/projects.json)
dpx info                    # отчет: окружение, зависимости и запущенные DDEV-проекты
```

Нюансы:

- `dpx` определяет проект по наличию `.ddev` в текущей папке — команды
  выполняются из `backend/`, из корня репозитория dpx проект не видит
  (`.ddev/` лежит в `backend/`).
- `dpx list` показывает только проекты, созданные через dpx; проект
  `boiler-vite` создавался `ddev config` напрямую, поэтому его нет в этом
  списке — его статус виден в `dpx info` и обычном `ddev list`.

Остальные возможности dpx (создание проектов `dpx new-wp`, публичные туннели
`dpx tunnel`, `db pull` с продакшена, бэкапы `dpx site backup`) — см. `dpx --help`.

Тема лежит в `backend/wp-content/themes/my-theme/`. `functions.php` — только
точка входа: он ничего не содержит, кроме `require_once` модулей из `inc/`.

```
backend/wp-content/themes/my-theme/
├── functions.php              # Точка входа: только require_once модулей из /inc
├── style.css                  # Заголовок темы (обязателен WP); стили ведутся в frontend/src/scss
├── index.php                  # Минимальный fallback-шаблон для активации темы
└── inc/
    ├── theme-support.php      # add_theme_support, register_nav_menus
    ├── enqueue-assets.php     # get_asset() + подключение CSS/JS из manifest.json
    └── custom-post-types.php  # CPT и таксономии (первый CPT: Портфолио)
```

Как работает подключение ассетов (`inc/enqueue-assets.php`):

- **Production:** после `pnpm build && pnpm sync:theme` в теме лежит
  `assets/manifest.json` + собранные файлы. `get_asset('frontend/src/js/app.js')`
  возвращает версионированный URL с хешем; CSS берётся из поля `css` entry.
- **Development:** если `manifest.json` отсутствует, `get_asset()` возвращает адрес
  файла на dev-сервере Vite (`http://localhost:5173`) — работает HMR из `pnpm dev`.

Подключение скрипта (Фаза 3.1): скрипт приложения ставится в `<head>` через
`wp_enqueue_script(..., false)` и получает `type="module"` фильтром
`script_loader_tag` (`my_theme_script_loader_tag()`). ES-модуль deferred по
умолчанию — отрисовку не блокирует. Скрипты плагинов и ядра фильтр не трогает.

### Сборка → синхронизация с темой

```bash
pnpm build        # соберет dist/ (manifest.json в корне)
pnpm sync:theme   # rsync dist/ → backend/wp-content/themes/my-theme/assets/
```

- `sync:theme` **блокируется**, если рабочее дерево грязное (`git status --porcelain`)
  — ассеты всегда соответствуют закоммиченному исходнику.
- `assets/` в теме — артефакт сборки (копия `dist/`), добавлен в `.gitignore`;
  в git попадает только исходный код.

### Относительные пути и открытие dist через file://

В сборке `base: './'`: пути к CSS/JS в собранном HTML — относительные
(`css/app.*.css`, `js/app.*.js`), поэтому `dist/index.html` открывается
двойным кликом (file://) **со стилями и картинками** — это проверяется
тестом `frontend/tests/build-output.spec.js`.

Ограничение платформы: исполняемый JS (`type="module"`) браузеры блокируют
на file:// (CORS для ES-модулей) — интерактив работает через `pnpm preview`
или на хостинге; это свойство ES-модулей, а не сборки.

`manifest.json` продолжает генерироваться в корне `dist/` (опция
`build.manifest`) и используется PHP-хелпером `get_asset()` на бэкенде;
внутри HTML он не нужен.

Правило: новая бэкенд-логика добавляется отдельным модулем в `inc/` и подключается
одной строкой в `functions.php`.

### Динамические изображения (`<img>` → `<picture>` из админки)

Статические картинки темы конвертируются на сборке (см. «Image-пайплайн»),
а за контент из админки отвечает `inc/helpers.php`
(`my_theme_replace_img_with_picture()`): фильтры `the_content`,
`post_thumbnail_html` и `woocommerce_product_get_image` (приоритет 99)
оборачивают каждый `<img>` в `<picture>` с AVIF/WebP-источниками, если
рядом с оригиналом в uploads лежат файлы-сиблинги:

```
wp-content/uploads/2026/11/photo.jpg        ← оригинал (фолбэк внутри <picture>)
wp-content/uploads/2026/11/photo.jpg.avif   ← сиблинг AVIF (первый source)
wp-content/uploads/2026/11/photo.jpg.webp   ← сиблинг WebP
```

- Сиблинги обычно создает плагин-конвертер (**Converter for Media**): он
  конвертирует загруженные файлы автоматически, хелпер просто находит
  готовые файлы на сервере (`file_exists` через `baseurl → basedir`).
- Плагина нет и сиблингов нет → `<img>` отдается **без изменений**
  (безопасный фолбэк: пустых `<picture>` не бывает).
- Проверяются только пути внутри uploads: внешние URL, `data:`-URI и
  относительные `src` проходят насквозь; `<img>` без `src` не оборачивается.
- Отказ от обертки для конкретной картинки — класс **`skip-picture`**.
- Оригинальный `<img>` остается внутри `<picture>` как есть — его `srcset`
  (добавленный ядром) продолжает работать как фолбэк.

Проверка логики: `pnpm test:wp` — mock-тест внутри DDEV (`wp eval-file`
`tests/helpers-eval.php`): фикстуры-сиблинги создаются в uploads,
16 проверок (обертка, частичные форматы, фолбэки, skip-picture,
подключение фильтров), фикстуры удаляются после теста. Требует
запущенного DDEV-проекта (`cd backend && dpx ddev start`).

## Деплой на шаред-хостинг

Шаред-хостинг не умеет конвертировать/отдавать AVIF, поэтому перед заливкой
из темы вырезаются все AVIF-фрагменты. В репозитории и на локальном DDEV
всё остаётся «полным» — AVIF-версии картинок лежат рядом с WebP.

Цепочка (каждый шаг — отдельная команда):

| Шаг | Команда | Что делает |
| --- | --- | --- |
| 1. Конвертация изображений | `pnpm images:convert` | Исходники из `frontend/src/assets/images-convert/source/` → WebP+AVIF в `.../result/`. Один раз перед сборкой: результат — исходники для Vite. |
| 2. Сборка | `pnpm build` | `dist/` с хешами и `manifest.json` (с AVIF). |
| 3. Синхронизация | `pnpm sync:theme` | `rsync dist/ → backend/wp-content/themes/my-theme/assets/` (требует чистый git status). |
| 4. Стрип AVIF | `pnpm build:wp-strip-avif` | Вырезает AVIF-фрагменты из PHP/HTML/CSS темы **in place**. |
| 5. Заливка | rsync/FTP/панель хостинга | Загружаете папку `backend/wp-content/themes/my-theme/` на хостинг. |

Про шаг 4 (`scripts/strip-avif.js`):

- вырезает `<source srcset="… .avif …">` и `background-image: image-set(…avif…)`
  (включая многострочные значения и вложенный `url()`), чистит лишние запятые;
- после вырезки сканирует тему: если нашлись оставшиеся упоминания AVIF
  (например, `<img srcset>` со списком, содержащим .avif) — перечисляет их
  с файлами и строками и завершается с ошибкой: деплоить нельзя;
- идемпотентен: повторный запуск ничего не меняет;
- повторный `pnpm build && pnpm sync:theme` возвращает AVIF — когда хостинг
  «подрастёт», просто перестаньте запускать шаг 4.

## Инструменты разработки (dev-only)

- **vite-njk-trace** — в dev-режиме оборачивает фрагменты Nunjucks HTML-комментариями
  `<!-- NJK: START/END path/to/file.njk -->`, чтобы в DevTools было видно, из какого
  шаблона пришёл каждый фрагмент. В production-сборку не попадает (apply: "serve").
- **debug-css-overflow** — виджет-детектор горизонтального переполнения в dev-режиме
  (горячие клавиши: Alt+O — подсветка нарушителей, Ctrl+Alt+O — свернуть виджет).
  Подключен в `app.js` под `if (import.meta.env.DEV)` и вырезается из production-бандла.

## Рабочий процесс

1. Закоммитить проделанную работу: `git commit -m "feat(scope): ..."`
2. Поднять версию после завершения блока работ: `pnpm version patch|minor`
3. Отправить на сервер: `git push --follow-tags` — этот шаг выполняется
   вручную человеком после слияния веток; агент в песочнице push не выполняет.
