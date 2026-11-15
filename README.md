# Vite Bridge Boilerplate

Монорепозиторий-заготовка для быстрого старта вёрстки с мостом в WordPress.
Фронтенд собирается Vite'ом из `frontend/src`, готовые ассеты подключаются в
тему WordPress через `manifest.json` и PHP-хелпер `get_asset()`.

👉 **[Инструкция по работе с ассетами (Cookbook)](./docs/ASSETS_GUIDE.md)** —
куда класть картинки и иконки и как их использовать в Nunjucks и PHP.

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

**Нативные модули (`sharp` для конвертации картинок) работают «из коробки»:**
пребилды `@img/sharp-<платформа>` ставятся как обычные зависимости без
дополнительных подтверждений, а `pnpm install` не показывает предупреждение
«Ignored build scripts» — sharp намеренно объявлен в
`ignoredBuiltDependencies`, а `@parcel/watcher` — в `onlyBuiltDependencies`
в `pnpm-workspace.yaml` (подробности — комментарий там же).

Если на машине есть **системный libvips** (пакет `libvips` в репозитории
дистрибутива): не переносите sharp из `ignoredBuiltDependencies` в
`onlyBuiltDependencies` — его install-скрипт увидит системный libvips и
уйдет в сборку из исходников, похоронив `pnpm install`. Пребилды sharp
работают и без этого скрипта.

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
| `pnpm build` | Production-сборка: генерация фавиконок → оптимизация изображений → `vite build` → `dist/` (с AVIF и фавиконками; Critical CSS сюда не входит — он замедляет сборку, см. `build:prod`). |
| `pnpm build:wp` | То же в режиме WordPress: ассеты собираются сразу в `backend/wp-content/themes/my-theme/assets/` (HTML не собирается, разметку рендерит PHP). |
| `pnpm build:prod` | Финальная сборка для статического деплоя: `pnpm build` + инлайн **Critical CSS** в HTML (`scripts/make-critical.ts`). |
| `pnpm preview` | Локальный сервер для проверки собранной версии (`dist/`). |
| `pnpm verify` | `pnpm build` + прогон Playwright-тестов. |
| `pnpm test:ui` | Playwright-тесты в UI-режиме. |
| `pnpm test:update` | Пересборка + обновление снапшотов Playwright. |
| `pnpm check` | Линт (Biome) + форматирование (Biome + Prettier). |
| `pnpm test:build` | Build-smoke: проверка артефактов сборки в `dist/` (см. `scripts/check-build.ts`). |
| `pnpm sync:theme` | Синхронизация `dist/` в тему WordPress (блокируется при грязном `git status`). |
| `pnpm build:wp-strip-avif` | Вырезает AVIF-фрагменты из PHP/HTML/CSS темы (перед деплоем на шаред-хостинг, см. «Деплой»). |
| `pnpm strip-avif:dist` | Копия `dist/` → `dist-wp/` без AVIF (статический деплой, оригинал не трогается). |

### Вспомогательные (utility) скрипты

| Команда | Описание |
| --- | --- |
| `pnpm test:fonts` | Страница тестирования шрифтов (`/pages/test-fonts.html`) в dev-режиме. |
| `pnpm favicons:generate` | Генерация favicon/PWA-ассетов из `frontend/public/favicon.svg` → `frontend/public/assets/favicons/` (автоматически выполняется перед каждой сборкой; подробнее — [Cookbook](./docs/ASSETS_GUIDE.md)). |
| `pnpm images:convert` | Конвертация изображений в WebP/AVIF (sharp). |
| `pnpm images:compress` | Сжатие изображений (входит в `pnpm build`). |

## Структура проекта

```
.
├── backend/                  # WordPress: ядро (gitignored), DDEV-конфиг (.ddev/), тема wp-content/themes/my-theme
│   └── wp-content/themes/my-theme/
├── docs/                     # Пользовательская документация (Cookbook ассетов и др.)
├── frontend/
│   ├── public/               # Статика, копируемая в сборку как есть
│   ├── raw/                  # Исходники ассетов smart-assets (img/icons/ui — см. Cookbook)
│   └── src/
│       ├── assets/           # fonts, icons, images, svg (легаси-источники, мигрируются в raw/)
│       ├── data/             # Глобальные данные шаблонов (site.json)
│       ├── js/               # app.ts (точка входа), lib/, modules/
│       ├── scss/             # ITCSS: abstracts, base, layout, components, pages, utils, vendor, generated
│       └── views/            # Nunjucks: layouts, pages, partials, components, macros
├── packages/                 # Локальные пакеты pnpm-workspace (vite-plugin-smart-assets)
├── scripts/                  # Utility-скрипты (изображения, SVG, critical CSS)
├── vite.config.ts            # Конфигурация сборки
├── playwright.config.ts      # Конфигурация e2e-тестов
└── PLAN.md                   # Архитектура и чек-лист фаз (источник правды)
```

