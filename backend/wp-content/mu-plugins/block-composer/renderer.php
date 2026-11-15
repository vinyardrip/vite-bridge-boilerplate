<?php
/**
 * =================================================================================================
 * mu-plugins/block-composer/renderer.php
 * =================================================================================================
 *
 * Ядро рендеринга Конструктора.
 *
 *   bc_render_page_blocks( $page_id ) — читает `_page_blocks` (массив ID),
 *   для каждого блока определяет тип (термин block_type), берет запись реестра
 *   и подключает PHP-партиал АКТИВНОЙ ТЕМЫ template-parts/blocks/<partial>.php.
 *
 *   Перехват вывода: страница с непустым `_page_blocks` рендерится через
 *   template-constructor.php темы (фильтр template_include), даже если в
 *   редакторе остался дефолтный шаблон.
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Рендер всех блоков страницы в порядке их следования в `_page_blocks`.
 */
function bc_render_page_blocks( int $page_id ): void {
	foreach ( bc_get_page_blocks( $page_id ) as $block_id ) {
		$block = get_post( $block_id );

		if ( ! $block instanceof WP_Post || 'block' !== $block->post_type ) {
			continue;
		}

		// Публикуемые блоки видны всем; черновики — только тем, кто может их править.
		$visible = 'publish' === $block->post_status
			|| ( 'draft' === $block->post_status && current_user_can( 'edit_post', $block_id ) );
		if ( ! $visible ) {
			continue;
		}

		$slug  = bc_get_type_slug( $block_id );
		$entry = bc_get_entry( $slug );
		if ( null === $entry ) {
			continue; // Тип не зарегистрирован в реестре — блок не рендерится.
		}

		$template = get_theme_file_path( 'template-parts/blocks/' . (string) $entry['partial'] . '.php' );
		if ( ! is_string( $template ) || ! is_readable( $template ) ) {
			continue;
		}

		// Переменные для партиала (партиал подключается include'ом и видит этот скоуп).
		$block_type  = $slug;
		$block_entry = $entry;

		include $template;
	}
}

/**
 * HTML картинки вложения медиабиблиотеки для блоков (runtime-конвейер uploads).
 *
 * @param int    $attachment_id ID вложения.
 * @param string $class         CSS-класс img.
 * @param string $alt           Alt-текст.
 * @return string
 */
function bc_attachment_image( int $attachment_id, string $class = '', string $alt = '' ): string {
	if ( $attachment_id < 1 ) {
		return '';
	}

	return (string) wp_get_attachment_image(
		$attachment_id,
		'full',
		false,
		array( 'class' => $class, 'alt' => $alt )
	);
}

/**
 * Перехват вывода: страница с блоками рендерится каркасом Конструктора.
 */
function bc_maybe_override_template( string $template ): string {
	if ( ! is_singular( 'page' ) ) {
		return $template;
	}

	$page_id = (int) get_queried_object_id();
	if ( $page_id < 1 || array() === bc_get_page_blocks( $page_id ) ) {
		return $template;
	}

	$constructor = get_theme_file_path( 'template-constructor.php' );

	return is_readable( $constructor ) ? $constructor : $template;
}
add_filter( 'template_include', 'bc_maybe_override_template', 20 );
