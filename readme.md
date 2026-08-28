# vite-bridge-boilerplate

A production-grade Vite + Nunjucks + SCSS (ITCSS) front-end boilerplate designed as a **bridge** between static sites, WordPress themes, Bitrix, Drupal, and other CMS back-ends. Ships with SVG sprites, PWA, responsive images, custom font pipeline, honeypot forms, and Playwright smoke tests.

> **License:** MIT
> **Author:** vinyardrip
> **Repository:** https://github.com/vinyardrip/vite-bridge-boilerplate

---

# PLAN

> Раздел для планов по доработке и роадмапа фич.

- [ ] Добавить страницу `_about.njk` с example frontmatter-данными из `data/about.json`
- [ ] Рефакторинг legacy SCSS в modern BEM-компоненты
- [ ] Интеграция Vitest для unit-тестов JS-модулей
- [ ] Lazy-loading для тяжёлых partials (видео, тяжёлые секции)

## Tech Debt & Roadmap

- **Oxc (oxlint + oxfmt) Evaluation.** Track Oxc ecosystem maturity (in particular `oxfmt` stabilization). Plan a migration from the current Biome (lint) + Prettier (templates) stack to Oxc after this boilerplate has been field-tested on at least one real production project. If the Oxc ecosystem does not stabilize on a sensible timeline, consider writing a lightweight custom VS Code / LSP wrapper instead of managing three or more separate linters.

---

# STATUS

> Текущее состояние dev-окружения и реализованный функционал.

| Компонент | Статус | Примечание |
|-----------|--------|------------|
| Vite dev-сервер | Работает | `pnpm dev` — HMR, авто-релоуд `.njk` и `.json` |
| Nunjucks + Frontmatter | Работает | `vite-plugin-njk-frontmatter` — рендеринг `.njk` в `.html` |
| Nunjucks Trace (Dev) | Работает | `vite-njk-trace` — HTML-комментарии в DevTools |
| SVG-спрайты | Работает | `vite-plugin-svg-sprite` — автоматическая инъекция в DOM |
| Шрифты (локальные) | Работает | `@font-face` в `_typography.scss` + fallback через `fontaine` |
| Шрифты (Google + Custom) | Работает | `vite-plugin-webfont-dl` — гибридная загрузка |
| Фавиконы | Работает | `scripts/generate-favicons.js` в `favicons/` целевого каталога |
| PWA | Работает | `vite-plugin-pwa` — отключён в dev, активен в build |
| Формы | Работает | Inputmask + honeypot + dev-имитация отправки |
| Тестер шрифтов | Работает | `test-fonts.njk` — визуальное сравнение target vs fallback |
| Overflow Detector | Работает | `debug-css-overflow` — dev-only детектор горизонтального переполнения |
| Critical CSS | Работает | `scripts/make-critical.js` — инлайн критического CSS |
| Build Target | Работает | Динамический выбор целевого каталога (static/wp/bitrix/drupal) |
| Selective Clean | Работает | Vite-плагин для очистки managed-файлов без удаления backend |
| PostCSS | Работает | `postcss-sort-media-queries` (desktop-first) + `autoprefixer` |
| PostHTML | Работает | `posthtml-responsive-images` (avif/webp генерация) |

---

# RECOMMENDED ECOSYSTEM & WORKSPACE LAYOUT

> A coherent set of open-source companions that share the same philosophy: small, focused, scriptable, agent-friendly.

## Recommended Open-Source Ecosystem Tools

| Tool | Package | Purpose |
|------|---------|---------|
| **`dpx`** | `ddev-project-extend` | CLI tool for automated DB dumps/imports, migrations, and full DDEV backend lifecycle management. |
| **`ck`** | `context-keeper` | CLI utility for AI-agent context persistence and `PLAN.md` task tracking across sessions. |
| **`vite-plugin-njk-frontmatter`** | `vite-plugin-njk-frontmatter` | Native Frontmatter parser plugin for Vite + Nunjucks (this repo uses it as a first-class feature). |

## Generic Multi-Project Workspace Layout

A clean conceptual directory tree for organizing many projects (personal, work, tooling, raw client materials) under a single root:

