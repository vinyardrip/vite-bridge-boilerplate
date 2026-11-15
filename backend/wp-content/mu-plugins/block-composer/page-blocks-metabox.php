<?php
/**
 * =================================================================================================
 * mu-plugins/block-composer/page-blocks-metabox.php
 * =================================================================================================
 *
 * Метабокс «Блоки страницы» (`_page_blocks`) на обычных страницах.
 *
 * Хранение: метаполе `_page_blocks` записи page — JSON-массив ID блоков
 * (правило проекта: никаких serialize(), только JSON).
 *
 * UI: список блоков с drag-and-drop порядком (SortableJS, рукоятка), кнопка
 * «×» (убрать) и «+ добавить» (селект типа из реестра). Все действия — через
 * admin-ajax (sub: add|reorder|remove), без вложенных форм внутри формы
 * редактирования страницы.
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Прочитать список блоков страницы.
 *
 * @return int[] Упорядоченный список ID блоков.
 */
function bc_get_page_blocks( int $page_id ): array {
	$raw = get_post_meta( $page_id, '_page_blocks', true );

	if ( ! is_string( $raw ) || '' === $raw ) {
		return array();
	}

	$decoded = json_decode( $raw, true );
	if ( ! is_array( $decoded ) ) {
		return array();
	}

	return array_values( array_filter( array_map( 'absint', $decoded ) ) );
}

/**
 * Сохранить список блоков страницы (JSON в мету).
 *
 * Санитизация: нечисловой мусор отбрасывается, ID приводятся к int, дубли
 * схлопываются, несуществующие (или удалённые/чужого типа) ID не сохраняются.
 *
 * @param int[] $ids Упорядоченный список ID блоков.
 */
function bc_set_page_blocks( int $page_id, array $ids ): void {
	$ids = array_values( array_unique( array_filter( array_map( 'absint', $ids ) ) ) );

	$existing = array();
	foreach ( $ids as $id ) {
		if ( 'block' === get_post_type( $id ) ) {
			$existing[] = $id;
		}
	}

	update_post_meta( $page_id, '_page_blocks', wp_json_encode( $existing ) );
	clean_post_cache( $page_id );
}

/**
 * HTML одной строки списка блоков (используется метабоксом и AJAX-ответами).
 */
function bc_render_page_block_row( int $page_id, int $block_id ): string {
	$block = get_post( $block_id );
	if ( ! $block instanceof WP_Post || 'block' !== $block->post_type ) {
		return '';
	}

	$slug  = bc_get_type_slug( $block_id );
	$entry = bc_get_entry( $slug );

	$edit_link = get_edit_post_link( $block_id, 'raw' );
	$title     = '' !== $block->post_title ? $block->post_title : __( '(без названия)', 'block-composer' );
	$status    = 'publish' === $block->post_status ? '' : ' [' . esc_html__( 'черновик', 'block-composer' ) . ']';

	$row  = '<li class="bc-pb-row" data-bc-pb-block="' . absint( $block_id ) . '">';
	$row .= '<span class="bc-pb-row__title">';
	$row .= null !== $edit_link
		? '<a href="' . esc_url( $edit_link ) . '">#' . absint( $block_id ) . ' ' . esc_html( (string) $title ) . '</a>'
		: '#' . absint( $block_id ) . ' ' . esc_html( (string) $title );
	$row .= esc_html( $status );
	$row .= null !== $entry ? ' <em>— ' . esc_html( (string) $entry['label'] ) . '</em>' : '';
	$row .= '</span>';
	$row .= '<span class="bc-pb-row__actions">';
	$row .= '<span class="bc-pb-row__handle dashicons dashicons-menu" title="' . esc_attr__( 'Перетащить, чтобы изменить порядок', 'block-composer' ) . '" aria-label="' . esc_attr__( 'Перетащить, чтобы изменить порядок', 'block-composer' ) . '"></span> ';
	$row .= '<button type="button" class="button button-small" data-bc-pb="remove" title="' . esc_attr__( 'Убрать со страницы', 'block-composer' ) . '">&times;</button>';
	$row .= '</span>';
	$row .= '</li>';

	return $row;
}

