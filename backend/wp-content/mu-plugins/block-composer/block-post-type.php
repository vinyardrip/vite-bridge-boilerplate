<?php
/**
 * =================================================================================================
 * mu-plugins/block-composer/block-post-type.php
 * =================================================================================================
 *
 * CPT `block` (запись = экземпляр блока) и таксономия `block_type` (тип блока).
 * Модель композиции — «Вариант Б» из docs/PLAN.md: схема полей привязана к
 * ТИПУ блока (реестр/термин), запись блока хранит значения своего экземпляра.
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * CPT «Блоки»: непубличный тип записи — контейнер значений одного блока.
 */
function bc_register_cpt() {
	register_post_type(
		'block',
		array(
			'labels'        => array(
				'name'               => __( 'Блоки', 'block-composer' ),
				'singular_name'      => __( 'Блок', 'block-composer' ),
				'add_new'            => __( 'Добавить блок', 'block-composer' ),
				'add_new_item'       => __( 'Добавить блок', 'block-composer' ),
				'edit_item'          => __( 'Редактировать блок', 'block-composer' ),
				'new_item'           => __( 'Новый блок', 'block-composer' ),
				'view_item'          => __( 'Просмотреть блок', 'block-composer' ),
				'search_items'       => __( 'Найти блок', 'block-composer' ),
				'not_found'          => __( 'Блоков не найдено', 'block-composer' ),
				'not_found_in_trash' => __( 'В корзине блоков нет', 'block-composer' ),
				'menu_name'          => __( 'Блоки', 'block-composer' ),
			),
			'public'        => false,
			'show_ui'       => true,
			'show_in_rest'  => true,
			'supports'      => array( 'title' ),
			'menu_position' => 21,
			'menu_icon'     => 'dashicons-screenoptions',
			// Блоки существуют только внутри страниц-композитов: своей rewrite/архивной
			// страницы у них нет, на витрине они рендерятся партиалами через _page_blocks.
			'rewrite'       => false,
		)
	);
}
add_action( 'init', 'bc_register_cpt' );

/**
 * Таксономия «Тип блока»: иерархическая, термины = slug-и блоков из реестра.
 */
function bc_register_taxonomy() {
	register_taxonomy(
		'block_type',
		array( 'block' ),
		array(
			'labels'            => array(
				'name'          => __( 'Типы блоков', 'block-composer' ),
				'singular_name' => __( 'Тип блока', 'block-composer' ),
				'menu_name'     => __( 'Типы блоков', 'block-composer' ),
			),
			'hierarchical'      => true,
			'public'            => false,
			'show_ui'           => true,
			'show_in_rest'      => true,
			'show_admin_column' => true,
			'rewrite'           => false,
		)
	);
}
add_action( 'init', 'bc_register_taxonomy' );

/**
 * Slug-и блоков, доступных в композере (источник — реестр).
 *
 * @return string[]
 */
function bc_registry_slugs(): array {
	return array_keys( bc_registry() );
}

/**
 * Список slug-ов реестра одной строкой (для дешёвой проверки «сеяли ли уже»).
 */
function bc_registry_slugs_key(): string {
	return implode( ',', bc_registry_slugs() );
}

/**
 * Создаёт термины block_type под все блоки из реестра (идемпотентно).
 */
function bc_seed_terms() {
	foreach ( bc_registry_slugs() as $slug ) {
		if ( ! term_exists( $slug, 'block_type' ) ) {
			$entry = bc_get_entry( $slug );
			wp_insert_term( (string) ( $entry['label'] ?? $slug ), 'block_type', array( 'slug' => $slug ) );
		}
	}
}

// При активации темы — гарантированный посев терминов.
add_action( 'after_switch_theme', 'bc_seed_terms' );

// В админке — догоняем термины один раз (фильтр реестра мог расшириться),
// чтобы «+ добавить» в композере всегда видел актуальные типы.
function bc_maybe_seed_terms() {
	if ( get_option( 'bc_terms_seeded' ) !== bc_registry_slugs_key() ) {
		bc_seed_terms();
		update_option( 'bc_terms_seeded', bc_registry_slugs_key(), false );
	}
}
add_action( 'admin_init', 'bc_maybe_seed_terms' );
