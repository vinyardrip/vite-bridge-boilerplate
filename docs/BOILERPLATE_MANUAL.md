# Бойлерплейт Vite Bridge: технический мануал

> Все утверждения проверены чтением исходников и grep'ом по репозиторию
> (состояние на момент написания: корневой `package.json` v0.5.7, пакет
> `vite-plugin-smart-assets` v0.2.9). Пути — от корня репозитория.
> Если что-то в репозитории отсутствует — это указано явно.

---

## 1. vite-plugin-smart-assets

### 1.1 Расположение и метаданные пакета

Единственный image-пайплайн проекта — локальный workspace-пакет
**`packages/vite-plugin-smart-assets`** (подключен в корневой `package.json`
как `"vite-plugin-smart-assets": "workspace:*"`, каталог `packages/*`
объявлен в `pnpm-workspace.yaml`).

Структура пакета:

```
packages/vite-plugin-smart-assets/
├── index.ts                     # реэкспорт: export { smartAssets } from "./src/index.ts"
├── package.json                 # main: index.ts; deps: sharp, svgo ^3.3.5; peer: vite ^5–8
├── src/
│   ├── index.ts                 # фабрика smartAssets() — роутинг/sharp/хеши/retina/манифест
│   ├── types.ts                 # контракты: RasterEntry, SvgEntry, SmartAssetsOptions и др.
│   └── svg/
│       ├── pipeline.ts          # processSvgBatch() — оркестратор SVG-конвейера
│       ├── normalize.ts         # normalize() — extractMeta + svgo presetSmart
│       ├── preset-smart.ts      # svgo-пресет (кастомные плагины + отключения)
│       ├── extract-meta.ts      # вынимает <title>/<desc> с любой глубины
│       ├── classify.ts          # classifyOne() + assignModes()
│       ├── prefix.ts            # prefixSvg() — префиксация id/class/url(#)/@keyframes
│       ├── build-sprite.ts      # buildSprite() — сборка sprite.svg из <symbol>
│       ├── build-manifest.ts    # buildSvgManifest() + mergeSvgManifest()
│       ├── project.ts           # projectSvg() — запись манифеста → HTML
│       ├── utils/parse-style.ts
│       └── plugins/             # normalizeStyleElement, convertColorsToCurrent, synthViewBox
└── test/svg/*.spec.ts           # node:test (tsx --test): classify, prefix, sprite, manifest…
```

Корневой скрипт `pnpm test` гоняет тесты пакета: `pnpm --filter
vite-plugin-smart-assets test` → `tsx --test "test/svg/*.spec.ts"`.

Нюанс зависимостей: у пакета свой `svgo ^3.3.5` (он импортирует внутренности
`svgo/lib/parser.js` / `svgo/lib/stringifier.js`), а в корневых devDependencies
заявлен `svgo ^4.0.0` — pnpm держит для пакета отдельную копию в `.pnpm`.

### 1.2 Растровый конвейер (jpg/jpeg/png)

Точка входа — фабрика `smartAssets(options)` из `src/index.ts`. Опции
(`SmartAssetsOptions`): `rawDir` (по умолчанию `"frontend/raw"`), `scope`
(по умолчанию `"assets"`, WP-сборка передает `""`), `manifestFile`
(`"assets-manifest.json"`), `generatedScssFile`
(`"frontend/src/scss/generated/_smart-assets-map.scss"`), `cacheDir`
(`"node_modules/.cache/smart-assets"`).

**Маршруты** заданы таблицей:

```ts
const ROUTES: Record<string, Route> = {
  img: { extensions: [".jpg", ".jpeg", ".png"], folder: "img", type: "img", raster: true },
};
```

`.svg` в ROUTES не входит — уходит в SVG-конвейер (1.3). Неизвестное
расширение → `console.warn` и пропуск (сборку не роняет).

**Обработка каждого растра** (`ensureProcessed()`):

1. Скан `rawDir` рекурсивно (`fs.readdirSync(..., { recursive: true })`),
   dotfiles (`.gitkeep`) не маршрутизируются, подпапки сохраняются в stem.
2. Хеши: короткий `hash` — первые 8 hex `sha256` исходника (конвенция
   проекта, как у Vite), полный `sha256` — ключ дискового кеша.
3. **Retina-решение**: `const RETINA_MIN_WIDTH = 800;` — исходник шире 800px
   считается 2x (конвенция «в raw/ кладут 2x»):
   - `name.<hash>@2x.<ext>` — исходные байты **без перекодирования**;
   - `name.<hash>.<ext>` — 1x, ресайз до половины ширины
     (`sharp(source).resize({ width: oneWidth }).toFormat(...)`).
4. **Современные форматы**: `MODERN_FORMATS = [{ webp, quality 80 }, { avif,
   quality 80 }]` — для каждого формата серия 1x (+ 2x при retina), имена
   `name.<hash>.webp`, `name.<hash>@2x.avif` и т.д. Альфа PNG сохраняется
   (sharp сам не выбрасывает канал).
5. **Кеширование**: `sharp(source).metadata()` дает width/height (в манифест
   попадают размеры 1x-варианта — «анти-CLS»). Персистентный дисковый кеш в
   `node_modules/.cache/smart-assets/` (`cache.json` + `files/<encodeURIComponent
   (путь)>`): неизменившийся исходник (совпадают полный sha256 + scope +
   rawDir + версия плагина + все файлы вариантов на диске) восстанавливается
   **без запуска sharp**. Ошибка sharp НЕ кешируется. Записи удаленных
   исходников вычищаются (prune), файлы-сироты в `files/` остаются.
6. **Отказоустойчивость**: ошибка sharp на одном файле не роняет сборку —
   предупреждение и маршрутизация оригинала без вариантов. Отсутствие
   `frontend/raw/` — каталог создается + предупреждение.
7. Коллизии выходных имен разрешаются в пользу файла-источника (поздний
   вариант пропускается с предупреждением); дубликат basename двух разных
   исходников — предупреждение (фильтры найдут только первый).

### 1.3 SVG-конвейер

Запускается из `ensureProcessed()` через `processSvgBatch(svgFiles, { rawDir,
scope })` (`src/svg/pipeline.ts`). Пайплайн из 10 шагов, в оркестраторе
свернут в 5 фаз:

