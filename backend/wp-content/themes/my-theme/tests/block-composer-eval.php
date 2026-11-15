<?php
/**
 * =================================================================================================
 * tests/block-composer-eval.php
 * =================================================================================================
 *
 * Интеграционный тест Block Composer (docs/MOCKUP_NOTES.md) — эквивалент
 * PHPUnit-теста без сборки PHPUnit-стенда: WP-CLI загружает WordPress целиком,
 * поэтому функции темы, CFS-движок и WP_Query доступны напрямую.
 *
 * Покрывает (см. docs/PLAN.md, Трек A «Тесты на границе»):
 *   1. Реестр: схема products-grid корректна, партиал существует, термин засеян.
 *   2. Санитизация `_page_blocks`: мусор/несуществующие ID/дубли не сохраняются.
 *   3. cfs_get в контексте блока: значения читаются из конкретной записи блока,
 *      а не из глобального $post (страницы).
 *   4. Рендеринг: правильный партиал, карточки из каталога, empty-state,
 *      manual_products (порядок выбора сохраняется), пропуск незарегистрированных типов.
 *
 * Запуск (DDEV поднят, тема активна):
 *   ddev wp eval-file wp-content/themes/my-theme/tests/block-composer-eval.php
 * Обертка с кодом возврата: pnpm test:php (scripts/test-block-composer.ts).
 *
 * Фикстуры создаются на время теста (страницы, блоки, товары) и удаляются
 * в finally — БД после теста чиста.
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$failures = array();
$check    = static function ( $label, $condition ) use ( &$failures ) {
	if ( $condition ) {
		echo "  ✓ {$label}\n";
	} else {
		$failures[] = $label;
		echo "  ✗ {$label}\n";
	}
};

$cleanup_ids = array();
$cleanup     = static function () use ( &$cleanup_ids ): void {
	foreach ( $cleanup_ids as $id ) {
		wp_delete_post( (int) $id, true );
	}
};

echo "— Block Composer: интеграционные проверки —\n\n";

try {
	// ---------- Фикстуры ----------
	$page_id = (int) wp_insert_post( array(
		'post_type'   => 'page',
		'post_title'  => 'E2E Страница композера',
		'post_status' => 'publish',
	) );
	$cleanup_ids[] = $page_id;

	$product_a_id = (int) wp_insert_post( array(
		'post_type'   => 'product',
		'post_title'  => 'E2E Продукт А',
		'post_status' => 'publish',
	) );
	$product_b_id = (int) wp_insert_post( array(
		'post_type'   => 'product',
		'post_title'  => 'E2E Продукт Б',
		'post_status' => 'publish',
	) );
	$cleanup_ids[] = $product_a_id;
	$cleanup_ids[] = $product_b_id;

	$block_id = (int) wp_insert_post( array(
		'post_type'   => 'block',
		'post_title'  => 'Продуктовая сетка (тест)',
		'post_status' => 'publish',
	) );
	$cleanup_ids[] = $block_id;

	wp_set_object_terms( $block_id, array( 'products-grid' ), 'block_type' );

	// ---------- 1. Реестр и терминология ----------
	echo '1. Реестр, схема, партиал, термины' . "\n";
	$entry = bc_get_entry( 'products-grid' );
	$check( 'products-grid зарегистрирован в реестре', is_array( $entry ) );
	$check( 'схема содержит title/subtitle/source/limit/manual_products', is_array( $entry ) && array_keys( (array) ( $entry['fields'] ?? array() ) ) === array( 'title', 'subtitle', 'source', 'limit', 'manual_products' ) );
	$check( 'manual_products — relationship по product', is_array( $entry ) && ( $entry['fields']['manual_products']['type'] ?? '' ) === 'relationship' && ( $entry['fields']['manual_products']['post_type'] ?? '' ) === 'product' );
	$partial_path = get_theme_file_path( 'template-parts/blocks/' . (string) ( $entry['partial'] ?? '___' ) . '.php' );
	$check( 'партиал блока существует на диске', is_string( $partial_path ) && is_readable( $partial_path ) );
	$check( 'термин block_type=products-grid засеян', (bool) term_exists( 'products-grid', 'block_type' ) );

	// ---------- 2. Санитизация хранилища `_page_blocks` ----------
	echo "\n2. Санитизация _page_blocks при сохранении" . "\n";
	bc_set_page_blocks( $page_id, array( 'abc', 0, '', 999999, (string) $block_id, $block_id, $product_a_id ) );
	$stored = bc_get_page_blocks( $page_id );
	$check( 'мусор («abc», «», 0) отброшен', $stored === array( $block_id ) );
	$check( 'несуществующий ID (999999) отброшен', ! in_array( 999999, $stored, true ) );
	$check( 'пост чужого типа (product) отброшен', ! in_array( $product_a_id, $stored, true ) );
	$check( 'дубль ID схлопнут, тип элементов int', $stored === array( $block_id ) && count( $stored ) === 1 && is_int( $stored[0] ) );

	// ---------- 3. cfs_get в контексте блока ----------
	echo "\n3. Современный движок cfs_next: чтение из конкретного блока" . "\n";
	$GLOBALS['post'] = get_post( $page_id ); // Контекст «страницы», как на витрине.
	$saved = CFS()->engine()->save( $block_id, array(
		'title'           => 'Тестовый заголовок сетки',
		'subtitle'        => 'Тестовый подзаголовок',
		'source'          => 'latest',
		'limit'           => 5,
		'manual_products' => array(),
	) );
	$check( 'engine()->save() вернул успех', (bool) $saved );
	$check( 'CFS()->get(title, block_id) читает значение блока', CFS()->get( 'title', $block_id ) === 'Тестовый заголовок сетки' );
	$check( 'CFS()->get(limit, block_id) — int', CFS()->get( 'limit', $block_id ) === 5 );
	$check( 'cfs_get() без ID берет глобальный $post (страницу), а не блок', cfs_get( 'title', 'fallback-page' ) === 'fallback-page' );

	// ---------- 4. Рендеринг ----------
	echo "\n4. Рендеринг: партиалы, каталог, manual_products, пропуск неизвестных" . "\n";

	ob_start();
	bc_render_page_blocks( $page_id );
	$html = (string) ob_get_clean();
	$check( 'страница рендерит партиал products-grid', str_contains( $html, 'class="section products-grid"' ) );
	$check( 'заголовок из полей блока попал в вывод', str_contains( $html, 'Тестовый заголовок сетки' ) );
	$check( 'обе карточки каталога отрендерились', substr_count( $html, 'product-card' ) >= 2 );
	$check( 'empty-state не показан, когда есть товары', ! str_contains( $html, 'products-grid__empty' ) );

	// manual_products: точный набор + порядок выбора (Б → А). Хранение —
	// конвенция движка: карта {m0: id, m1: id} (list-массивы отбрасываются).
	CFS()->engine()->save( $block_id, array(
		'title'           => 'Тестовый заголовок сетки',
		'source'          => 'manual',
		'limit'           => 8,
		'manual_products' => bc_encode_relationship_ids( array( $product_b_id, $product_a_id ) ),
	) );
	ob_start();
	bc_render_page_blocks( $page_id );
	$html_manual = (string) ob_get_clean();
	$check( 'manual: обе выбранные карточки присутствуют', str_contains( $html_manual, 'E2E Продукт А' ) && str_contains( $html_manual, 'E2E Продукт Б' ) );
	$check( 'manual: порядок выбора сохранён (Б раньше А)', strpos( (string) $html_manual, 'E2E Продукт Б' ) < strpos( (string) $html_manual, 'E2E Продукт А' ) );

	// manual без выбранных товаров → empty-state.
	CFS()->engine()->save( $block_id, array( 'source' => 'manual', 'manual_products' => array() ) );
	ob_start();
	bc_render_page_blocks( $page_id );
	$html_empty = (string) ob_get_clean();
	$check( 'manual без товаров: empty-state вместо пустой сетки', str_contains( $html_empty, 'products-grid__empty' ) );

	// Незарегистрированный тип блока пропускается рендерером.
	$orphan_block_id = (int) wp_insert_post( array(
		'post_type'   => 'block',
		'post_title'  => 'Блок без типа',
		'post_status' => 'publish',
	) );
	$cleanup_ids[] = $orphan_block_id;
	bc_set_page_blocks( $page_id, array( $orphan_block_id ) );
	ob_start();
	bc_render_page_blocks( $page_id );
	$html_orphan = (string) ob_get_clean();
	$check( 'блок с незарегистрированным типом не рендерится', ! str_contains( $html_orphan, 'section products-grid' ) );
	// ---------- 5. Блоки главной: реестр, рендер 4 секций, fallback ----------
	echo "\n5. Блоки главной (hero/advantages/how-we-work/categories)\n";

	foreach ( array( 'products-grid', 'hero', 'advantages', 'how-we-work', 'categories' ) as $slug ) {
		$entry = bc_get_entry( $slug );
		$partial_path = get_theme_file_path( 'template-parts/blocks/' . (string) ( $entry['partial'] ?? '___' ) . '.php' );
		$check( "реестр: $slug зарегистрирован, партиал на диске", is_array( $entry ) && is_readable( $partial_path ) );
	}

	$home_id = (int) wp_insert_post( array(
		'post_type'   => 'page',
		'post_title'  => 'E2E Главная из блоков',
		'post_status' => 'publish',
	) );
	$cleanup_ids[] = $home_id;

	$home_block_ids = array();
	foreach ( array( 'hero', 'advantages', 'how-we-work', 'categories' ) as $slug ) {
		$bid = (int) wp_insert_post( array(
			'post_type'   => 'block',
			'post_title'  => 'E2E ' . $slug,
			'post_status' => 'publish',
		) );
		wp_set_object_terms( $bid, array( $slug ), 'block_type' );
		$home_block_ids[ $slug ] = $bid;
		$cleanup_ids[] = $bid;
	}

	// Hero: заголовок из CFS + картинка из медиатеки.
	$media_ids = get_posts( array(
		'post_type'      => 'attachment',
		'post_mime_type' => 'image/jpeg',
		'fields'         => 'ids',
		'numberposts'    => 1,
	) );
	CFS()->engine()->save( $home_block_ids['hero'], array(
		'title'    => 'Тестовый H1 из блока',
		'subtitle' => '',
		'image'    => bc_encode_relationship_ids( $media_ids ),
	) );

	// Остальные три — пустые поля: секции должны лечь на fallback-статику макета.
	CFS()->engine()->save( $home_block_ids['advantages'], array() );
	CFS()->engine()->save( $home_block_ids['how-we-work'], array() );
	CFS()->engine()->save( $home_block_ids['categories'], array() );

	bc_set_page_blocks( $home_id, array_values( $home_block_ids ) );

	ob_start();
	bc_render_page_blocks( $home_id );
	$home_html = (string) ob_get_clean();

	$check( 'hero рендерит заголовок из CFS-поля', str_contains( $home_html, 'Тестовый H1 из блока' ) );
	// Маркер рендера вложения: URL из /wp-content/uploads/ (runtime-конвейер),
	// а не theme_picture fallback (assets/img/... из raw/).
	$check( 'hero: картинка — вложение медиатеки (uploads)', str_contains( $home_html, '/wp-content/uploads/' ) );
	$check( 'advantages рендерит ghost-заголовок из fallback', str_contains( $home_html, 'Почему мы?' ) );
	$check( 'how-we-work рендерит номер 01/', str_contains( $home_html, '01/' ) );
	$check( 'categories: ровно 4 карточки', substr_count( $home_html, 'cat-card__caption' ) === 4 );
	$check( 'categories: подписи карточек из fallback-статики', str_contains( $home_html, 'Кухни' ) && str_contains( $home_html, 'Матрацы' ) );
}

finally {
	$cleanup();
}

echo "\n";
if ( count( $failures ) > 0 ) {
	throw new Exception(
		sprintf(
			'block-composer-eval: провалено проверок: %s',
			implode( '; ', $failures )
		)
	);
}

echo "ALL PASS\n";
