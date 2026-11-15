<?php
/**
 * =================================================================================================
 * mu-plugins/block-composer/block-registry.php
 * =================================================================================================
 *
 * PHP-реестр доступных блоков + схема полей каждого типа блока.
 *
 * В композере доступны ТОЛЬКО явно зарегистрированные здесь блоки
 * (docs/PLAN.md, Трек A). Реестр — единственный источник правды:
 *   - админка берет из него список типов для «+ добавить»;
 *   - метабокс полей рендерит инпуты по схеме `fields`;
 *   - рендерер подключает партиал по `partial` из активной темы.
 *
 * Ключ `fields` заменяет устаревший план «field_group_id» (легаси-группы CFS):
 * после стоп-протокола схема полей живёт в коде и сохраняется современным
 * движком cfs_next в `_cfs_fields` записи блока (docs/MOCKUP_NOTES.md).
 *
 * Типы полей схемы: text | number | select | relationship (post_type, numberposts).
 *
 * Тема расширяет реестр фильтром `bc_registry` (новые типы блоков со своими
 * партиалами в template-parts/blocks/).
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Реестр блоков: slug => [ label, icon, fields, partial ].
 *
 * @return array<string, array{label: string, icon: string, fields: array<string, array{type: string, label: string, options?: array<string, string>, default?: mixed}>, partial: string}>
 */
function bc_registry(): array {
	$registry = array(
		'hero' => array(
			'label'   => 'Hero — первый экран',
			'icon'    => 'dashicons-format-image',
			'partial' => 'hero',
			'fields'  => array(
				'title'    => array(
					'type'    => 'text',
					'label'   => 'Заголовок (H1)',
					'default' => 'Каталог Grand Mebel',
				),
				'subtitle' => array(
					'type'    => 'text',
					'label'   => 'Подзаголовок',
					'default' => 'топ за свои деньги',
				),
				'image'    => array(
					'type'        => 'relationship',
					'label'       => 'Фоновое фото (медиабиблиотека)',
					'post_type'   => 'attachment',
					'post_status' => 'inherit',
					'numberposts' => 30,
					'default'     => array(),
				),
			),
		),
		'advantages' => array(
			'label'   => 'Advantages — Почему мы?',
			'icon'    => 'dashicons-editor-ol',
			'partial' => 'advantages',
			'fields'  => array(
				'title'    => array(
					'type'    => 'text',
					'label'   => 'Заголовок секции',
					'default' => 'Почему мы?',
				),
				'subtitle' => array(
					'type'    => 'text',
					'label'   => 'Подзаголовок секции',
					'default' => 'То, что вам нужно о нас знать',
				),
				'image'    => array(
					'type'        => 'relationship',
					'label'       => 'Основное фото коллажа',
					'post_type'   => 'attachment',
					'post_status' => 'inherit',
					'numberposts' => 30,
					'default'     => array(),
				),
			),
		),
		'how-we-work' => array(
			'label'   => 'How we work — Как мы работаем?',
			'icon'    => 'dashicons-list-view',
			'partial' => 'how-we-work',
			'fields'  => array(
				'title'    => array(
					'type'    => 'text',
					'label'   => 'Заголовок секции',
					'default' => 'Как мы работаем?',
				),
				'subtitle' => array(
					'type'    => 'text',
					'label'   => 'Подзаголовок секции',
					'default' => 'То, что вам нужно о нас знать',
				),
				'image'    => array(
					'type'        => 'relationship',
					'label'       => 'Фото клетки 01',
					'post_type'   => 'attachment',
					'post_status' => 'inherit',
					'numberposts' => 30,
					'default'     => array(),
				),
			),
		),
		'categories' => array(
			'label'   => 'Categories — Категории товаров',
			'icon'    => 'dashicons-grid-view',
			'partial' => 'categories',
			'fields'  => array(
				'title'    => array(
					'type'    => 'text',
					'label'   => 'Заголовок секции',
					'default' => 'Категории товаров',
				),
				'subtitle' => array(
					'type'    => 'text',
					'label'   => 'Подзаголовок секции',
					'default' => 'Найдите то, что вам нужно',
				),
				'images'   => array(
					'type'        => 'relationship',
					'label'       => 'Фото категорий (порядок = порядок карточек)',
					'post_type'   => 'attachment',
					'post_status' => 'inherit',
					'numberposts' => 30,
					'default'     => array(),
				),
			),
		),
		'products-grid' => array(
			'label'   => __( 'Продуктовая сетка', 'block-composer' ),
			'icon'    => 'dashicons-grid-view',
			'partial' => 'products-grid',
			'fields'  => array(
				'title'    => array(
					'type'  => 'text',
					'label' => __( 'Заголовок', 'block-composer' ),
				),
				'subtitle' => array(
					'type'  => 'text',
					'label' => __( 'Подзаголовок', 'block-composer' ),
				),
				'source'   => array(
					'type'    => 'select',
					'label'   => __( 'Источник товаров', 'block-composer' ),
					'options' => array(
						'latest' => __( 'Новые поступления (каталог по дате)', 'block-composer' ),
						'manual' => __( 'Выбранные вручную (поле manual_products)', 'block-composer' ),
					),
					'default' => 'latest',
				),
				'limit'    => array(
					'type'    => 'number',
					'label'   => __( 'Количество карточек', 'block-composer' ),
					'default' => 8,
				),
				'manual_products' => array(
					'type'    => 'relationship',
					'label'   => __( 'Товары для source=manual', 'block-composer' ),
					// Схема relationship: целевые посты и лимит выборки в админ-селекте.
					// Значение — карта {m0: id, m1: id} (см. bc_encode_relationship_ids).
					'post_type' => 'product',
					'numberposts' => 100,
					'default' => array(),
				),
			),
		),
	);

	/**
	 * Расширение реестра блоков (новые типы добавляются фильтром).
	 *
	 * @param array<string, array> $registry slug => [ label, icon, fields, partial ].
	 */
	return (array) apply_filters( 'bc_registry', $registry );
}

/**
 * Запись реестра по slug-у типа блока.
 *
 * @param string $slug Slug термина таксономии block_type.
 * @return array|null null — блок не зарегистрирован в реестре (в композере не доступен).
 */
function bc_get_entry( string $slug ): ?array {
	$registry = bc_registry();
	return $registry[ $slug ] ?? null;
}