## Ассеты (smart-assets): кратко

Единственный image-пайплайн проекта — локальный пакет
`packages/vite-plugin-smart-assets`. На старте сборки/dev-сервера он сканирует
`frontend/raw/` (простым языком — что куда класть и как использовать, см.
**[Cookbook](./docs/ASSETS_GUIDE.md)**):

| Ассет | Маршрут в сборке |
| --- | --- |
| `.jpg/.jpeg/.png` | `assets/img/name.<hash>.<ext>` + варианты webp/avif (quality 80) + retina-пары `@2x` (исходники шире 800px считаются 2x) |
| `.svg` иконки | inline → `assets/ui/<имя>.svg` (порог: ≤ 15 штук, ≤ 30 КБ raw, ≤ 15 КБ gzip) или общий спрайт `assets/icons/sprite.<hash>.svg` |
| `.svg` иллюстрации | `assets/img/<имя>.<hash>.svg` (вывод через `<img>`) |

- Файлы и манифест эмитятся и в dev-режиме из памяти: middleware раздает
  `assets/…`, watcher следит за `raw/` и делает full-reload при изменениях.
- Вывод в шаблонах — Nunjucks-макросы **`ui.picture()`** (готовый `<picture>`
  из AVIF/WebP-вариантов) и **`ui.icon()`** (инлайн `<svg>` / `<use>` спрайта /
  `<img>` иллюстрации — по записи манифеста, `| safe` не нужен): фильтры
  `smartPicture`/`smartSvg` в `vite.config.ts` проецируют состояние плагина и
  `projectSvg` в SafeString. CSS-фоны — через миксин `bgset()` +
  сгенерированную карту путей (`frontend/src/scss/generated/_smart-assets-map.scss`
  — генерируется, не коммитится). Примеры — в Cookbook.
- WP-сборка (`pnpm build:wp`) пишет файлы прямо в `<тема>/assets/` — плоско
  (совместимость с WP-плагинами и `strip-avif.js`), `scope=""`.
- Манифест `assets-manifest.json` (в корне outDir) содержит запись на каждый
  ассет: `source`, `output`/`file`, хеш, размеры, варианты (у SVG — `kind`,
  `mode`, `symbol` для спрайтов). Устаревший пайплайн
  (image-optimize + img-to-picture + обертка `njkImgToPicture`) снят с производства.

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
- `<style>` с @media покрыт: `normalizeStyleElement` канонизирует вложенные
  блоки рекурсивно, медиа-каскад выживает (фикстура `style-media.svg`);
  `minifyStyles` отключён — csso дожёвывал осиротевший после inlineStyles
  @media-блок целиком.
- `<title>`/`<desc>` вынимаются с ЛЮБОЙ глубины (Figma кладёт их внутрь
  `<g>`): в meta попадает первый в документе каждого имени, все остальные
  вырезаются до svgo (иначе на втором прогоне «второй» ушёл бы в meta —
  идемпотентность).

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

В шаблонах ее вызывают за вас Nunjucks-фильтры `smartSvg`/`smartPicture`
(`vite.config.ts`, обертки в SafeString) — им пользуются макросы
`ui.icon()` и `ui.picture()`; примеры — в Cookbook. Плагин также дает
API `svgEntry(name)` / `svgInlineContent(entry)` для поиска записи и
нормализованного инлайн-контента по имени файла в `raw/`.

## Префиксация (prefixSvg)

Чтобы инлайн-иконки на одной странице не перезаписывали `id`, `url(#)` и классы друг друга, 
они проходят через `prefixSvg(svg, prefix)`. Функция префиксует `id`, `class`, `url(#)`, 
а также селекторы и `@keyframes` внутри `<style>`.

## Интеграция в Vite

Vite-плагин автоматически сканирует SVG-файлы в исходниках, прогоняет их через пайплайн
(нормализация → классификация → префиксация → сборка) и раскладывает по папкам `dist/assets/ui/` 
и `dist/assets/icons/`. Информация о них попадает в общий `assets-manifest.json`.

Как пользоваться результатом из Nunjucks-шаблонов и PHP (инлайн-иконки, `<use>`,
`<img>`) — см. разделы 3–4 **[Cookbook](./docs/ASSETS_GUIDE.md)**.

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
из `frontend/public` скопирована. Проверки image-пайплайна обновлены под архитектуру
smart-assets (Phase 3+): в `index.html` есть демо-`<picture>` от `ui.picture('boiler-demo')`,
в `assets-manifest.json` у каждого растра есть webp/avif-варианты и все файлы
вариантов лежат в dist, SVG-записи конвейера имеют относительные `file`,
а сам `smartAssets()` подключен в `vite.config.ts`.

**E2E** (`pnpm playwright test`) — тесты в `frontend/tests/` против собранной версии
(preview-сервер, порты из `playwright.config.ts`):