```text
~/projects/
├── my/                      # Personal & open-source projects (boilerplates, CLI tools)
│   ├── vite-bridge-boilerplate/
│   ├── context-keeper/
│   └── ddev-project-extend/
├── work/                    # Active client / CMS backend projects
│   ├── project-alpha/
│   └── _s-template/
├── tools/                   # Custom executable CLI scripts (bin/ directory)
└── materials/               # Client raw assets, design specs, and documentation
```

- **`my/`** — your own OSS work and reusable starting points. Treat every folder here as a published, license-clean, versioned artifact.
- **`work/`** — active client engagements. The `_s-template/` is a scaffold that new client work is cloned from.
- **`tools/`** — small, dependency-light CLIs you maintain and `PATH`-link from `~/.local/bin`.
- **`materials/`** — read-only raw inputs from clients: brand books, design files, copy docs, screenshots.

---

# DEV ENVIRONMENT & FEATURE MATRIX

> Полная таблица плагинов, их конфигураций и расположения исходников.

## Конфигурация сборки

| Файл | Назначение |
|------|-----------|
| `vite.config.js` | Главный конфиг Vite: плагины, dev-сервер, SCSS, build |
| `package.json` -> `config.buildTarget` | Цель сборки по умолчанию (`static`) |
| `package.json` -> `posthtml` | Конфиг PostHTML-плагинов (responsive images) |
| `scripts/build-target.js` | Динамический реестр целей (TARGET_MAP) + fallback |

## Плагины Vite (регистрация в `vite.config.js`)

| Плагин | Файл-источник | Режим | Описание |
|--------|---------------|-------|----------|
| `vite-njk-trace` | `node_modules/vite-njk-trace` | Dev only | HTML-комментарии-трейсы шаблонов |
| `fontaine` | `scripts/plugins/templates.js` | Dev + Build | Fallback `@font-face` без скачивания шрифтов |
| `vite-plugin-njk-frontmatter` | `scripts/plugins/templates.js` | Dev + Build | Nunjucks + YAML frontmatter в HTML |
| `vite-plugin-svg-sprite` | `scripts/plugins/assets.js` | Dev + Build | SVG-спрайт из `assets/icons/*.svg` |
| `vite-imagetools` | `scripts/plugins/assets.js` | Build | Трансформация изображений (resize, format) |
| `vite-plugin-webfont-dl` | `scripts/plugins/assets.js` | Build | Google + Custom шрифты (гибридная загрузка) |
| `vite-plugin-pwa` | `scripts/plugins/pwa.js` | Build only | Service Worker + манифест (отключён в dev) |
| `vite-html-asset-inject` | `scripts/plugins/vite-html-asset-inject.js` | Build only | Инжекция CSS/фавиконов в HTML, реврайт `/src/...` |
| `vite-selective-clean` | `vite.config.js` (inline) | Build only | Очистка managed-файлов в целевом каталоге |

## Структура каталогов

```
frontend/
  public/                      # Статика, копируется как есть
  src/
    assets/
      fonts/                   # Локальные шрифты (.woff2, .woff, .ttf)
      icons/                   # SVG-иконки для спрайта (phone.svg, mail.svg, ...)
      images/                  # Картинки (jpg, png, svg)
        favicons/              # Исходные favicon-файлы
      svg/                     # SVG для инлайн-спрайта (logo.svg)
    data/
      site.json                # Глобальные данные Nunjucks (site.*)
    js/
      app.js                   # Главная точка входа JS
      dev/
        test-fonts.js          # Диагностика шрифтов (dev-only)
      modules/                 # Модули компонентов
    scss/                      # Стили (методология ITCSS)
      abstracts/               # Переменные, миксины, функции
      base/                    # Сброс, типографика, базовые стили
      components/              # UI-компоненты (кнопки, формы, модалки)
      layout/                  # Секции макета (header, footer, container)
      legacy/                  # Legacy-стили из старого проекта
      pages/                   # Стили конкретных страниц
      utils/                   # Утилитарные классы
      vendor/                  # Стили сторонних библиотек
      app.scss                 # Точка входа для всех стилей
    views/
      components/              # Переиспользуемые Nunjucks-компоненты
      data/                    # Page-specific JSON-данные
      layouts/
        _default.njk           # Главный макет-обёртка
      macros/
        _ui.njk                # Nunjucks-макросы (icon, input, honeypot)
      pages/                   # Страницы (.njk -> .html)
      partials/                # Парциалы (вставляются через {% include %})
backend/                       # Backend-файлы (WP тема, DDEV)
dist/                          # Результат static-сборки
scripts/                       # Node.js скрипты (build pipeline)
vite.config.js
```