**Фаза 1 — normalize** (`normalize.ts`): `extractMeta()` вынимает
`<title>`/`<desc>` с ЛЮБОЙ глубины (Figma кладет их в `<g>`; в meta попадает
первый в документе каждого имени), затем svgo-оптимизация пресетом
`presetSmart`. Гарантии: детерминизм (два вызова — байт-идентичный вывод),
идемпотентность, viewBox гарантирован (нет — синтез `synthViewBox` из
width/height, нет ни того ни другого — throw `[svg:normalize]`), width/height
на корне сняты, единственный цвет → `currentColor` (`convertColorsToCurrent`).
Отключены (осознанно): `convertPathData` (стабильный canonicalHash/дубли),
`cleanupIds` (ломал бы градиенты/symbol), `removeUnknownsAndDefaults`,
`minifyStyles` (дожёвывал @media после inlineStyles). `normalizeStyleElement`
канонизирует вложенные `<style>` рекурсивно — медиа-каскад выживает.

**Фаза 2 — classify** (`classify.ts`): `classifyOne(normalizedSvg)` — чистое
дерево решений над svgo-AST (`parseSvg` из `svgo/lib/parser.js`). Порядок
важен — сначала структурные, потом цветовые:

| Признак | kind |
|---|---|
| есть `<symbol>` | `sprite` |
| SMIL (`animate`/`animateTransform`/`animateMotion`/`set`/`mpath`), `@keyframes`, `animation:`, `<script>` | `animated` |
| `url(#...)` в атрибутах/`<style>`, `<image>` | `illustration` |
| `currentColor` в fill/stroke | `icon` |
| ≤2 цветов + маленький viewBox (`0 0 N N`, N ≤ 64) или размер < 4 KB | `icon` |
| ≤2 цветов, большой viewBox | `illustration` |
| >2 цветов | `illustration` |
| parse error / ничего не подошло | `unknown` |

`fill="none"` цветом не считается (none + один цвет = 1 цвет). Цвета
собираются только из атрибутов и инлайн-стилей (после normalize CSS-правила
уже перенесены в style-атрибуты).

**Фаза 3 — assignModes** (там же): не-иконки получают фиксированный mode
(`animated → inline`, `sprite → sprite`, `illustration → img`, `unknown →
error` — error **роняет билд**, «молча пропустить» нельзя). Иконки решаются
весовым агрегатом **по всему пакету**:

```ts
const DEFAULT_THRESHOLDS: Required<AssignThresholds> = {
  count: 15,
  rawBytes: 30 * 1024,
  gzipBytes: 15 * 1024,
};
// inline: count ≤ 15 И raw ≤ 30KB И gzip ≤ 15KB — все три; иначе sprite
```

Размеры меряются по **нормализованному** контенту (его DOM-вес и есть вес
инлайна). Gzip важен наравне с raw: inline повторяется в каждой странице.

**Фаза 4 — проекции** (пути от корня outDir с учетом scope; scope="" в WP →
плоско `ui/`, `icons/`, `img/`):

- `mode: inline` → `ui/<имя>.svg`: контент через `prefixSvg(content, name)`
  (`prefix.ts`) — префиксуются `id`, `class`, `url(#...)`,
  `href="#..."/xlink:href`, селекторы и `@keyframes` в `<style>` (структурно:
  hex-цвета `#fff` и `.5px` в значениях деклараций не трогаются; ссылки на
  keyframes переименовываются только на имена из собранного набора этой
  иконки). Корневые атрибуты `<svg>` не префиксуются. Дубликат имени инлайна
  — throw. Файл эмитится и для inline — чтобы PHP мог прочитать его с диска.
- `mode: sprite` → иконки копятся, затем `buildSprite()` (`build-sprite.ts`):
  каждая иконка — `<symbol id="<имя>" viewBox="...">` (корень → symbol,
  атрибуты `<svg>` отбрасываются), символы **сортируются по id**, корень
  спрайта безопасный для старых Safari:

  ```ts
  const SPRITE_ROOT_TAG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden" aria-hidden="true">';
  ```

  Один файл на пакет: `icons/sprite.<hash8>.svg`.
- `mode: img` → `img/<stem>.<hash8>.svg` (нормализованный SVG, подпапки raw/
  сохраняются в stem).

**Фаза 5 — манифест**: `buildSvgManifest(svgAssets, { scope })` строит
фрагмент `{ entries: [...] }` (записи отсортированы по `source` —
детерминизм), `mergeSvgManifest(existing, fragment)` вливает его в общий
манифест плагина (записи заменяются по ключу `source` — идемпотентность
повторной сборки; `file` всегда относительный, без ведущего `/` — контракт
check-build; `file: null` только у error).

### 1.4 Хуки Vite и интеграция со сборкой

Плагин использует 4 хука (`src/index.ts`, объект `plugin`):

| Хук | Что делает |
|---|---|
| `configResolved(config)` | Запоминает `command` (`build`/`serve`); резолвит `cacheRoot` от `config.root`. |
| `buildStart` | `await ensureReady()` → `ensureProcessed()` + `writeGeneratedScss()`. Вся обработка — **ДО** фазы transform, т.е. до рендера Nunjucks и компиляции Sass: фильтры шаблонов уже видят посчитанное состояние. |
| `configureServer(server)` | Dev: считает состояние на старте; middleware раздает `/<scope>/…` из `state.files` (Map «путь → Buffer») с правильным Content-Type; ватчер `server.watcher.add(rawDir)` — на add/change/unlink пересчитывает состояние и шлет `ws.send({ type: "full-reload" })`. |
| `generateBundle(_, bundle)` | Эмитит все файлы (`this.emitFile({ type: "asset", fileName, source })`) + `assets-manifest.json`; затем подменяет CSS-токены в каждом `.css`-артефакте бандла (`replaceCssTokens`). |

`ensureProcessed()` идемпотентен (`state.ready` — флаг, `invalidate()`
сбрасывает состояние для dev-ватчера). Файлы из памяти — сборка в dev-режиме
не запускается, «эмиссия» означает попадание в `state.files`, откуда их
отдает middleware (build) или middleware (serve), а в build — `emitFile`.

В `vite.config.ts` создается один экземпляр на конфиг:

```ts
const smartAssetsPlugin = smartAssets({ scope: isWpBuild ? "" : "assets" });
```

Статическая сборка: `dist/assets/img|ui|icons/…`; WP-сборка (`--mode
wordpress`): `scope=""` → файлы прямо в `backend/wp-content/themes/my-theme/assets/img|ui|icons/…`
(плоско — требование совместимости с WP-плагинами и `strip-avif.ts`).

### 1.5 Сгенерированный SCSS и CSS-токены

