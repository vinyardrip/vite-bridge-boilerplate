<?php
/**
 * =================================================================================================
 * mu-plugins/block-composer/block-fields-metabox.php
 * =================================================================================================
 *
 * Метабокс полей на редактировании блока (CPT `block`).
 *
 * Инпуты рендерятся по СХЕМЕ из реестра (тип блока = первый термин block_type),
 * значения читаются/пишутся современным движком cfs_next:
 *   - чтение:  CFS()->get( null, $block_id ) — всё JSON-дерево из `_cfs_fields`;
 *   - запись:  CFS()->engine()->save( $block_id, $values ) — JSON в мета записи.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Slug типа блока (первый термин block_type).
 */
function bc_get_type_slug( int $block_id ): string {
	$terms = get_the_terms( $block_id, 'block_type' );
	if ( ! is_array( $terms ) || array() === $terms ) {
		return '';
	}
	return (string) $terms[0]->slug;
}

/**
 * Значения полей блока из современного движка cfs_next.
 *
 * @return array<string, mixed>
 */
function bc_get_field_values( int $block_id ): array {
	// cfs_next не активен (шаблон без движка полей) — значения пусты,
	// партиалы рендерят fallback-статику из макета (Zero-If).
	if ( ! function_exists( 'CFS' ) ) {
		return array();
	}

	$values = CFS()->get( null, $block_id );
	return is_array( $values ) ? $values : array();
}

/**
 * Метабокс «Поля блока».
 */
function bc_add_fields_metabox(): void {
	add_meta_box(
		'bc-block-fields',
		__( 'Поля блока', 'block-composer' ),
		'bc_render_fields_metabox',
		'block',
		'normal',
		'high'
	);
}
add_action( 'add_meta_boxes', 'bc_add_fields_metabox' );

/**
 * Рендер метабокса: инпуты по схеме реестра.
 *
 * @param WP_Post $post Редактируемый блок.
 */
function bc_render_fields_metabox( WP_Post $post ): void {
	wp_nonce_field( 'bc_block_fields', 'bc_block_fields_nonce' );

	$slug  = bc_get_type_slug( (int) $post->ID );
	$entry = '' !== $slug ? bc_get_entry( $slug ) : null;

	if ( null === $entry ) {
		printf(
			'<p>%s</p>',
			esc_html__( 'Тип блока не выбран. Укажите термин в таксономии «Тип блока» — схема полей появится автоматически.', 'block-composer' )
		);
		return;
	}

	printf(
		'<p class="description">%s <strong>%s</strong></p>',
		esc_html__( 'Тип блока:', 'block-composer' ),
		esc_html( (string) $entry['label'] )
	);

	$values = bc_get_field_values( (int) $post->ID );

	echo '<table class="form-table" role="presentation">';
	foreach ( $entry['fields'] as $name => $schema ) {
		$value = $values[ $name ] ?? ( $schema['default'] ?? '' );
		printf( '<tr><th scope="row"><label for="bc-block-field-%1$s">%2$s</label></th><td>', esc_attr( (string) $name ), esc_html( (string) $schema['label'] ) );

		switch ( $schema['type'] ) {
			case 'select':
				printf( '<select id="bc-block-field-%1$s" name="bc_block_fields[%1$s]">', esc_attr( (string) $name ) );
				foreach ( (array) ( $schema['options'] ?? array() ) as $option_value => $option_label ) {
					printf(
						'<option value="%1$s"%2$s>%3$s</option>',
						esc_attr( (string) $option_value ),
						selected( (string) $value, (string) $option_value, false ),
						esc_html( (string) $option_label )
					);
				}
				echo '</select>';
				break;

			case 'number':
				printf(
					'<input type="number" id="bc-block-field-%1$s" name="bc_block_fields[%1$s]" value="%2$s" min="1" max="100" class="small-text" />',
					esc_attr( (string) $name ),
					esc_attr( (string) $value )
				);
				break;

			case 'relationship':
				printf( '<select multiple size="6" id="bc-block-field-%1$s" name="bc_block_fields[%1$s][]">', esc_attr( (string) $name ) );
				foreach ( bc_relationship_options( (array) $schema ) as $option_id => $option_label ) {
					printf(
						'<option value="%1$s"%2$s>%3$s</option>',
						esc_attr( (string) $option_id ),
						in_array( (int) $option_id, array_map( 'intval', (array) $value ), true ) ? ' selected' : '',
						esc_html( (string) $option_label )
					);
				}
				echo '</select>';
				echo '<p class="description">' . esc_html__( 'Множественный выбор (Ctrl/Cmd+клик). Порядок выбранных товаров сохраняется в выводе.', 'block-composer' ) . '</p>';
				break;

			case 'text':
			default:
				printf(
					'<input type="text" id="bc-block-field-%1$s" name="bc_block_fields[%1$s]" value="%2$s" class="regular-text" />',
					esc_attr( (string) $name ),
					esc_attr( (string) $value )
				);
				break;
		}

		echo '</td></tr>';
	}
	echo '</table>';
}