---

# FRONTMATTER & DATA PRIORITY

> Подробное описание системы данных в `vite-plugin-njk-frontmatter`.

## Источник правды

Полная документация плагина: `node_modules/vite-plugin-njk-frontmatter/README.md`

## Конфигурация в проекте

```js
// scripts/plugins/templates.js
nunjucksFrontMatterPlugin({
  root: "frontend/src/views",          // Корень шаблонов Nunjucks
  pagesDir: "frontend/src/views/pages",// Каталог страниц (.njk -> .html)
  data: "src/data/**/*.json",          // Glob JSON-данных (от корня Vite = frontend/)
  globals: {
    site: {
      production: !isServe,            // false в dev, true в build
    },
  },
})
```

## Каскад приоритетов данных (от низкого к высокому)

| Приоритет | Источник | Пример |
|-----------|----------|--------|
| 1 (низкий) | `globals` в конфиге плагина | `{ site: { production: false } }` |
| 2 | `data/index.json` (глобальные данные) | `{ site: { name: "...", fonts: [...] } }` |
| 3 | `data/[page].json` (данные страницы) | `{ seo: { title: "About" } }` |
| 4 (высокий) | YAML frontmatter в `.njk` файле | `title: Home` |

## Важные правила

1. **Deep merge** — не конфликтующие ключи всегда сохраняются. Если `index.json` определяет `site.url`, а `about.json` — только `site.name`, то `site.url` не затирается.

2. **Frontmatter vs nested objects** — frontmatter переопределяет **top-level** ключи. Если в frontmatter задан `title`, он перекроет `title` из JSON. Но вложенный frontmatter-объект **заменяет** весь ключ целиком (не deep-merges).

3. **JSON namespace** — каждый JSON-файл доступен как под自己的 имени: `data/about.json` доступен как `about.seo.title` и как `seo.title`.

4. **Globals** — `site.production` автоматически `false` в dev, `true` в build. Используется для условного рендеринга (фавикон-теги и т.д.).

## Пример frontmatter

```njk
---
title: Home
description: Описание для SEO
body_class: "main-page"
---

{% extends "layouts/_default.njk" %}

{% block content %}
  <h1>{{ title }}</h1>
  <p>{{ description }}</p>
  <!-- site.url доступен из data/site.json -->
  <a href="{{ site.url }}">Сайт</a>
{% endblock %}
```

## Пример page-specific JSON

Создайте `frontend/src/views/data/about.json`:

```json
{
  "seo": {
    "title": "О нас"
  }
}
```

Этот файл автоматически загружается для страницы `about.njk` и deep-merges с `index.json`.

---

# ASSETS & CONVENTIONS

> Шпаргалки по SVG-иконкам, шрифтам и путям.

## SVG-спрайты

### Куда класть иконки

Все SVG-иконки для спрайта кладутся в `frontend/src/assets/icons/`:

```
frontend/src/assets/icons/
  phone.svg
  mail.svg
  facebook.svg
  tg.svg
  viber.svg
  whats.svg
```

### Как работают спрайты

1. `vite-plugin-svg-sprite` автоматически собирает все `.svg` из `assets/icons/` в единый спрайт
2. SVG-символы инжектятся в DOM при загрузке страницы
3. Иконка становится доступна по ID `icon-[name]` (где `[name]` — имя файла без расширения)

### Использование в HTML/Nunjucks

Через макрос `ui.icon()`:

```njk
{% import "../macros/_ui.njk" as ui %}

{{ ui.icon('phone') }}
{{ ui.icon('phone', 'header__icon') }}
```

Генерирует:

```html
<svg class="icon icon-phone" aria-hidden="true" focusable="false">
  <use href="#icon-phone"></use>
</svg>
```

### Импорт в app.js

Каждый SVG нужно импортировать в `app.js` для регистрации в спрайте:

```js
import '../assets/icons/phone.svg';
import '../assets/icons/mail.svg';
import '../assets/svg/logo.svg';
```

### SVGO-оптимизация

Иконки проходят агрессивную оптимизацию (конфиг в `scripts/plugins/assets.js`):
- Удаление `fill` и `stroke` атрибутов
- Очистка ID
- Стандартный `preset-default`