- `page-smoke.spec.ts` — страницы открываются, разметка на месте, нет ошибок в консоли;
- `interactive.spec.ts` — модули modals (открытие/закрытие, Esc, оверлей, кнопка закрытия),
  mobile-menu (`.active` + `aria-expanded`), accordion, scroll-to-top, video (iframe по клику);
- `forms.spec.ts` — санитайзер телефона + маска Inputmask, honeypot, скрытое поле `loc`,
  блокировка отправки невалидной формы;
- `picture.spec.ts` — image-пайплайн: `<picture>` с AVIF/WebP на главной,
  атрибуты обернутого `<img>`, варианты отдаются сервером, браузер выбирает AVIF.

Прогон: **64 теста (chromium + firefox) — все зелёные**; build-smoke: **42/42**.
WebKit временно отключён в конфиге — в песочнице нет системных зависимостей
(нужен `pnpm playwright install-deps webkit` с sudo); как вернуть — см. комментарий
в `playwright.config.ts`.

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
  `assets/manifest.json` + собранные файлы. `get_asset('frontend/src/js/app.ts')`
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
тестом `frontend/tests/build-output.spec.ts`.

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
- удаляет файлы `*.avif` (сироты после вырезки ссылок) и чистит манифесты:
  `manifest.json` (записи с avif-файлом) и `assets-manifest.json` (avif-варианты
  из `variants` — иначе `theme_picture()` на живой теме генерировала бы ссылки
  на удаленные файлы);
- `inc/helpers.php` (динамические картинки из uploads) не вырезается: его avif-логика
  file_exists-guarded — сиблингов нет → разметки нет, это контракт, а не битая ссылка;
- после вырезки сканирует тему: если остались **файловые ссылки** на `.avif`
  (регэксп `\.avif\b`; голые слова «AVIF» в тексте и ключи формата в коде —
  не ссылки) — перечисляет их с файлами и строками и завершается с ошибкой:
  деплоить нельзя. `tests/` из сканирования исключены (dev-артефакты);
- идемпотентен: повторный запуск ничего не меняет;
- повторный `pnpm build && pnpm sync:theme` возвращает AVIF — когда хостинг
  «подрастёт», просто перестаньте запускать шаг 4.

### Статический деплой `dist/` без AVIF (`dist-wp/`)

**Для локальной разработки и DDEV используйте `dist/`. Для заливки на слабый
хостинг используйте `dist-wp/`.**

Для деплоя соберите финальную версию со встроенным Critical CSS и вырежьте AVIF:

1. `pnpm build:prod` — `pnpm build` + инлайн Critical CSS в HTML (`dist/`
   остается локальным, для preview/тестов).
2. `pnpm strip-avif:dist` — скрипт (`scripts/strip-avif-dist.ts`) копирует
   `dist/` → `dist-wp/` (оригинал не трогается), вырезает AVIF общими правилами
   (`scripts/strip-avif-rules.ts` — общие с theme-стритом), удаляет `*.avif`-файлы
   и чистит оба манифеста; в конце — та же контрольная проверка файловых ссылок.
   Каждый запуск пересобирает `dist-wp/` с нуля из текущего `dist/`, поэтому
   шаг 2 выполняют сразу после каждой пересборки.

Про Critical CSS (`scripts/make-critical.ts`, выполняется `build:prod`):

- для каждого HTML-файла в `dist/` вычисляется критический CSS (вьюпорты
  1300×900 и 414×896) и инлайнится в `<head>`; исходный `<link rel="stylesheet">`
  становится `rel="preload"`, а рабочий линк добавляется в `<body>` — стили
  грузятся даже с отключенным JavaScript;
- обычный `pnpm build` выполняется без Critical CSS (Puppeteer добавляет ~15 с) —
  он предназначен для локальных проверок; финальный деплой делайте через
  `pnpm build:prod`;
- в `build:wp` Critical CSS отсутствует намеренно: WP-сборка не строит HTML
  (разметку рендерит PHP), инлайнить некуда.

## Инструменты разработки (dev-only)

- **vite-njk-trace** — в dev-режиме оборачивает фрагменты Nunjucks HTML-комментариями
  `<!-- NJK: START/END path/to/file.njk -->`, чтобы в DevTools было видно, из какого
  шаблона пришёл каждый фрагмент. В production-сборку не попадает (apply: "serve").
- **debug-css-overflow** — виджет-детектор горизонтального переполнения в dev-режиме
  (горячие клавиши: Alt+O — подсветка нарушителей, Ctrl+Alt+O — свернуть виджет).
  Подключен в `app.ts` под `if (import.meta.env.DEV)` и вырезается из production-бандла.

## Рабочий процесс

1. Закоммитить проделанную работу: `git commit -m "feat(scope): ..."`
2. Поднять версию после завершения блока работ: `pnpm version patch|minor`
3. Отправить на сервер: `git push --follow-tags` — этот шаг выполняется
   вручную человеком после слияния веток; агент в песочнице push не выполняет.
