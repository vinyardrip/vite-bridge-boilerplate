<?php
/**
 * =================================================================================================
 * mu-plugins/block-composer/page-blocks-ajax.php
 * =================================================================================================
 *
 * AJAX-обработчик метабокса «Блоки страницы»: add | reorder | remove.
 * Все операции валидируются: nonce, права edit_post на СТРАНИЦУ, whitelist
 * типов блоков из реестра. Ответ — свежий HTML списка (rows).
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Единая точка входа admin-ajax: action = bc_page_blocks.
 */
function bc_page_blocks_ajax_handler(): void {
	check_ajax_referer( 'bc_page_blocks', 'nonce' );

	$page_id = isset( $_POST['page_id'] ) ? absint( wp_unslash( $_POST['page_id'] ) ) : 0;
	$sub     = isset( $_POST['sub'] ) ? sanitize_key( wp_unslash( $_POST['sub'] ) ) : '';

	if ( $page_id < 1 || ! current_user_can( 'edit_post', $page_id ) ) {
		wp_send_json_error( array( 'message' => __( 'Недостаточно прав.', 'block-composer' ) ) );
	}

	$ids = bc_get_page_blocks( $page_id );

	switch ( $sub ) {
		case 'add':
			$ids = bc_ajax_add( $ids );
			break;
		case 'reorder':
			$ids = bc_ajax_reorder( $ids );
			break;
		case 'remove':
			$ids = bc_ajax_remove( $ids );
			break;
		default:
			wp_send_json_error( array( 'message' => __( 'Неизвестное действие.', 'block-composer' ) ) );
	}

	if ( null === $ids ) {
		return; // Обработчик уже отправил wp_send_json_*.
	}

	bc_set_page_blocks( $page_id, $ids );

	wp_send_json_success( array( 'rows' => bc_render_page_block_rows( $page_id ) ) );
}
add_action( 'wp_ajax_bc_page_blocks', 'bc_page_blocks_ajax_handler' );

/**
 * sub=add: создать черновик блока выбранного типа и поставить в конец списка.
 *
 * @return int[]|null
 */
function bc_ajax_add( array $ids ): ?array {
	$slug  = isset( $_POST['slug'] ) ? sanitize_key( wp_unslash( $_POST['slug'] ) ) : '';
	$entry = bc_get_entry( $slug );

	if ( null === $entry ) {
		wp_send_json_error( array( 'message' => __( 'Такой тип блока не зарегистрирован.', 'block-composer' ) ) );
	}

	$block_id = wp_insert_post(
		array(
			'post_type'   => 'block',
			'post_title'  => (string) $entry['label'],
			'post_status' => 'draft',
		),
		true
	);

	if ( is_wp_error( $block_id ) ) {
		wp_send_json_error( array( 'message' => $block_id->get_error_message() ) );
	}

	wp_set_object_terms( (int) $block_id, array( $slug ), 'block_type' );

	$ids[] = (int) $block_id;

	return $ids;
}

/**
 * sub=reorder: сохранить новый порядок после drag-and-drop.
 *
 * Вход — полный JSON-список ID в новом порядке. Валидация: множество ID должно
 * совпадать с текущим списком страницы (перестановка, без добавлений/потерь) —
 * иначе откат.
 *
 * @return int[]|null
 */
function bc_ajax_reorder( array $ids ): ?array {
	$raw      = isset( $_POST['ids'] ) ? wp_unslash( $_POST['ids'] ) : '';
	$incoming = is_string( $raw ) ? json_decode( $raw, true ) : null;

	if ( ! is_array( $incoming ) ) {
		wp_send_json_error( array( 'message' => __( 'Некорректный список порядка.', 'block-composer' ) ) );
	}

	$incoming = array_values( array_unique( array_filter( array_map( 'absint', $incoming ) ) ) );

	$current_sorted  = $ids;
	$incoming_sorted = $incoming;
	sort( $current_sorted );
	sort( $incoming_sorted );

	if ( $incoming_sorted !== $current_sorted ) {
		wp_send_json_error(
			array( 'message' => __( 'Порядок не соответствует списку страницы — обновите метабокс и повторите.', 'block-composer' ) )
		);
	}

	return $incoming;
}

/**
 * sub=remove: убрать блок со страницы (запись блока не удаляется).
 *
 * @return int[]|null
 */
function bc_ajax_remove( array $ids ): ?array {
	$block_id = isset( $_POST['block_id'] ) ? absint( wp_unslash( $_POST['block_id'] ) ) : 0;
	$index    = array_search( $block_id, $ids, true );

	if ( false === $index ) {
		wp_send_json_error( array( 'message' => __( 'Блок не найден на этой странице.', 'block-composer' ) ) );
	}

	unset( $ids[ $index ] );

	return array_values( $ids );
}