## Шрифты

### Локальные шрифты

Файлы шрифтов хранятся в `frontend/src/assets/fonts/`:

```
frontend/src/assets/fonts/
  JetBrainsMono-Light.woff2
  JetBrainsMono-Light.woff
  JetBrainsMono.woff2
  JetBrainsMono.woff
  Oswald-Regular.woff2
  Oswald-Regular.woff
  Oswald-Regular.ttf
  Lora-Medium.woff2
  Lora-Medium.woff
  Lora-Medium.ttf
```

### @font-face определения

Определены в `frontend/src/scss/base/_typography.scss` через миксин `font()`:

```scss
@include font("JetBrains Mono", "JetBrainsMono-Light", 300);
@include font("JetBrains Mono", "JetBrainsMono", 400);
@include font("Oswald", "Oswald-Regular", 400);
```

Генерирует:

```scss
@font-face {
  font-family: "JetBrains Mono";
  src:
    url("../../assets/fonts/JetBrainsMono-Light.woff2") format("woff2"),
    url("../../assets/fonts/JetBrainsMono-Light.woff") format("woff");
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}
```

### Font Mixins (абстракции)

Миксины определены в `frontend/src/scss/abstracts/_mixins.scss`:

**Универсальный миксин `font()`:**

```scss
// Сигнатура: @mixin font($family, $filename, $weight: 400, $style: normal)
// Путь к файлу: ../../assets/fonts/#{$filename}.woff2 + .woff
@include font("JetBrains Mono", "JetBrainsMono-Light", 300);
@include font("Oswald", "Oswald-Regular", 400);
```

**Алиасы семейств (применяют `font-family` + `font-weight`):**

| Миксин | Семейство | Fallback | Вес по умолчанию |
|--------|-----------|----------|------------------|
| `@include jb;` | JetBrains Mono | monospace | 400 |
| `@include jb(300);` | JetBrains Mono | monospace | 300 |
| `@include os;` | Oswald | sans-serif | 700 |
| `@include os(400);` | Oswald | sans-serif | 400 |
| `@include sc;` | Spectral SC | serif | 700 |

**Добавление нового шрифта:**

1. Положите файлы `.woff2` и `.woff` в `frontend/src/assets/fonts/`
2. Вызовите `@include font(...)` в `_typography.scss`
3. (Опционально) Добавите алиас-миксин в `_mixins.scss`
4. Добавьте fallback в конфиг `fontaine` (`scripts/plugins/templates.js`)

### Fontaine fallback

Плагин `fontaine` (в `scripts/plugins/templates.js`) автоматически генерирует fallback `@font-face` без скачивания шрифтов:

```js
FontaineTransform.vite({
  fallbacks: {
    "JetBrains Mono": ["Courier New", "monospace"],
    Oswald: ["Arial", "sans-serif"],
    Spectral: ["Georgia", "serif"],
    "Spectral SC": ["Georgia", "serif"],
  },
})
```

### Google + Custom шрифты (гибридная загрузка)

Плагин `vite-plugin-webfont-dl` (в `scripts/plugins/assets.js`) загружает:

**Google-шрифты:**
- JetBrains Mono (300, 700)
- Spectral (700)
- Spectral SC (700)

**Custom-шрифты (локальные fallback-и):**
- JetBrains Mono Light (300)
- JetBrains Mono Bold (700)
- Spectral Bold (700)
- Spectral SC Bold (700) — доступен как `spectral-lc`

### CSS-переменные шрифтов

Определены в `frontend/src/scss/abstracts/_variables.scss`:

```scss
:root {
  --font-family-base: "JetBrains Mono", monospace;
  --font-family-headings: "Oswald", sans-serif;
  --font-size-base: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
  --font-size-h1: clamp(2rem, 1.5rem + 2.5vw, 3.5rem);
  --font-size-h2: clamp(1.75rem, 1.4rem + 1.75vw, 2.75rem);
  --font-size-h3: clamp(1.5rem, 1.25rem + 1.25vw, 2.25rem);
}
```

## Тестер шрифтов

Доступен по пути `/test-fonts.html` (или `pnpm test:fonts`).

### Как работает

