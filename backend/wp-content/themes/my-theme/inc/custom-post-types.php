<?php
/**
 * =================================================================================================
 * inc/custom-post-types.php
 * =================================================================================================
 *
 * Произвольные типы записей (CPT) и таксономии темы.
 *
 * Новый CPT оформлять по образцу:
 *
 *   function my_theme_register_<name>_cpt() {
 *       register_post_type( '<name>', array( ... ) );
 *   }
 *   add_action( 'init', 'my_theme_register_<name>_cpt' );
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * CPT «Портфолио»: публичные работы с контентом (заголовок + редактор).
 * Слаг archive-страницы — /portfolio; иконка в админке — чемодан.
 */
function my_theme_register_portfolio_cpt() {
	register_post_type(
		'portfolio',
		array(
			'labels'              => array(
				'name'               => __( 'Портфолио', 'my-theme' ),
				'singular_name'      => __( 'Работа', 'my-theme' ),
				'add_new'            => __( 'Добавить работу', 'my-theme' ),
				'add_new_item'       => __( 'Добавить работу', 'my-theme' ),
				'edit_item'          => __( 'Редактировать работу', 'my-theme' ),
				'new_item'           => __( 'Новая работа', 'my-theme' ),
				'view_item'          => __( 'Смотреть работу', 'my-theme' ),
				'search_items'       => __( 'Найти работу', 'my-theme' ),
				'not_found'          => __( 'Работ не найдено', 'my-theme' ),
				'not_found_in_trash' => __( 'В корзине работ нет', 'my-theme' ),
				'menu_name'          => __( 'Портфолио', 'my-theme' ),
			),
			'public'              => true,
			'show_ui'             => true,
			'show_in_rest'        => true,
			'has_archive'         => true,
			'menu_position'       => 20,
			'menu_icon'           => 'dashicons-portfolio',
			'rewrite'             => array(
				'slug' => 'portfolio',
			),
			'supports'            => array(
				'title',
				'editor',
			),
		)
	);
}
add_action( 'init', 'my_theme_register_portfolio_cpt' );
