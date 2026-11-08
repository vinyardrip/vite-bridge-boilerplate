<?php
/**
 * =================================================================================================
 * inc/theme-support.php
 * =================================================================================================
 *
 * Базовые возможности темы: add_theme_support, меню, области виджетов.
 * Сюда же добавлять новые theme-фичи по мере роста проекта.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Заголовок <title> управляется WordPress (без ручного <title> в шаблонах).
add_theme_support( 'title-tag' );

// Миниатюры записей.
add_theme_support( 'post-thumbnails' );

// Современная HTML5-разметка для генерируемых WordPress элементов.
add_theme_support(
	'html5',
	array(
		'search-form',
		'comment-form',
		'comment-list',
		'gallery',
		'caption',
		'style',
		'script',
	)
);

// Кастомный логотип (Настраивается в кастомайзере).
add_theme_support(
	'custom-logo',
	array(
		'height'      => 64,
		'width'       => 200,
		'flex-height' => true,
		'flex-width'  => true,
	)
);

// Адаптивные embed'ы (YouTube и т.п. оборачиваются в responsive-обертку).
add_theme_support( 'responsive-embeds' );

// Широкие/полные выравнивания в редакторе блоков.
add_theme_support( 'align-wide' );

/**
 * Области навигации.
 */
function my_theme_register_menus() {
	register_nav_menus(
		array(
			'primary' => __( 'Основное меню', 'my-theme' ),
			'footer'  => __( 'Меню в футере', 'my-theme' ),
		)
	);
}
add_action( 'after_setup_theme', 'my_theme_register_menus' );
