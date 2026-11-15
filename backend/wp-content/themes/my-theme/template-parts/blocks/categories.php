<?php
/**
 * =================================================================================================
 * template-parts/blocks/categories.php — блок «Categories — Категории товаров»
 * =================================================================================================
 *
 * Динамическое зеркало секции из template-parts/sections/categories.php.
 * Данные: title/subtitle/images (relationship-список вложений) из полей блока.
 * Порядок выбранных картинок = порядок карточек; недостающие карточки
 * рендерятся на fallback-статике из raw/ (theme_picture).
 * В перспективе карточки — термины product_cat (WP_Query) — см. MOCKUP_NOTES.
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$values         = bc_get_field_values( $block_id );
$cat_title      = (string) ( $values['title'] ?? '' );
$cat_subtitle   = (string) ( $values['subtitle'] ?? '' );
$category_image_ids = bc_decode_relationship_ids( $values['images'] ?? null );

if ( $cat_title === '' ) {
	$cat_title = 'Категории товаров';
}
if ( $cat_subtitle === '' ) {
	$cat_subtitle = 'Найдите то, что вам нужно';
}

$categories_items = array(
	array( 'title' => 'Кухни',            'mod' => 'kitchens',   'fallback' => 'cnt-four-room2', 'alt' => 'Кухня со столовой группой' ),
	array( 'title' => 'Корпусная мебель', 'mod' => 'cases',      'fallback' => 'boiler-demo',    'alt' => 'Стеллаж корпусной мебели' ),
	array( 'title' => 'Мягкая мебель',    'mod' => 'soft',       'fallback' => 'test-process',   'alt' => 'Диван в гостиной' ),
	array( 'title' => 'Матрацы',          'mod' => 'mattresses', 'fallback' => 'hero',           'alt' => 'Спальня с матрасом' ),
);
?>

<section class="categories">
	<div class="layout">
		<h2 class="categories__title"><?php echo esc_html( $cat_title ); ?></h2>
		<p class="categories__subtitle"><?php echo esc_html( $cat_subtitle ); ?></p>
	</div>

	<div class="categories__band" aria-hidden="true"></div>

	<div class="layout categories__grid">
		<span class="categories__accent categories__accent--1" aria-hidden="true"></span>
		<span class="categories__accent categories__accent--2" aria-hidden="true"></span>
		<span class="categories__accent categories__accent--3" aria-hidden="true"></span>

		<?php foreach ( $categories_items as $index => $categories_item ) : ?>
			<a class="cat-card cat-card--<?php echo esc_attr( $categories_item['mod'] ); ?>" href="#<?php echo esc_attr( $categories_item['mod'] ); ?>">
				<div class="cat-card__media">
					<?php
					if ( isset( $category_image_ids[ $index ] ) ) {
						echo bc_attachment_image( $category_image_ids[ $index ], 'cat-card__img', $categories_item['title'] ); // phpcs:ignore WordPress.Security.EscapeOutput
					} else {
						echo theme_picture(
							$categories_item['fallback'],
							array(
								'alt'      => $categories_item['alt'],
								'imgClass' => 'cat-card__img',
								'loading'  => 'lazy',
							)
						); // phpcs:ignore WordPress.Security.EscapeOutput
					}
					?>
				</div>
				<span class="cat-card__caption"><?php echo esc_html( $categories_item['title'] ); ?></span>
			</a>
		<?php endforeach; ?>
	</div>
</section>
