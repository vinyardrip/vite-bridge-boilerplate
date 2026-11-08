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

/**
 * Walker: выводит пункты меню «якорями» — той же разметкой, что и
 * статический макет (components/_mobile-menu.njk, partials/_footer.njk):
 * без <ul>/<li>, ссылки — прямые дети контейнера <nav>.
 *
 * Класс ссылки берется из параметра 'link_class' вызова wp_nav_menu()
 * ('nav__link' в шапке, 'footer__link' в футере).
 */
class My_Theme_Anchor_Walker extends Walker_Nav_Menu {

	/**
	 * Рендерит один пункт меню ссылкой <a>.
	 *
	 * @param string   $output            Накапливаемый HTML вывода.
	 * @param WP_Post  $data_object       Объект пункта меню.
	 * @param int      $depth             Уровень вложенности (меню одноуровневые).
	 * @param stdClass $args              Аргументы wp_nav_menu().
	 * @param int      $current_object_id ID текущего объекта.
	 */
	public function start_el( &$output, $data_object, $depth = 0, $args = null, $current_object_id = 0 ) {
		$class = ! empty( $args->link_class ) ? $args->link_class : 'nav__link';

		$output .= '<a class="' . esc_attr( $class ) . '" href="' . esc_url( $data_object->url ) . '">'
			. esc_html( $data_object->title )
			. '</a>';
	}

	/**
	 * Закрытие пункта — ничего: ссылка самодостаточна, </li> не нужен.
	 */
	public function end_el( &$output, $data_object, $depth = 0, $args = null ) {
		// Ссылка уже закрыта в start_el().
	}

	/**
	 * Открытие вложенного уровня — ничего: меню одноуровневые (depth=1).
	 */
	public function start_lvl( &$output, $depth = 0, $args = null ) {
		// Вложенные списки не выводим.
	}

	/**
	 * Закрытие вложенного уровня — ничего: меню одноуровневые (depth=1).
	 */
	public function end_lvl( &$output, $depth = 0, $args = null ) {
		// Вложенные списки не выводим.
	}
}

/**
 * Fallback для wp_nav_menu(): ссылки по умолчанию, пока меню не назначено
 * в админке. Повторяет разметку Nunjucks-версии, чтобы тема работала
 * «из коробки» сразу после активации.
 *
 * @param array $args Аргументы wp_nav_menu().
 */
function my_theme_menu_fallback( $args ) {
	$link_class = ! empty( $args['link_class'] ) ? $args['link_class'] : 'nav__link';

	if ( isset( $args['theme_location'] ) && 'footer' === $args['theme_location'] ) {
		$links = array(
			'#features'         => 'Возможности',
			'#video'            => 'Видео',
			'#faq'              => 'Вопросы',
			'#contacts'         => 'Контакты',
			'./styleguide.html' => 'Styleguide',
		);
	} else {
		$links = array(
			'#features' => 'Возможности',
			'#video'    => 'Видео',
			'#faq'      => 'Вопросы',
			'#contacts' => 'Контакты',
		);
	}

	foreach ( $links as $href => $label ) {
		printf(
			'<a class="%1$s" href="%2$s">%3$s</a>',
			esc_attr( $link_class ),
			esc_attr( $href ),
			esc_html( $label )
		);
	}
}