`writeGeneratedScss(manifest)` пишет `frontend/src/scss/generated/
_smart-assets-map.scss` (генерируется при каждом старте, не коммитится —
`/frontend/src/scss/generated/` в `.gitignore`): карта
`$smart-assets-map: ("имя": ("формат": "путь", …))` + функция
`@function smart-asset-url($name, $format)`. Миксин `bgset()` из
`frontend/src/scss/abstracts/_mixins.scss` зовет только ее, не пиша `url()`
сборочными путями (Vite резолвит `url()` в CSS на transform, когда файлов
еще нет).

Режим задается в функции по `command`:

- **build** — возвращает **токен** `url(smart-asset:#{$name}:#{$format})`:
  схемо-подобный URL Vite не трогает; в `generateBundle` токены подменяются
  на реальные пути **относительно каталога css-файла**:

  ```ts
  const CSS_TOKEN_RE = /url\((['"]?)[.\w/-]*?smart-asset:([a-zA-Z0-9._-]+):([a-z0-9]+)\1\)/g;
  // replaceCssTokens: path.posix.relative(path.posix.dirname(cssFileName), variant.path)
  // → css/app.*.css → "../assets/img/…"; в WP → "../img/…"
  ```

  Неразрешенный токен (нет ассета/формата) остается с предупреждением.
- **serve** — абсолютный `url("/" + путь)`, раздает dev-middleware.

### 1.6 assets-manifest.json

Пишется в корень outDir (`manifestFile`). Формат:

```jsonc
{
  "plugin": "vite-plugin-smart-assets",
  "version": "0.2.9",
  "rawDir": "frontend/raw",
  "entries": [
    // растр:
    { "source": "frontend/raw/hero.jpg", "type": "img", "hash": "fbf7356d",
      "size": 123456, "retina": true, "width": 800, "height": 600,
      "output": "img/hero.fbf7356d.jpg",
      "variants": [ { "path": "img/hero.fbf7356d.jpg", "format": "jpg",
                      "descriptor": "1x", "width": 800, "height": 600 }, … ] },
    // SVG:
    { "source": "frontend/raw/phone.svg", "file": "ui/phone.svg",
      "kind": "icon", "mode": "inline", "hash": "…" },
    { "source": "frontend/raw/demo-sprite.svg",
      "file": "icons/sprite.a1b2c3d4.svg", "kind": "sprite", "mode": "sprite",
      "symbol": "demo-sprite", "hash": "…" }
  ]
}
```

Ключ верстальщиков — `source` (путь исходника в raw/), `file`/`variant.path`
— всегда относительные пути от корня outDir.

### 1.7 Публичный API и проекция в HTML

Плагин (`SmartAssetsPlugin` extends `VitePlugin`) экспортирует методы для
Nunjucks-фильтров `vite.config.ts`:

- `entry(name)` — растровая запись по basename без расширения;
- `svgEntry(name)` — SVG-запись по имени файла в raw/ (подпапка через слеш);
- `svgInlineContent(entry)` — нормализованный инлайн-контент (null для
  sprite/img);
- `pictureHtml(name, { alt, imgClass, loading, decoding })` — готовый
  `<picture>`: `<source>` AVIF → WebP с srcset-дескрипторами `1x`/`2x` +
  `<img>`-фолбэк исходного формата с размерами 1x (анти-CLS).

Проекция SVG — `projectSvg(entry, options?, inlineContent?)`
(`src/svg/project.ts`, импортируется в `vite.config.ts` глубоким импортом
`vite-plugin-smart-assets/src/svg/project.ts`):

- `inline` — AST-инъекция атрибутов в корень: `class` сливается,
  `aria-hidden="true"` (если нет `aria-label`), `focusable="false"`;
- `sprite` — `<svg …><use href="{file}#{symbol}"></use></svg>` (href без
  ведущего слеша);
- `img` — `<img src loading alt [width] [height] class>`;
- `error` — `""` + предупреждение.

Фильтры-обертки в `vite.config.ts` (`smartSvg`, `smartPicture`) возвращают
`nunjucks.runtime.SafeString` — макросы `ui.icon()` / `ui.picture()`
(`frontend/src/views/macros/_ui.njk`) не нуждаются в `| safe`. Записи нет →
fail-fast: `throw new Error("Icon not found: …")` — сборка падает с именем
иконки, «молчаливых» дырок нет.

---

## 2. Интеграция с PHP

### 2.1 Мост: два манифеста в assets/ темы

Связка vite ↔ PHP — файлы манифестов, которые сборка кладет в
`backend/wp-content/themes/my-theme/assets/` (каталог gitignored, создается
`pnpm build:wp` = `vite build --mode wordpress`):

| Файл | Кто пишет | Что содержит | Кто читает |
|---|---|---|---|
| `assets/manifest.json` | Vite (`build.manifest: "manifest.json"` в vite.config.ts) | JS/CSS-точки входа: `{ "frontend/src/js/app.ts": { file, css: [...] } }` | `get_asset()` (inc/enqueue-assets.php) |
| `assets/assets-manifest.json` | vite-plugin-smart-assets | Растр и SVG-конвейер (`entries`, см. 1.6) | `theme_icon()` / `theme_picture()` (inc/assets-helpers.php) |

Оба манифеста пишутся при каждой сборке; `emptyOutDir: true` вычищает
устаревшие хешированные файлы. Ключи манифеста Vite — исходные пути
(подтверждено сборкой: ключ `frontend/src/js/app.ts`).

### 2.2 get_asset() и подключение CSS/JS

`backend/wp-content/themes/my-theme/inc/enqueue-assets.php`:

```php
function get_asset( $entry ) {
	static $manifest = null;
	$manifest_path = get_template_directory() . '/assets/manifest.json';

	if ( $manifest === null ) {
		if ( ! file_exists( $manifest_path ) ) {
			$dev_server_url = 'http://localhost:5173';
			return $dev_server_url . '/' . $entry;   // dev-фолбэк, HMR из pnpm dev
		}
		$manifest = json_decode( file_get_contents( $manifest_path ), true );
	}

	if ( isset( $manifest[ $entry ]['file'] ) ) {
		return get_template_directory_uri() . '/assets/' . $manifest[ $entry ]['file'];
	}

	error_log( sprintf( __( 'Asset not found in manifest.json: %s' ), $entry ) );
	return '';
}
```

Сигнатура: `get_asset( string $entry ): string` — `$entry` это ключ Vite-
манифеста (путь исходника от корня репо). Манифест читается один раз за
запрос (static). Нет файла → URL dev-сервера Vite (порт 5173), т.е. в dev
PHP тянет стили/скрипты напрямую с `pnpm dev`.