- Каждая карточка показывает **две строки**: Target (целевой шрифт) и Fallback (системный)
- Для моноширинных шрифтов (содержат "Mono") fallback = `monospace`
- Для остальных fallback = `sans-serif`
- JavaScript проверяет `document.fonts.check()` и показывает статус: Loaded (зелёный) или Failed (красный)

### Файлы

- Разметка: `frontend/src/views/pages/test-fonts.njk`
- JS: `frontend/src/js/dev/test-fonts.js`
- Стили: `frontend/src/scss/pages/_test-fonts.scss`
- Данные: `frontend/src/data/site.json` (массив `site.fonts`)

## Пути и сокращения

| Абсолютный путь | Относительный от `frontend/` | Описание |
|-----------------|----------------------------|----------|
| `/src/js/app.js` | `src/js/app.js` | Точка входа JS |
| `/src/scss/app.scss` | `src/scss/app.scss` | Точка входа стилей |
| `/src/assets/icons/phone.svg` | `src/assets/icons/phone.svg` | SVG-иконка |
| `/src/assets/images/img1.jpg` | `src/assets/images/img1.jpg` | Картинка |
| `/src/assets/fonts/JetBrainsMono-Light.woff2` | `src/assets/fonts/...` | Шрифт |

В HTML-шаблонах пути `/src/...` резолвятся от корня Vite (`frontend/`).

---

# SNIPPETS

> Готовые к копированию сниппеты для использования в проекте.

## Nunjucks: Базовая страница

```njk
---
title: My Page
description: Описание страницы
body_class: "page-my"
---

{% extends "layouts/_default.njk" %}

{% block content %}
  <h1>{{ title }}</h1>
  <p>{{ description }}</p>

  {% include "partials/_header.njk" %}
  {% include "partials/_hero.njk" %}
  {% include "partials/_footer.njk" %}
{% endblock %}
```

## Nunjucks: Макрос icon

```njk
{% import "../macros/_ui.njk" as ui %}

{{ ui.icon('phone') }}
{{ ui.icon('phone', 'header__icon') }}
{{ ui.icon('mail', 'footer__icon') }}
```

## Nunjucks: Макрос input (телефон)

```njk
{% import "../macros/_ui.njk" as ui %}

{# Телефон без лейбла (placeholder по умолчанию: |+375...) #}
{{ ui.input(name='phone', type='tel', className='form__phone-field') }}

{# Телефон с лейблом #}
{{ ui.input(
    name='contact-phone',
    type='tel',
    label='Ваш номер телефона',
    className='another-form__input'
) }}

{# Телефон с кастомным placeholder #}
{{ ui.input(
    name='phone',
    type='tel',
    className='form__phone-field',
    placeholder='Ваш мобильный'
) }}

{# Текстовое поле #}
{{ ui.input(name='user-name', label='Ваше имя', className='form__input') }}
```

## Nunjucks: Honeypot (ловушка для ботов)

```njk
{% import "../macros/_ui.njk" as ui %}

<form action="#" class="form" data-form>
  {{ ui.honeypot() }}
  <input type="tel" name="phone" required>
  <button type="submit">Отправить</button>
</form>
```

## Nunjucks: Социальные мета-теги

```njk
{% block social_meta %}
  {% include "../partials/_meta-social.njk" %}
{% endblock %}
```

## Nunjucks: Условный фавикон (только dev)

```njk
{% if not site.production %}
  <link rel="icon" href="/src/assets/images/favicons/favicon.svg" type="image/svg+xml">
{% endif %}
```

## Nunjucks: Доступ к глобальным данным

```njk
{# Из data/site.json #}
<a href="{{ site.url }}">{{ site.name }}</a>

{# Цикл по шрифтам #}
{% for font in site.fonts %}
  <p style="font-family: '{{ font.name }}'; font-weight: {{ font.weight }};">
    {{ font.text }}
  </p>
{% endfor %}
```

## JS: Импорт SVG-иконки для спрайта

```js
// Регистрирует иконку в SVG-спрайте (инжектится в DOM)
import '../assets/icons/phone.svg';
import '../assets/icons/mail.svg';
import '../assets/svg/logo.svg';
```

## JS: Инициализация модуля

```js
import { initScrollToTop } from './modules/scroll-to-top.js';
import { initMobileMenu } from './modules/mobile-menu.js';
import { initModals } from './modules/modals.js';
import { initForms } from './modules/forms.js';

document.addEventListener('DOMContentLoaded', () => {
  initScrollToTop();
  initMobileMenu();
  initModals();
  initForms();
});
```