/**
 * HTML всего списка блоков страницы.
 */
function bc_render_page_block_rows( int $page_id ): string {
	$rows = '';
	foreach ( bc_get_page_blocks( $page_id ) as $block_id ) {
		$rows .= bc_render_page_block_row( $page_id, $block_id );
	}
	return '<ul class="bc-pb-rows" id="bc-page-blocks-rows">' . $rows . '</ul>';
}

/**
 * Метабокс «Блоки страницы».
 */
function bc_add_page_blocks_metabox(): void {
	add_meta_box(
		'bc-page-blocks',
		__( 'Блоки страницы', 'block-composer' ),
		'bc_render_page_blocks_metabox',
		'page',
		'normal',
		'high'
	);
}
add_action( 'add_meta_boxes', 'bc_add_page_blocks_metabox' );

/**
 * Рендер метабокса: список + управление порядком + добавление блока.
 */
function bc_render_page_blocks_metabox( WP_Post $post ): void {
	$page_id = (int) $post->ID;

	// Разметка строк собрана нашими билдерами: весь пользовательский контент
	// (заголовки блоков, названия типов, ссылки редактирования) уже экранирован
	// esc_html/esc_attr/esc_url внутри bc_render_page_block_row(). Финальный
	// wp_kses_post здесь НЕ применяется — он вырезает <li> (нет в allowlist
	// постов, проверено wp eval) и ломает список.
	echo bc_render_page_block_rows( $page_id ); // phpcs:ignore WordPress.Security.EscapeOutput -- см. комментарий выше.
	echo '<p class="bc-pb-add">';
	echo '<select id="bc-pb-slug">';
	foreach ( bc_registry() as $slug => $entry ) {
		printf( '<option value="%1$s">%2$s</option>', esc_attr( (string) $slug ), esc_html( (string) $entry['label'] ) );
	}
	echo '</select> ';
	printf(
		'<button type="button" class="button button-primary button-small" data-bc-pb="add">%s</button>',
		esc_html__( '+ добавить блок', 'block-composer' )
	);
	echo '</p>';
	echo '<p class="description">' . esc_html__( 'Добавление создаёт черновик блока и ставит его в конец списка. Порядок — перетаскиванием за иконку меню.', 'block-composer' ) . '</p>';
}

/**
 * Подключение inline-JS управления метабоксом (только экраны редактирования страниц).
 */
function bc_enqueue_page_blocks_assets( string $hook_suffix ): void {
	$is_post_screen = in_array( $hook_suffix, array( 'post.php', 'post-new.php' ), true );

	if ( ! $is_post_screen ) {
		return;
	}

	if ( 'page' !== get_post_type() ) {
		return;
	}

	$config = array(
		'ajaxUrl' => admin_url( 'admin-ajax.php' ),
		'nonce'   => wp_create_nonce( 'bc_page_blocks' ),
		'pageId'  => isset( $_GET['post'] ) ? absint( wp_unslash( $_GET['post'] ) ) : 0, // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- чтение для конфига UI.
	);

	$js = 'window.bcPageBlocks = ' . wp_json_encode( $config ) . ';'
		. (string) file_get_contents( __DIR__ . '/admin-page-blocks.js' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- локальный файл плагина.

	// Drag-to-reorder списка блоков. SortableJS c CDN; inline-скрипт объявляет
	// зависимость и деградирует без него (список просто не перетаскивается).
	wp_enqueue_script(
		'sortablejs',
		'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js',
		array(),
		'1.15.6',
		true
	);

	wp_register_script( 'bc-page-blocks', false, array( 'sortablejs' ), '1.0.0', true );
	wp_enqueue_script( 'bc-page-blocks' );
	wp_add_inline_script( 'bc-page-blocks', $js );
}
add_action( 'admin_enqueue_scripts', 'bc_enqueue_page_blocks_assets' );