Подключение — `my_theme_enqueue_assets()` (хук `wp_enqueue_scripts`): JS
ставится в `<head>` (`wp_enqueue_script(..., false)`), handle
`'my-theme-app'`, версия `null` (ее несет хеш в имени файла). CSS берется из
`$manifest[ $js_entry ]['css']` (`wp_enqueue_style('my-theme-app' …)`).
Атрибут `type="module"` добавляет фильтр `script_loader_tag` →
`my_theme_script_loader_tag()`: он меняет только свой handle
(`'my-theme-app' !== $handle → return $tag`), скрипты ядра и плагинов не
трогает.

### 2.3 theme_icon() / theme_picture() / theme_asset_url()

`backend/wp-content/themes/my-theme/inc/assets-helpers.php` — PHP-зеркала
Nunjucks-макросов `ui.icon()` / `ui.picture()`. Источник данных —
`assets/assets-manifest.json`, читается один раз за запрос
(`my_theme_smart_assets()`, static-кэш, индекс `by_source` по полю `source`).

**Сигнатуры:**

- `theme_asset_url( $file ): string` — URL файла в assets/ темы:
  `get_template_directory_uri() . '/assets/' . ltrim( $file, '/' )`.
- `theme_icon( $name, $class = '', $args = array() ): string` — `$name` это
  **имя файла в `frontend/raw/` без расширения** (подпапка — через слеш);
  из него строится ключ `$source = 'frontend/raw/' . $name . '.svg'`. Режим
  берется из записи манифеста:
  - `inline` — читает файл `assets/ui/<имя>.svg` с диска
    (`get_template_directory()`) и вставляет целиком: класс сливается с
    корнем `<svg>`, дефолтные `aria-hidden="true"` / `focusable="false"`
    (aria-label снимает скрытие) — зеркала `my_theme_icon_inline_html()` /
    `my_theme_icon_pairs()` повторяют логику `projectSvg`;
  - `sprite` — `<svg class="…"><use href="{theme_asset_url(file)}#{symbol}"></use></svg>`
    (`my_theme_icon_sprite_html()`, symbol и file из манифеста);
  - `img` — `<img src loading alt [width] [height] class>` (`my_theme_icon_img_html()`).
  Ошибки — **fail-fast**: `RuntimeException` («Icon not found: …», «Icon not
  readable: …», «Icon broken: …», «Icon unknown mode: …») — страница падает
  с понятным сообщением вместо дыры в разметке.
- `theme_picture( $name, $args = array() ): string` — растровый `<picture>`:
  ищет `frontend/raw/<name>.jpg|.jpeg|.png` по очереди; собирает `<source>`
  AVIF → WebP (`my_theme_srcset()` — «URL 1x, URL 2x») + `<img>`-фолбэк
  исходного формата (src — 1x-вариант, srcset — вся серия, размеры против
  CLS, `loading`/`decoding` из `$args`: `alt`, `imgClass`, `loading`,
  `decoding`). Осознанное отличие от фронтенд-макроса: у PHP-версии `src`
  указывает на 1x-вариант (у ui.picture — @2x-оригинал при retina-исходнике).

Реальные вызовы из кода/доков (Cookbook, docs/ASSETS_GUIDE.md):

```php
<?php echo theme_picture( 'hero', array( 'alt' => 'Кухня в готовом интерьере' ) ); ?>
<?php echo theme_icon( 'phone', 'contacts__icon' ); ?>
<?php echo theme_icon( 'user', '', array( 'aria-label' => 'Профиль' ) ); ?>
<?php echo theme_icon( 'demo-sprite', 'nav__icon' ); ?>
<?php echo theme_asset_url( 'img/hero.fbf7356d.jpg' ); // og:image и т.п. ?>
```

Тесты хелперов: `backend/wp-content/themes/my-theme/tests/test_helpers.php`
(standalone, фикстуры `tests/fixtures/my-theme/assets/…`) и
`tests/helpers-eval.php` (внутри DDEV: `pnpm test:wp` →
`scripts/test-wp-helpers.ts` → `ddev wp eval-file wp-content/themes/my-theme/tests/helpers-eval.php`
из каталога `backend/`).

### 2.4 Динамические картинки из uploads

`backend/wp-content/themes/my-theme/inc/helpers.php`:
`my_theme_replace_img_with_picture( $html )` — фильтры `the_content`,
`post_thumbnail_html`, `woocommerce_product_get_image` (приоритет 99).
Для каждого `<img>` ищет сиблинги `photo.jpg.avif` / `photo.jpg.webp` рядом
с оригиналом в uploads (плагин «Converter for Media» создает их сам;
`file_exists` через `baseurl → basedir`). Сиблингов нет → `<img>` как есть
(безопасный фолбэк), класс `skip-picture` отключает обертку. Этот хелпер
трогает только контент из админки — статические ассеты темы обрабатываются
на сборке.

### 2.5 Проверенные расхождения (важно знать)

1. **Несовпадение ключа манифеста в enqueue-assets.php.** Код темы ищет
   `$js_entry = 'frontend/src/js/app.js'`, но реальный ключ манифеста после
   миграции на TypeScript — `frontend/src/js/app.ts` (подтверждено сборкой в
   `backend/wp-content/themes/my-theme/assets/manifest.json` и проверкой в
   `scripts/check-build.ts:93`). В production `get_asset('frontend/src/js/app.js')`
   не найдет запись → `error_log` + `''` → скрипт/CSS не подключатся. Дев-
   фолбэк при этом работает. При реализации генератора/правок темы ключ
   нужно привести к `.ts` (или расширить `get_asset` до fallback-поиска).
2. **Расположение .ddev.** `README.md` и `scripts/test-wp-helpers.ts`
   описывают `backend/.ddev/` (и `.gitignore` игнорирует `/backend/.ddev`),
   но фактически в рабочей копии `.ddev/config.yaml` лежит **в корне
   репозитория** (untracked: `docroot: backend`, `name:
   vite-bridge-boilerplate`, php 8.2, mariadb 11.8, nodejs_version 24).
   Скрипты с `cwd: "backend"` при таком раскладе `dpx`-проект не увидят.
   Это незакоммиченное состояние — при реализации генератора место .ddev
   нужно определять динамически (корень или backend/). Заодно замечено
   расхождение версий: `.ddev/config.yaml` — `nodejs_version: "24"`,
   `.tool-versions` — `nodejs 22.23.4`.