## SCSS: Медиа-запросы (миксины)

```scss
@use "../abstracts" as *;

// До брейкпоинта (mobile-first)
@include breakpoint-down(sm) {
  .block { display: none; }
}

// После брейкпоинта (desktop-first)
@include breakpoint-up(lg) {
  .container { max-width: 1200px; }
}
```

## SCSS: Z-depth тени

```scss
@use "../abstracts" as *;

.card {
  @include z-depth(2);  // --shadow-2dp
}

.modal {
  @include z-depth(8);  // --shadow-8dp
}
```

## SCSS: CSS-переменные (дизайн-токены)

```scss
.element {
  color: var(--color-text-base);
  background: var(--color-background);
  font-family: var(--font-family-base);
  font-size: var(--font-size-base);
  box-shadow: var(--shadow-4dp);
}
```

## SCSS: Объявление @font-face

```scss
@use "../abstracts/mixins" as *;

// Один шрифт, одно начертание
@include font("JetBrains Mono", "JetBrainsMono-Light", 300);

// Два начертания одного шрифта
@include font("JetBrains Mono", "JetBrainsMono-Light", 300);
@include font("JetBrains Mono", "JetBrainsMono", 400);

// Стиль italic
@include font("Lora", "Lora-Medium", 500, italic);
```

## SCSS: Алиасы шрифтов (jb, os, sc)

```scss
@use "../abstracts/mixins" as *;

// Применить JetBrains Mono (body, код)
.some-block {
  @include jb;
}

// JetBrains Mono Light (300)
.light-text {
  @include jb(300);
}

// Oswald для заголовков
.section-title {
  @include os;
}

// Spectral SC для акцентов
.accent-text {
  @include sc;
}
```

## SCSS: Добавление нового шрифта

```scss
// 1. Объявляем @font-face через миксин
@include font("MyFont", "MyFont-Regular", 400);
@include font("MyFont", "MyFont-Bold", 700);

// 2. Используем в компоненте
.component {
  font-family: "MyFont", sans-serif;
  font-weight: 400;
}
```

## VS Code: Автодополнение шрифтов

В `.vscode/scss.code-snippets` доступны сниппеты:

| Префикс | Описание |
|---------|----------|
| `font` + Tab | `@include font("Family", "FileName", 400);` |
| `fontw` + Tab | Два `@include font(...)` для двух весов |
| `jb` + Tab | `@include jb(400);` |
| `jbl` + Tab | `@include jb(300);` (light) |
| `os` + Tab | `@include os(700);` |
| `sc` + Tab | `@include sc(700);` |

## Форма: Пример разметки

```njk
<form action="#" class="form" data-form>
  <div class="form__wrap">
    <div class="form__phone">
      <div class="form__phone-title">
        <span class="form-big-text">Номер телефона</span>
      </div>
      <input type="hidden" name="url" value="//">
      <input type="tel"
             name="phone"
             class="form__phone-field"
             required
             placeholder="|+375..."
             pattern="\s*\+375\s?\(?(1[567]|2[12359]|33|44)\)?\s?\d{3}-\d{2}-\d{2}"
             autocomplete="tel">
    </div>
    <div class="form__btn">
      <button class="btn nowrap">
        <span class="form-small-text">Перезвоните</span>
      </button>
    </div>
  </div>
</form>
```

## Ссылки на мессенджеры

```njk
{# Viber #}
<a href="viber://chat?number=%2B375296664690" class="message">
  {{ ui.icon('viber') }}
</a>

{# Telegram #}
<a href="https://t.me/dmitriev_partners" class="message">
  {{ ui.icon('tg') }}
</a>

{# WhatsApp #}
<a href="https://wa.me/375447732833" class="message">
  {{ ui.icon('whats') }}
</a>

{# Email #}
<a href="mailto:info@kdmitriev.by" class="message">
  {{ ui.icon('mail') }}
</a>

{# Телефон #}
<a href="tel:+375296664690" class="header__phone phone nowrap">
  {{ ui.icon('phone') }}
  <span>+375 29 666 46 90</span>
</a>
```

---

# LICENSE

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) vinyardrip

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- **Author:** vinyardrip
- **Repository:** https://github.com/vinyardrip/vite-bridge-boilerplate