/**
 * Варианты relationship-поля (схема: post_type, numberposts).
 *
 * @return array<int, string> ID поста => подпись «#ID Заголовок».
 */
function bc_relationship_options( array $schema ): array {
	$posts = get_posts(
		array(
			'post_type'        => (string) ( $schema['post_type'] ?? 'product' ),
			// attachments живут в статусе inherit — постстатус берем из схемы.
			'post_status'      => (string) ( $schema['post_status'] ?? 'publish' ),
			'numberposts'      => (int) ( $schema['numberposts'] ?? 100 ),
			'orderby'          => 'title',
			'order'            => 'ASC',
			'suppress_filters' => false,
		)
	);

	$options = array();
	foreach ( $posts as $post ) {
		$options[ (int) $post->ID ] = sprintf( '#%d %s', (int) $post->ID, (string) $post->post_title );
	}

	return $options;
}

/**
 * Конвенция хранения relationship в современном движке cfs_next.
 *
 * Движок канонизирует list-массивы как строки репитеров и ОТБРАСЫВАЕТ
 * скалярные элементы (normalizeRows в engine.php): плоский список ID
 * [656045, 656046] сохранялся бы пустым. Поэтому список хранится
 * индексированной картой {m0: 656045, m1: 656046} — sanitize_key пропускает
 * ключи, порядок выбора сохраняется (docs/MOCKUP_NOTES.md, раздел 0).
 *
 * @param int[] $ids Список ID постов.
 * @return array<string, int> Карта m<N> => ID.
 */
function bc_encode_relationship_ids( array $ids ): array {
	$ids = array_values( array_unique( array_filter( array_map( 'absint', $ids ) ) ) );

	$encoded = array();
	foreach ( $ids as $index => $id ) {
		$encoded[ 'm' . $index ] = $id;
	}

	return $encoded;
}

/**
 * Обратное преобразование: карта из движка → упорядоченный список ID.
 *
 * @param mixed $value Значение из движка (карта m<N> => ID или список).
 * @return int[]
 */
function bc_decode_relationship_ids( $value ): array {
	$ids = is_array( $value ) ? $value : array();

	return array_values( array_unique( array_filter( array_map( 'absint', $ids ) ) ) );
}

/**
 * Сохранение значений полей блока через современный движок cfs_next.
 *
 * @param int $post_id ID блока.
 */
function bc_save_fields( int $post_id ): void {
	if ( ! isset( $_POST['bc_block_fields_nonce'] )
		|| ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['bc_block_fields_nonce'] ) ), 'bc_block_fields' )
	) {
		return;
	}

	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}

	$slug  = bc_get_type_slug( $post_id );
	$entry = bc_get_entry( $slug );
	if ( null === $entry ) {
		return; // Тип не определён — сохранять нечего (схемы нет).
	}

	// Без движка cfs_next значения полей хранить негде — молча выходим
	// (метабокс в этом случае работает только на чтение fallback-статики).
	if ( ! function_exists( 'CFS' ) ) {
		return;
	}

	$raw    = isset( $_POST['bc_block_fields'] ) && is_array( $_POST['bc_block_fields'] )
		? wp_unslash( $_POST['bc_block_fields'] ) // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- посимвольная санация ниже, по схеме.
		: array();
	$values = array();

	foreach ( $entry['fields'] as $name => $schema ) {
		$value = isset( $raw[ $name ] ) ? $raw[ $name ] : null;

		switch ( $schema['type'] ) {
			case 'number':
				$values[ $name ] = max( 1, absint( (string) $value ) );
				break;

			case 'select':
				$allowed = array_map( 'strval', array_keys( (array) ( $schema['options'] ?? array() ) ) );
				$chosen  = is_string( $value ) ? $value : '';
				$values[ $name ] = in_array( $chosen, $allowed, true ) ? $chosen : (string) ( $schema['default'] ?? '' );
				break;

			case 'relationship':
				// Конвенция движка: list-массивы отбрасываются — храним картой
				// {m0: id, m1: id} (см. bc_encode_relationship_ids()).
				$values[ $name ] = bc_encode_relationship_ids(
					is_array( $value ) ? $value : array()
				);
				break;

			case 'text':
			default:
				$values[ $name ] = sanitize_text_field( is_scalar( $value ) ? (string) $value : '' );
				break;
		}
	}

	// Современный движок cfs_next: JSON в мета `_cfs_fields` записи блока.
	CFS()->engine()->save( $post_id, $values );
}
add_action( 'save_post_block', 'bc_save_fields' );