3. `load_theme_textdomain()` в теме не вызывается (проверено) — строки
   `__()' с textdomain 'my-theme' есть, загрузчика переводов нет.

---

## 3. Концепция Генератора: scripts/init-project.ts

> **Статус: РЕАЛИЗОВАНО** — скрипт лежит в `scripts/init-project.ts` (2026-11-15),
> запуск: `pnpm init-project`. Флаги: `--name=<slug>`, `--title=<Название>`,
> `--dry-run`, `--yes`. Только `node:*` — работает на свежем клоне до `pnpm install`.
> Этапы: validate → rename → replace → configs → cleanup → verify → report.
> Отличия от концепта ниже: фикстуры живут ВНУТРИ темы
> (`themes/<slug>/tests/fixtures/`), поэтому папки переименовываются по одной
> с пересканированием после каждого rename; старые токены сверяются тремя
> формами (`my_theme`, `my-theme`, `My Theme`); `docs/BOILERPLATE_MANUAL.md`
> исключён из замен (документация бойлерплейта).
> Исходная задача в PLAN.md («Бэклог → 3. Автоматическое переименование темы»)
> закрыта; «Фаза 5: Упаковка в Yeoman-генератор» — более дальняя цель.

### 3.1 Назначение и входные данные

При создании нового магазина на базе бойлерплейта скрипт переименовывает
дефолтную тему под новое имя проекта и подчищает конфиги и артефакты.

Входные данные (флаги CLI + интерактивные prompts при отсутствии):

| Параметр | Обяз. | Флаг | Валидация/назначение |
|---|---|---|---|
| slug проекта | да | `--slug=foo-shop` | `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, длина 3–63 (см. 3.6 про ddev). Становится: именем папки темы, textdomain, DDEV-именем, `package.json` name, `project.config.json`. |
| название (display name) | нет | `--name="Foo Shop"` | Для `Theme Name:` в style.css и `site.name` в `frontend/src/data/site.json`. Дефолт — slug в Title Case. |
| домен | нет | `--domain=fooshop.ru` | Для `site.url` в site.json (сейчас `https://example.com`) и опционально `additional_fqdns` в .ddev/config.yaml. Без валидации, кроме «не пусто, если указан». |
| PHP-префикс | нет | `--php-prefix=foo_shop` | Дефолт: slug с `-` → `_` (derived), используем для `my_theme_*` → `<prefix>_`. |
| флаги | — | `--dry-run`, `--force`, `--skip-install`, `--keep-git`, `--yes` | см. 3.5. |

Про «запрет имён без дефиса»: hard-запрет **не нужен** (однословный slug
валиден для DDEV и папки), но стоит **warn'ить**, если slug без дефиса и
короче 5 символов — выше шанс коллизии с другими локальными DDEV-проектами
(имя глобально уникально среди запущенных проектов DDEV). Запрещены:
ведущий/замыкающий дефис, два дефиса подряд, цифра в начале, верхний регистр
(slug строго lower-kebab), slug `my-theme` (равен дефолту — бессмысленно) и
slug, совпадающий с существующей папкой `backend/wp-content/themes/<slug>`.

### 3.2 Валидация (до любых изменений)

1. **Среда**: Node LTS (переиспользовать логику `scripts/check-node.js`),
   pnpm, git, (опц.) ddev/dpx в PATH.
2. **Чистота git**: `git status --porcelain` не пуст → предупреждение/выход
   без `--force` (в текущей рабочей копии незакоммичены PLAN.md и .ddev/ —
   скрипт не должен молча коммитить чужие изменения; он вообще не коммитит —
   решение принимает человек/оркестратор).
3. **Целевое имя свободно**: нет папки `backend/wp-content/themes/<slug>`,
   нет DDEV-проекта с таким именем (`ddev list --json`), нет записи в
   реестре dpx (`~/.config/dpx/projects.json`, путь из README) — если ddev
   недоступен, пункт пропускается с warning.
4. **Ожидаемые файлы на месте**: инварианты дефолтного состояния — папка
   `backend/wp-content/themes/my-theme`, `my-theme` в
   `vite.config.ts`/`.gitignore`/`scripts/check-build.ts` и т.д. Каждая
   проверка — число ожидаемых вхождений в конкретном файле; меньше ожидаемого
   → выход с перечнем (бойлерплейт уже «наполовину переименован» —
   продолжать нельзя без `--force`).

### 3.3 ПОЛНЫЙ чек-лист мест для переименования (проверено grep'ом)

Ниже — все места, где встречаются дефолтные имена. Символы замены: `<slug>`
= foo-shop, `<Prefix>` = foo_shop (PHP), `<Name>` = Foo Shop.

**A. Папка темы и её содержимое (rename папки):**

- `backend/wp-content/themes/my-theme/` → `backend/wp-content/themes/<slug>/`
  (вся папка; `assets/` внутри — артефакт сборки, её можно не переносить,
  см. 3.4);
- `backend/wp-content/themes/my-theme/tests/fixtures/my-theme/` →
  `…/tests/fixtures/<slug>/` (папка фикстур тестов хелперов).

**B. style.css темы** (`backend/wp-content/themes/my-theme/style.css`):
- `Theme Name: My Theme` → `Theme Name: <Name>`;
- `Text Domain: my-theme` → `Text Domain: <slug>`;
- (опц.) `Theme URI` / `Description` — сейчас `https://example.com` и текст
  про бойлерплейт.

**C. PHP-префикс `my_theme_` → `<Prefix>_`** (все 8 файлов с вхождениями;
границы слов, `\bmy_theme_`):

| Файл | Что внутри |
|---|---|
| `backend/wp-content/themes/my-theme/inc/assets-helpers.php` | 22 вхождения: `my_theme_smart_assets`, `my_theme_render_attrs`, `my_theme_icon_pairs`, `my_theme_icon_inline_html`, `my_theme_icon_sprite_html`, `my_theme_icon_img_html`, `my_theme_srcset`, `my_theme_picture_html` |
| `backend/wp-content/themes/my-theme/inc/enqueue-assets.php` | `my_theme_enqueue_assets`, `my_theme_script_loader_tag` |
| `backend/wp-content/themes/my-theme/inc/helpers.php` | `my_theme_replace_img_with_picture` (+3 регистрации фильтров) |
| `backend/wp-content/themes/my-theme/inc/theme-support.php` | `my_theme_register_menus`, `my_theme_menu_fallback` |
| `backend/wp-content/themes/my-theme/inc/custom-post-types.php` | `my_theme_register_portfolio_cpt` |
| `backend/wp-content/themes/my-theme/header.php` | `'fallback_cb' => 'my_theme_menu_fallback'` |
| `backend/wp-content/themes/my-theme/footer.php` | `'fallback_cb' => 'my_theme_menu_fallback'` |
| `backend/wp-content/themes/my-theme/tests/helpers-eval.php` | 11 вхождений (тестовый вызов хелперов) |

