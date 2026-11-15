<?php
/**
 * =================================================================================================
 * template-parts/blocks/products-grid.php — партиал блока «Продуктовая сетка»
 * =================================================================================================
 *
 * PHP-зеркало Nunjucks-партиала partials/_products-grid.njk (docs/PLAN.md, «Стыковка»).
 * Подключается из my_theme_blocks_render_page_blocks() и видит переменные его скоупа:
 *
 *   @var int    $block_id    ID записи блока (CPT block).
 *   @var string $block_type  Slug типа блока (термин block_type).
 *   @var array  $block_entry Запись реестра [ label, icon, fields, partial ].
 *
 * Параметры блока читаются СОВРЕМЕННЫМ API cfs_next из конкретной записи блока:
 * CFS()->get( 'source', $block_id ). Значения лежат в `_cfs_fields` блока.
 *
 * Блок делает ТОЛЬКО WP_Query по своим полям и рендерит карточки через
 * product-card (стандартные хуки Woo) — цены Furniture Constructor применяются
 * сами, своими глобальными фильтрами (см. docs/PLAN.md, «Completed»).
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Скелет карточек опирается на хуки WooCommerce — без активного Woo блок не рендерится.
if ( ! class_exists( 'WooCommerce' ) ) {
	return;
}

$grid_title    = (string) ( CFS()->get( 'title', $block_id ) ?? '' );
$grid_subtitle = (string) ( CFS()->get( 'subtitle', $block_id ) ?? '' );
$grid_source   = (string) ( CFS()->get( 'source', $block_id ) ?? 'latest' );
$grid_limit    = max( 1, absint( (string) ( CFS()->get( 'limit', $block_id ) ?? 8 ) ) );

// WP_Query по источнику. `manual` — точный набор выбранных товаров (поле
// relationship manual_products): запрос по post__in, порядок выбора сохраняется.
$query_args = array(
	'post_type'           => 'product',
	'post_status'         => 'publish',
	'posts_per_page'      => $grid_limit,
	'ignore_sticky_posts' => true,
	'no_found_rows'       => true,
);

if ( 'manual' === $grid_source ) {
	$manual_ids = bc_decode_relationship_ids( CFS()->get( 'manual_products', $block_id ) );

	// Ничего не выбрано — заведомо пустой запрос (post__in=[0] не совпадет ни с чем);
	// wp_reset_postdata() на пустом запросе безопасен.
	$query_args['post__in'] = (array) ( $manual_ids !== array() ? $manual_ids : array( 0 ) );
	$query_args['orderby']  = 'post__in';
	$query_args['order']    = 'ASC';
} else {
	$query_args['orderby'] = 'date';
	$query_args['order']   = 'DESC';
	// Только товары, видимые в каталоге (стандартная практика Woo).
	$query_args['tax_query'] = array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
		array(
			'taxonomy' => 'product_visibility',
			'field'    => 'name',
			'terms'    => 'exclude-from-catalog',
			'operator' => 'NOT IN',
		),
	);
}

$grid_query = new WP_Query( $query_args );
?>

<section class="section products-grid">
	<div class="layout">

		<div class="section__head">
			<?php if ( '' !== $grid_title ) : ?>
				<h2 class="section__title"><?php echo esc_html( $grid_title ); ?></h2>
			<?php endif; ?>
			<?php if ( '' !== $grid_subtitle ) : // Zero-If: пустой подзаголовок не выводит тег. ?>
				<p class="section__descr"><?php echo esc_html( $grid_subtitle ); ?></p>
			<?php endif; ?>
		</div>

		<?php if ( $grid_query->have_posts() ) : ?>
			<ul class="products-grid__list">
				<?php
				while ( $grid_query->have_posts() ) :
					$grid_query->the_post();
					get_template_part( 'template-parts/blocks/product-card' );
				endwhile;
				?>
			</ul>
			<?php wp_reset_postdata(); ?>
		<?php else : ?>
			<p class="products-grid__empty"><?php esc_html_e( 'Товары не найдены.', 'my-theme' ); ?></p>
		<?php endif; ?>

	</div>
</section>
