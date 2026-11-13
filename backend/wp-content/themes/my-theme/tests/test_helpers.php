<?php
/**
 * =================================================================================================
 * tests/test_helpers.php
 * =================================================================================================
 *
 * Standalone-проверка PHP-хелперов ассетов (theme_icon / theme_picture /
 * theme_asset_url из inc/assets-helpers.php) БЕЗ WordPress и DDEV:
 * WP-функции подменяются заглушками, манифест и inline-иконка читаются
 * из фикстур tests/fixtures/my-theme/ (формат assets-manifest.json —
 * ровно такой, как пишет vite-plugin-smart-assets в WP-сборке, scope="").
 *
 * Запуск (глобальный PHP не установлен — только через mise):
 *
 *   cd backend/wp-content/themes/my-theme
 *   mise x php@8.5.10 -- php tests/test_helpers.php
 *
 * Успех = exit 0 И маркер "ALL PASS" в выводе. assert() требует
 * zend.assertions=1 (в CLI включено по умолчанию; можно явно:
 *   mise x php@8.5.10 -- php -d zend.assertions=1 tests/test_helpers.php
 * ).
 * =================================================================================================
 */

define( 'ABSPATH', __DIR__ . '/' );

/**
 * Заглушки WP: "тема" — фикстуры рядом со спекой.
 */
function get_template_directory() {
	return __DIR__ . '/fixtures/my-theme';
}

function get_template_directory_uri() {
	return 'https://boiler-vite.ddev.site/wp-content/themes/my-theme';
}

/**
 * Мини-заглушки WP-экранирования (семантика esc_attr/esc_url: ENT_QUOTES,
 * без двойного кодирования существующих сущностей). Хватает для проверок
 * атрибутов и URL фикстур без спецсимволов внутри путей.
 */
function esc_attr( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8', false );
}

function esc_url( $url ) {
	return htmlspecialchars( trim( (string) $url ), ENT_QUOTES, 'UTF-8', false );
}

require_once dirname( __DIR__ ) . '/inc/assets-helpers.php';

$URI = 'https://boiler-vite.ddev.site/wp-content/themes/my-theme/assets';

// ----------------------------------------------------------------------------------------------------------------
// theme_icon: mode inline
// ----------------------------------------------------------------------------------------------------------------

$inline = theme_icon( 'phone' );
assert( str_contains( $inline, '<svg' ), 'inline: есть <svg>' );
assert( str_contains( $inline, 'stroke="currentColor"' ), 'inline: currentColor из нормализованного файла' );
assert( str_contains( $inline, 'aria-hidden="true"' ), 'inline: декоративная скрыта' );
assert( str_contains( $inline, 'focusable="false"' ), 'inline: focusable=false' );
assert( ! str_contains( $inline, '<use' ), 'inline: без <use>' );
assert( ! str_contains( $inline, 'class=' ), 'inline: без класса у корня' );
assert( str_contains( $inline, 'viewBox="0 0 61 61"' ), 'inline: viewBox исходника сохранен' );
echo "ok: theme_icon inline — базовая разметка\n";

$inline_classed = theme_icon( 'phone', 'header__icon' );
assert( str_contains( $inline_classed, 'class="header__icon"' ), 'inline: класс добавлен к корню' );
echo "ok: theme_icon inline — класс\n";

$inline_labeled = theme_icon( 'phone', 'x', array( 'aria-label' => 'Позвонить' ) );
assert( str_contains( $inline_labeled, 'aria-label="Позвонить"' ), 'inline: aria-label выведен' );
assert( ! str_contains( $inline_labeled, 'aria-hidden' ), 'inline: aria-label снимает aria-hidden' );
echo "ok: theme_icon inline — aria-label\n";

$inline_hidden = theme_icon( 'phone', '', array( 'aria-hidden' => 'false' ) );
assert( str_contains( $inline_hidden, 'aria-hidden="false"' ), 'inline: явный aria-hidden сильнее дефолта' );
echo "ok: theme_icon inline — явный aria-hidden\n";

// ----------------------------------------------------------------------------------------------------------------
// theme_icon: mode sprite
// ----------------------------------------------------------------------------------------------------------------