**D. Textdomain `'my-theme'` → `'<slug>'`** (строки в `__()`):
- `backend/wp-content/themes/my-theme/inc/custom-post-types.php` — 10 строк
  (метки CPT «Портфолио»);
- `backend/wp-content/themes/my-theme/inc/theme-support.php` — 2 строки
  (метки меню primary/footer).

**E. Handles enqueue** → `'<slug>-app'`:
- `backend/wp-content/themes/my-theme/inc/enqueue-assets.php` — 3 места:
  `wp_enqueue_script('my-theme-app', …)`, `wp_enqueue_style('my-theme-app' . …)`,
  guard в `my_theme_script_loader_tag` (`'my-theme-app' !== $handle`).

**F. Конфиги сборки (корень репо):**

| Файл | Что менять |
|---|---|
| `vite.config.ts` | `const wpAssetsDir = "backend/wp-content/themes/my-theme/assets";` (строка 265) + 2 упоминания в комментариях. **Единственное место в сборке с именем темы.** |
| `.gitignore` | Негейт-паттерны: `!/backend/wp-content/themes/my-theme` и `/backend/wp-content/themes/my-theme/assets/` + 2 комментария. Не заменить — тема перестанет коммититься (паттерн `/backend/wp-content/themes/*` всё исключает). |
| `package.json` | `"name": "vite-bridge-boilerplate"` → `<slug>` (или имя нового репо); сброс `"version"` (например, 0.1.0). |
| `project.config.json` | `"projectName"` и `"themeSlug"` (сейчас оба `vite-bridge-boilerplate`). Важно: `themeSlug` сейчас **не равен** `my-theme` и **не потребляется ни одним скриптом** (проверено grep'ом) — это декларативные метаданные; при реализации решить семантику (slug проекта vs slug темы) и либо привести в соответствие, либо удалить. |
| `pnpm-workspace.yaml` | Имя проекта **не содержит** (только `packages/*` и build-скрипты) — **не трогать** (проверено). |
| `pnpm-lock.yaml` | Имя проекта **не содержит** (lockfileVersion 9.0, в `importers` нет `name:`) — регенерация не требуется ради имени; `pnpm install` всё равно выполняется на этапе install (3.4). |

**G. Скрипты (scripts/):**

| Файл | Что менять |
|---|---|
| `scripts/check-build.ts` | Хардкоды: `"backend/wp-content/themes/my-theme/inc/enqueue-assets.php"` (чтение PHP-файла для проверок) и проверка подстроки `'"backend/wp-content/themes/my-theme/assets"'` в vite.config.ts. Не заменить → `pnpm test:build` падает. |
| `scripts/strip-avif.ts` | `const ROOT = process.argv[2] || "backend/wp-content/themes/my-theme";` + комментарий. |
| `scripts/test-wp-helpers.ts` | `const EVAL_FILE = "wp-content/themes/my-theme/tests/helpers-eval.php";` (комментарий про расположение .ddev — см. 3.6). |
| `scripts/make-favicons.ts` | Комментарий «WordPress: backend/wp-content/themes/my-theme/header.php» (косметика, но пусть будет консистентно). |

**H. DDEV-конфиг:**

- `.ddev/config.yaml` — поле `name:` (сейчас `vite-bridge-boilerplate`).
  **Расположение не фиксировано**: в этой рабочей копии конфиг лежит в КОРНЕ
  репо (untracked), а README/скрипты описывают `backend/.ddev/` (его в
  `.gitignore` игнорирует `/backend/.ddev`). Скрипт обязан искать
  `config.yaml` в обоих местах (`<repo>/.ddev/` и `<repo>/backend/.ddev/`)
  и менять только `name:` (первое поле, `docroot: backend` не трогается).
  Здесь же, при заданном домене, — `additional_fqdns`.

**I. Документация и данные:**

| Файл | Что менять |
|---|---|
| `README.md` | 8 упоминаний `my-theme` (структура, команды `ddev wp theme activate my-theme`, деплой-таблица) + упоминания `boiler-vite` (раздел DDEV: `--project-name=boiler-vite`, `https://boiler-vite.ddev.site`). Рекомендация: не sed'ить вслепую, а переписать разделы «Бэкенд» под новый проект (или сбросить README-заглушкой — решение за автором бойлерплейта). |
| `docs/ASSETS_GUIDE.md` | 1 упоминание пути `backend/wp-content/themes/my-theme/header.php` (глава 7) + 2 упоминания `my_theme_*` как названий функций (обновить под новый префикс, если меняете). |
| `backend/wp-content/themes/my-theme/tests/test_helpers.php` | URL `https://boiler-vite.ddev.site/wp-content/themes/my-theme` и путь фикстур `fixtures/my-theme` (см. A). |
| `backend/wp-content/themes/my-theme/tests/helpers-eval.php` | Комментарий с путем `wp-content/themes/my-theme/tests/helpers-eval.php`. |
| `frontend/src/data/site.json` | `"name": "Vite Bridge Boilerplate"` → `<Name>`, `"url": "https://example.com"` → домен. Имя темы не содержит, но это имя сайта в шаблонах (`site.name`). |
| `PLAN.md` | Содержит архитектуру бойлерплейта, упоминания `my-theme` (в т.ч. сам бэклог про init-скрипт) — подлежит **сбросу** (3.4), не sed'у. |
| `.ck/PLAN.md`, `.ck/README.md` | Содержат `boiler-vite-agent` — служебное Context Keeper-состояние; сбросить/заархивировать для нового проекта (решение — флагом). |

**J. WordPress-БД (не файлы, но обязательно):** после переименования папки
активная тема в БД (`stylesheet`/`template` в wp_options) указывает на
`my-theme` → белый экран/фолбэк. Если DDEV поднят: `ddev wp theme activate
<slug>` (или `ddev wp option update stylesheet <slug>` + `… template <slug>`).
Скрипт делает это только опционально (этап verify, при `--with-ddev`), иначе
пишет в отчёт как ручной шаг.

### 3.4 Что подчищается / сбрасывается

- **Артефакты сборки**: `dist/`, `dist-wp/` (сейчас нет, возникает от
  `pnpm build` / `pnpm strip-avif:dist`), `frontend/src/scss/generated/`
  (генерируется при старте), `node_modules/.cache/smart-assets/` и
  `node_modules/.cache/imagetools/` (кеш sharp-вариантов ключуется
  scope/rawDir — после переименования лучше вычистить), `playwright-report/`,
  `test-results/` (gitignored), `test-results_old/` (в репо лежит реальная
  папка), `backend/wp-content/themes/my-theme/assets/` (не в git; после
  rename папки пересобирается `pnpm build:wp`).
- **Зависимости**: `node_modules` — удалять и переустанавливать **не
  обязательно** (workspace-линк `packages/*` от имени корневого package.json
  не зависит, `pnpm-lock.yaml` имя не содержит), но `pnpm install` на этапе
  install запускается всегда (подтянет изменения package.json).
- **Git**: два режима. Дефолт (рекомендуемый для нового магазина):
  `rm -rf .git && git init -b main` + первичный коммит делает человек
  (скрипт не коммитит сам, только предлагает команду). `--keep-git`: только
  удалить `origin` (сейчас `git@github.com:vinyardrip/vite-bridge-boilerplate.git`)
  и локальный remote `new-work`, историю оставить. «Detachment» (rebase/
  filter-branch для отрезания истории) не предлагать — сложнее и опаснее
  без выгоды.
- **PLAN.md** — заменить заглушкой нового проекта (структура/фазы нового
  магазина), т.к. текущий — источник правды по бойлерплейту с бэклогом.
- **SNIPPETS.md** — проверено: только общие HTML-сниппеты (Telegram/WhatsApp),
  дефолтных имён нет — **оставить как есть**.
- **README.md** — см. 3.3-I: минимум замена имен, лучше переписать разделы
  DDEV/структуры.
- **Ядро WordPress** (`backend/wp-admin/`, `wp-includes/`, дистрибутивные
  темы, `wp-content/plugins/*`) — gitignored, в rename не участвует,
  не трогать. `backend/wp-config.php` / `wp-config-ddev.php` (#ddev-generated)
  — не трогать (DDEV пересоздаст при `ddev start`).

### 3.5 Структура скрипта

Этапы (последовательная функция-оркестратор, каждый этап возвращает
структурированный результат):

```
validate → rename → cleanup → install → verify → report
```

1. **validate** — парсинг аргументов (без внешних зависимостей; или
   `prompts`/`chalk` — они уже в devDependencies корня: `chalk`, `ora`),
   валидация из 3.2, сборка «плана замен»: таблица
   `{ file, kind: rename|patch, replacements: [{ from, to, expectedCount }] }`.
2. **rename** — детерминированные замены по таблице; для каждого файла:
   проверить фактическое число совпадений ≥ ожидаемого (меньше → fail-fast
   с файлом и строкой); патчить через единственный хелпер
   `replaceInFile(file, rules)` (read → replace → compare → write, писать
   только если изменилось); папку темы переименовывать **после** патчей
   содержимого, фикстуры — вместе с ней.
3. **cleanup** — удаление артефактов из 3.4 (каждое — `existsSync` +
   тихий пропуск), сброс PLAN.md, git-режим из 3.4.
4. **install** — `pnpm install` (если не `--skip-install`); опц.
   `pnpm build:wp` — пересоберет ассеты в переименованную тему и создаст оба
   манифеста (дешевая проверка корректности rename сборкой).
5. **verify** —
   - резидуальный grep: `my-theme`, `my_theme_`, `My Theme`, `boiler-vite`,
     `vite-bridge-boilerplate` по git-трекаемым файлам; whitelist разрешенных
     мест (исторические коммиты не считать; файлы, где имя осталось
     намеренно, задать константой);
   - `pnpm test:build` (check-build.ts — после патча его хардкодов должен
     пройти);
   - (опц., `--with-ddev`) `ddev start` + `ddev wp theme activate <slug>`
     + `pnpm test:wp`.
6. **report** — итоговая таблица: файл → число замен; удаленные пути;
   предупреждения; «следующие шаги» (`ddev start`, `ddev wp core install …`,
   `git remote add origin …`, первый коммит). Код возврата 0/1 по итогам
   verify.

**Идемпотентность**: повторный запуск — no-op. Признак «уже выполнено»:
папка `backend/wp-content/themes/<slug>` существует И резидуальный grep по
дефолтным именам пуст → выход 0 с сообщением `already initialized` (без
`--force` не запускать rename повторно).

**Dry-run** (`--dry-run`): выполняет validate и печатает план: каждый файл,
каждую замену `from → to` с ожидаемым числом вхождений, список удалений,
git-операции. Ничего не пишет и не удаляет. Полезно прогонять до и после
любых правок самого скрипта.

**Отчёт**: человекочитаемый вывод в консоль (проектная конвенция — «все
скрипты и процессы должны предоставлять четкую обратную связь», PLAN.md §3);
опц. `--report-json=init-report.json` для автоматизации оркестратором.

### 3.6 Опасности (что нельзя забыть)

1. **Имя DDEV-проекта** становится Docker-контейнером (`ddev-<name>-web`) и
   хостнеймом (`https://<name>.ddev.site`): lowercase-буквы/цифры/дефисы,
   без ведущего дефиса, длина ограничена DNS-меткой (≤ 63; держать ≤ ~30
   для читаемости). Коллизии: имя глобально уникально среди запущенных
   DDEV-проектов машины — проверять `ddev list` и реестр dpx
   (`~/.config/dpx/projects.json`); dpx видит проект только из каталога с
   `.ddev` (сейчас — корень репо, а README/скрипты считают, что `backend/`) —
   **определять место .ddev динамически** и учитывать при шагах
   `--with-ddev`.
2. **.gitignore-негейты**: `/backend/wp-content/themes/*` исключает всё, и
   только `!/backend/wp-content/themes/my-theme` возвращает тему. Забыли
   заменить — `git add .` молча не добавит тему нового проекта.
3. **Хардкоды в scripts/**: `check-build.ts`, `strip-avif.ts`,
   `test-wp-helpers.ts` (полный список в 3.3-G) — без патча сломаются
   `pnpm test:build`, `pnpm build:wp-strip-avif`, `pnpm test:wp`, причем не
   с очевидной ошибкой «файл не найден» в UI.
4. **PHP-префикс**: замена только по `\bmy_theme_`; слепая замена подстроки
   `my_theme` опасна (`'my-theme-app'` использует дефисы — это отдельное
   правило E). Производный префикс из slug с дефисами/цифрами в начале
   валидировать как PHP-идентификатор (`^[A-Za-z_][A-Za-z0-9_]*$`).
5. **Активная тема в БД** (3.3-J): без `wp theme activate` после переименования
   WP отдаст фолбэк-тему — легко принять за «сломался rename».
6. **Кеш smart-assets**: `node_modules/.cache/smart-assets` ключуется
   scope/rawDir, а не именем темы, но WP-сборка пишет в outDir темы — после
   rename чистить кеш, чтобы не оставить смешанное состояние.
7. **Незакоммиченные состояния** (как в текущей копии: PLAN.md, .ddev/):
   validate обязан останавливать без `--force` — иначе rename смешается с
   чужими правками и оркестратор закоммитит лишнее.
8. **Не трогать**: `backend/wp-config.php` (секреты), `wp-config-ddev.php`
   (`#ddev-generated`), `wp-content/uploads`, ядро WP, `.tool-versions`
   (версии инструментов — не имена).
9. **Дополнительно замечено при аудите** (в name-rename не входит, но
   всплывет на verify): несоответствие ключа манифеста `app.js`/`app.ts`
   (2.5-1) и расхождение `nodejs_version` (24 в .ddev/config.yaml) с
   `.tool-versions` (nodejs 22). Проверить при реализации и решить до
   релиза генератора.

### 3.7 Чего нет в репозитории (учесть при реализации)

- Скрипта init/scaffold/generator — нет (полный список `scripts/` в разделе 3).
- `load_theme_textdomain()` — не вызывается; замена textdomain — чисто
  косметическая для `__()`.
- CI-конфигов (`.github/`), husky/lint-staged — нет; «verify»-этап целиком
  локальный (`pnpm verify` = build + test:build + playwright).
- Yeoman-генератора — нет (только пункт «Фаза 5» в PLAN.md и набросок
  prompts-логики в PLAN.md §12: тип проекта, шаблонизатор, CSS — концепт
  init-project.ts сознательно скромнее: переименование готового
  бойлерплейта, а не выбор стека).
- Переменных окружения с именем темы — нет: имя зашито в перечисленных
  файлах, единого источника (вроде project.config.json) скрипты не читают.
  Решение «сначала централизовать, потом генерировать» — опциональный
  рефакторинг до/вместе с init-project.ts (вынесение `wpAssetsDir` в
  project.config.json устранило бы пункты F/G частично, но требует правки
  vite.config.ts и всех скриптов).

## 4. Золотая библиотека: плейсхолдеры и глобальные настройки

Перенос проверенных на боевых проектах PHP-решений (evakuatori/jarrayone →
`inc/utils.php`, `inc/dates.php`, `inc/translit.php`, `inc/global-settings.php`,
все функции с префиксом `my_theme_`).

### 4.1 Плейсхолдеры в контенте (для верстальщика и контент-менеджера)

В любом контенте страницы (Гутенберг, классический редактор, CFS-текстовые
поля) можно писать плейсхолдеры — фильтр `the_content`
(`my_theme_parse_global_placeholders()`) заменяет их на значения при выводе:

| Плейсхолдер | CFS-поле источника | Что подставляется |
| --- | --- | --- |
| `%phone%` / `%phone_2%` | `global_phone` / `global_phone_2` | готовая `<a href="tel:…">` ссылка (номер чистится через `my_theme_trim_spaces_phone()`) |
| `%address%` | `global_address` | адрес (текст) |
| `%zip%` | `global_zip` | индекс |
| `%email%` | `global_email` | e-mail |
| `%rs%` | `global_rs` | расчётный счёт (IBAN) |
| `%unp%` | `global_unp` | УНП (Беларусь) |
| `%bik%` / `%bank%` | `global_bik` / `global_bank` | БИК / банк |
| `%vk%` / `%tg%` / `%wa%` | `global_vk` / `global_tg` / `global_wa` | соцсети/мессенджеры |
| `%date%` | — | «месяц год» с откатом к прошлому месяцу до дня обновления прайсов (см. 4.3) |

Правила написания:
- Регистр не важен (`%PHONE%` = `%phone%`); пробелы внутри допустимы
  (`% phone %`); если редактор экранирует процент (`&#37;` / `&#x25;`) —
  парсер это учитывает.
- Пустое поле → плейсхолдер заменяется пустотой (Zero-If по духу), сайт не
  падает.

### 4.2 Где задаются значения

Значения — CFS-поля `global_*` на «странице контактов». Какая страница является
источником (`my_theme_get_contacts_page_id()`):
1. константа `GLOBAL_SETTINGS_PAGE_ID` в `backend/wp-config.php` (жёсткая
   фиксация ID);
2. иначе — страница со slug `contacts`;
3. иначе — 0 (плейсхолдеры возвращают пустоту).

Сами поля создаются один раз в CFS на этой странице (в проектах с cfs_next —
через его админку; значения хранятся в `_cfs_fields` страницы). Если CFS не
установлен — плейсхолдеры деградируют в пустоту без ошибок.

В PHP-шаблонах значения доступны напрямую:
```php
echo my_theme_get_global_phone_html();                    // <a href="tel:…">
echo my_theme_get_global_phone_html('global_phone_2', 'contacts__link');
echo my_theme_get_global_text_setting('global_address');  // экранированный текст
```

### 4.3 %date% и умный сброс кэша (inc/dates.php)

- Константа `PRICING_UPDATE_DAY` (по умолчанию 5, переопределяется в
  wp-config.php) — день месяца, когда пересчитываются прайсы.
- `%date%` в контенте и `%date%` в CFS-полях
  (`my_theme_get_dynamic_cf_date('field')`) показывают «месяц год»: до дня
  обновления — ПРОШЛЫЙ месяц (прайс гарантированно ещё актуален), с дня
  обновления — текущий.
- WP-Cron ежедневно проверяет дату; в день обновления сбрасывается кэш:
  WP Fastest Cache (если стоит) и объектный кэш (`wp_cache_flush()` — Redis
  через drop-in и любой другой backend).

### 4.4 Транслитерация (inc/translit.php)

Слаги постов/страниц/рубрик и имена загружаемых файлов транслитерируются по
Яндекс-таблице («О компании» → `o-kompanii`). Функция —
`my_theme_yandex_translit()`.

### 4.5 Утилиты (inc/utils.php)

`my_theme_trim_spaces_phone($raw)` — номер для `href="tel:…"` (только цифры,
`+`, префикс tel:); `my_theme_is_mobile()` — серверный детект мобильных по
User-Agent (боевой regex; дополнение к CSS-breakpoints).
