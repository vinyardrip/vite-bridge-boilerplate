<?php
/**
 * =================================================================================================
 * tests/helpers-eval.php
 * =================================================================================================
 *
 * Mock-тест my_theme_replace_img_with_picture() (inc/helpers.php) — эквивалент
 * PHPUnit-теста без сборки PHPUnit-стенда: WP-CLI уже загрузил WordPress целиком,
 * поэтому wp_get_upload_dir(), add_filter() и функции темы доступны напрямую.
 *
 * Запуск (WordPress должен быть установлен, тема активна):
 *   cd backend && dpx ddev wp eval-file wp-content/themes/my-theme/tests/helpers-eval.php
 * Обертка со сбросом кода возврата: pnpm test:wp (scripts/test-wp-helpers.js).
 *
 * Фикстуры создаются в uploads на время теста (оригинал + сиблинги .avif/.webp
 * в legacy-конвенции) и удаляются в finally — после теста uploads чист.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$failures = array();

$check = static function ( $label, $condition ) use ( &$failures ) {
	if ( $condition ) {
		echo "  ✓ {$label}\n";
	} else {
		$failures[] = $label;
		echo "  ✗ {$label}\n";
	}
};

$upload     = wp_get_upload_dir();
$dummy_url  = $upload['baseurl'] . '/helpers-test-dummy.jpg';
$dummy_path = $upload['basedir'] . '/helpers-test-dummy.jpg';

// Фикстуры: оригинал + сиблинги (file.jpg → file.jpg.avif, file.jpg.webp).
file_put_contents( $dummy_path, 'fake-jpg-bytes' );
file_put_contents( $dummy_path . '.avif', 'fake-avif-bytes' );
file_put_contents( $dummy_path . '.webp', 'fake-webp-bytes' );

echo "\n=== helpers.php: my_theme_replace_img_with_picture ===\n";

try {
	// 1. Оба сиблинга существуют → полный <picture> с AVIF и WebP.
	$img = '<img class="size-medium wp-image-1" src="' . $dummy_url . '" alt="test" width="100" height="50">';
	$out = my_theme_replace_img_with_picture( $img );

	$check( 'img обернут в <picture>', 0 === strpos( $out, '<picture>' ) );
	$check( 'есть <source type="image/avif">', false !== strpos( $out, 'type="image/avif"' ) );
	$check( 'srcset avif указывает на сиблинг', false !== strpos( $out, $dummy_url . '.avif' ) );
	$check( 'есть <source type="image/webp">', false !== strpos( $out, 'type="image/webp"' ) );
	$check( 'sources стоят ПЕРЕД img', strpos( $out, '<source' ) < strpos( $out, '<img' ) );
	$check( 'оригинальный <img> сохранен внутри', false !== strpos( $out, $img ) );

	// 2. Только WebP-сиблинг → <picture> без AVIF-источника.
	unlink( $dummy_path . '.avif' );
	$out = my_theme_replace_img_with_picture( $img );
	$check( 'только webp: <picture> есть', 0 === strpos( $out, '<picture>' ) );
	$check( 'только webp: avif-источника нет', false === strpos( $out, 'type="image/avif"' ) );
	$check( 'только webp: webp-источник есть', false !== strpos( $out, 'type="image/webp"' ) );

	// 3. Сиблингов нет вообще → <img> без изменений.
	unlink( $dummy_path . '.webp' );
	$out = my_theme_replace_img_with_picture( $img );
	$check( 'нет сиблингов: img без обертки', $out === $img );

	// 4. Класс skip-picture → отказ от обертки даже при наличии сиблингов.
	file_put_contents( $dummy_path . '.avif', 'fake-avif-bytes' );
	file_put_contents( $dummy_path . '.webp', 'fake-webp-bytes' );
	$img_skip = '<img class="skip-picture alignleft" src="' . $dummy_url . '" alt="skip">';
	$out      = my_theme_replace_img_with_picture( $img_skip );
	$check( 'skip-picture: img без обертки', $out === $img_skip );

	// 5. <img> без src → без изменений (в legacy-коде оборачивался в пустой <picture>).
	$img_no_src = '<img class="broken" alt="no-src">';
	$out        = my_theme_replace_img_with_picture( $img_no_src );
	$check( 'img без src: без изменений', $out === $img_no_src );

	// 6. Внешний src (вне uploads) → без изменений и без stat по URL.
	$img_external = '<img src="https://example.com/remote.jpg" alt="remote">';
	$out          = my_theme_replace_img_with_picture( $img_external );
	$check( 'внешний src: без изменений', $out === $img_external );

	// 7. Фильтры подключены (см. inc/helpers.php).
	$check( 'фильтр the_content подключен', false !== has_filter( 'the_content', 'my_theme_replace_img_with_picture' ) );
	$check( 'фильтр post_thumbnail_html подключен', false !== has_filter( 'post_thumbnail_html', 'my_theme_replace_img_with_picture' ) );
	$check( 'фильтр woocommerce_product_get_image подключен', false !== has_filter( 'woocommerce_product_get_image', 'my_theme_replace_img_with_picture' ) );
} finally {
	// Фикстуры не должны переживать тест, даже если проверки упали.
	foreach ( array( '', '.avif', '.webp' ) as $suffix ) {
		if ( file_exists( $dummy_path . $suffix ) ) {
			unlink( $dummy_path . $suffix );
		}
	}
}

echo "\n";
if ( count( $failures ) > 0 ) {
	throw new Exception(
		sprintf(
			'helpers-eval: провалено проверок %d из %d: %s',
			count( $failures ),
			count( $failures ) + 11,
			implode( '; ', $failures )
		)
	);
}

echo "ALL PASS\n";