$sprite = theme_icon( 'demo-sprite', 'nav__icon' );
assert( str_contains( $sprite, 'class="nav__icon"' ), 'sprite: класс на обертке' );
assert(
	str_contains( $sprite, '<use href="' . $URI . '/icons/sprite.289c7160.svg#demo-sprite"></use>' ),
	'sprite: <use href="URL#symbol"> (URL абсолютный, symbol из манифеста)'
);
assert( str_contains( $sprite, 'aria-hidden="true"' ), 'sprite: aria-hidden по умолчанию' );
echo "ok: theme_icon sprite — <use href>\n";

$sprite_labeled = theme_icon( 'demo-sprite', '', array( 'aria-label' => 'Меню' ) );
assert( str_contains( $sprite_labeled, 'aria-label="Меню"' ), 'sprite: aria-label' );
assert( ! str_contains( $sprite_labeled, 'aria-hidden' ), 'sprite: aria-label снимает aria-hidden' );
echo "ok: theme_icon sprite — aria-label\n";

// ----------------------------------------------------------------------------------------------------------------
// theme_icon: mode img (SVG-иллюстрации)
// ----------------------------------------------------------------------------------------------------------------

$img = theme_icon( 'banner', '', array( 'alt' => 'Баннер акции' ) );
assert( str_contains( $img, '<img src="' . $URI . '/img/banner.abc12345.svg"' ), 'img: src из манифеста' );
assert( str_contains( $img, 'loading="lazy"' ), 'img: loading=lazy по умолчанию' );
assert( str_contains( $img, 'alt="Баннер акции"' ), 'img: alt из args' );
echo "ok: theme_icon img — <img>\n";

// ----------------------------------------------------------------------------------------------------------------
// theme_icon: fail-fast
// ----------------------------------------------------------------------------------------------------------------

$thrown = null;
try {
	theme_icon( 'nope' );
} catch ( RuntimeException $e ) {
	$thrown = $e;
}
assert( $thrown !== null, 'fail-fast: отсутствие иконки бросает исключение' );
assert( str_contains( $thrown->getMessage(), 'Icon not found: nope' ), 'fail-fast: сообщение содержит имя иконки' );
echo "ok: theme_icon fail-fast — Icon not found\n";

// ----------------------------------------------------------------------------------------------------------------
// theme_picture: <picture> с AVIF/WebP-источниками и retina-парами
// ----------------------------------------------------------------------------------------------------------------

$picture = theme_picture( 'hero', array( 'alt' => 'Кухня' ) );
assert( str_contains( $picture, '<picture>' ), 'picture: обертка' );
assert(
	str_contains(
		$picture,
		'<source type="image/avif" srcset="' . $URI . '/img/hero.fbf7356d@2x.avif 2x, ' . $URI . '/img/hero.fbf7356d.avif 1x">'
	),
	'picture: <source> AVIF c парой 1x/2x (AVIF первый, порядок вариантов — как в манифесте)'
);
assert(
	str_contains(
		$picture,
		'<source type="image/webp" srcset="' . $URI . '/img/hero.fbf7356d@2x.webp 2x, ' . $URI . '/img/hero.fbf7356d.webp 1x">'
	),
	'picture: <source> WebP'
);
assert(
	str_contains( $picture, 'src="' . $URI . '/img/hero.fbf7356d.jpg"' ),
	'picture: src фолбэка — 1x-вариант (не @2x, хотя он первый в variants)'
);
assert(
	str_contains(
		$picture,
		'srcset="' . $URI . '/img/hero.fbf7356d@2x.jpg 2x, ' . $URI . '/img/hero.fbf7356d.jpg 1x"'
	),
	'picture: srcset фолбэка 1x/2x'
);
assert( str_contains( $picture, 'width="592" height="402"' ), 'picture: размеры 1x из манифеста (анти-CLS)' );
assert( str_contains( $picture, 'loading="lazy" decoding="async" alt="Кухня">' ), 'picture: loading/decoding/alt' );
echo "ok: theme_picture — полный <picture>\n";

$escaped = theme_picture( 'hero', array( 'alt' => 'Кух"ня & <x>' ) );
assert(
	str_contains( $escaped, 'alt="Кух&quot;ня &amp; &lt;x&gt;"' ),
	'picture: alt экранируется esc_attr'
);
echo "ok: theme_picture — экранирование alt\n";

$picture_classed = theme_picture( 'hero', array( 'alt' => '', 'imgClass' => 'card__img' ) );
assert( str_contains( $picture_classed, 'class="card__img"' ), 'picture: imgClass на <img>' );
echo "ok: theme_picture — imgClass\n";

echo "ALL PASS\n";
