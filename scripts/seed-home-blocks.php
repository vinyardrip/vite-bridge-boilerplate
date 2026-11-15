<?php
/**
 * =================================================================================================
 * scripts/seed-home-blocks.php — сидирование главной страницы блоками композера
 * =================================================================================================
 *
 * Запуск: dpx ddev wp eval-file scripts/seed-home-blocks.php --here
 *
 * Что делает (идемпотентно):
 *   1. Находит/создает страницу-фронт «Главная» (show_on_front=page, page_on_front=ID).
 *   2. Для каждого из 4 блоков реестра (hero, advantages, how-we-work, categories)
 *      находит существующую запись блока по заголовку или создает новую (publish,
 *      термин block_type), заполняет CFS-поля тестовыми данными из медиабиблиотеки.
 *   3. Записывает ID блоков в `_page_blocks` страницы (JSON, порядок = порядок секций).
 *
 * Повторный запуск ничего не дублирует: существующие блоки переиспользуются,
 * поля перезаписываются тестовыми значениями (актуально для повторного демо).
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// ── 1. Страница-фронт ────────────────────────────────────────────────────────

$front_id = (int) get_option( 'page_on_front' );
if ( get_option( 'show_on_front' ) !== 'page' || $front_id < 1 ) {
	$front_id = (int) wp_insert_post( array(
		'post_type'   => 'page',
		'post_title'  => 'Главная',
		'post_name'   => 'home',
		'post_status' => 'publish',
	) );
	update_option( 'show_on_front', 'page' );
	update_option( 'page_on_front', $front_id );
	echo "Создана страница-фронт: ID {$front_id}\n";
} else {
	echo "Страница-фронт: ID {$front_id} (существующая)\n";
}

// ── 2. Медиа для картинок ────────────────────────────────────────────────────

// Аттачменты берем напрямую запросом к медиабиблиотеке.
$attachment_ids = array_map( 'intval', get_posts( array(
	'post_type'      => 'attachment',
	'post_mime_type' => 'image/jpeg',
	'post_status'    => 'inherit',
	'numberposts'    => 8,
	'fields'         => 'ids',
	'orderby'        => 'ID',
	'order'          => 'DESC',
) ) );

if ( count( $attachment_ids ) < 4 ) {
	echo "⚠ Медиабиблиотека: меньше 4 jpeg-вложений — картинок в блоках будет меньше, секции лягут на fallback-статику\n";
}

// ── 3. Блоки ─────────────────────────────────────────────────────────────────

$block_defs = array(
	array(
		'slug'     => 'hero',
		'post_name' => 'bc-hero',
		'title'    => 'Hero — первый экран',
		'fields'   => array(
			'title'    => 'Каталог Grand Mebel',
			'subtitle' => 'топ за свои деньги',
			'image'    => array_slice( $attachment_ids, 0, 1 ),
		),
	),
	array(
		'slug'     => 'advantages',
		'post_name' => 'bc-advantages',
		'title'    => 'Advantages — Почему мы?',
		'fields'   => array(
			'title'    => 'Почему мы?',
			'subtitle' => 'То, что вам нужно о нас знать',
			'image'    => array_slice( $attachment_ids, 1, 1 ),
		),
	),
	array(
		'slug'     => 'how-we-work',
		'post_name' => 'bc-how-we-work',
		'title'    => 'How we work — Как мы работаем?',
		'fields'   => array(
			'title'    => 'Как мы работаем?',
			'subtitle' => 'То, что вам нужно о нас знать',
			'image'    => array_slice( $attachment_ids, 2, 1 ),
		),
	),
	array(
		'slug'     => 'categories',
		'post_name' => 'bc-categories',
		'title'    => 'Categories — Категории товаров',
		'fields'   => array(
			'title'    => 'Категории товаров',
			'subtitle' => 'Найдите то, что вам нужно',
			'images'   => array_slice( $attachment_ids, 0, 4 ),
		),
	),
);

$block_ids = array();

foreach ( $block_defs as $def ) {
	$existing = get_posts( array(
		'post_type'      => 'block',
		'name'           => $def['post_name'],
		'posts_per_page' => 1,
		'fields'         => 'ids',
		'post_status'    => 'any',
	) );

	if ( ! empty( $existing ) ) {
		$block_id = (int) $existing[0];
		echo "Блок «{$def['title']}» уже существует: ID {$block_id} (переиспользуется)\n";
	} else {
		$block_id = (int) wp_insert_post( array(
			'post_type'   => 'block',
			'post_title'  => $def['title'],
			'post_name'   => $def['post_name'],
			'post_status' => 'publish',
		) );
		echo "Создан блок «{$def['title']}»: ID {$block_id}\n";
	}

	wp_set_object_terms( $block_id, array( $def['slug'] ), 'block_type' );

	// relationship-поля — конвенция движка: карта {m0: id, m1: id}.
	$fields = $def['fields'];
	if ( isset( $fields['image'] ) ) {
		$fields['image'] = bc_encode_relationship_ids( $fields['image'] );
	}
	if ( isset( $fields['images'] ) ) {
		$fields['images'] = bc_encode_relationship_ids( $fields['images'] );
	}

	CFS()->engine()->save( $block_id, $fields );

	$block_ids[] = $block_id;
}

// ── 4. Список блоков на страницу-фронт ───────────────────────────────────────

bc_set_page_blocks( $front_id, $block_ids );
echo "Страница {$front_id}: _page_blocks = " . wp_json_encode( $block_ids ) . "\n";
echo "Готово. Открой https://grand-mebel.lo/ — главная собрана из блоков.\n";
