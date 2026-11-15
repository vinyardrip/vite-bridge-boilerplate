<?php
/**
 * =================================================================================================
 * template-parts/blocks/hero.php — блок «Hero — первый экран»
 * =================================================================================================
 *
 * Динамическое зеркало секции из template-parts/sections/hero.php (статика макета).
 * Подключается из bc_render_page_blocks(), видит переменные его скоупа:
 *
 *   @var int    $block_id    ID записи блока (CPT block).
 *   @var string $block_type  Slug типа блока (термин block_type).
 *   @var array  $block_entry Запись реестра [ label, icon, fields, partial ].
 *
 * Данные: поля блока из движка cfs_next (bc_get_field_values). Graceful fallback:
 * пустое поле → статика из макета (Zero-If). Картинка: relationship на вложение
 * медиабиблиотеки → bc_attachment_image(); пусто → theme_picture() из raw/.
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$values       = bc_get_field_values( $block_id );
$hero_title   = (string) ( $values['title'] ?? '' );
$hero_subtitle = (string) ( $values['subtitle'] ?? '' );
$image_ids    = bc_decode_relationship_ids( $values['image'] ?? null );

if ( $hero_title === '' ) {
	$hero_title = 'Каталог Grand Mebel';
}
if ( $hero_subtitle === '' ) {
	$hero_subtitle = 'топ за свои деньги';
}
?>

<section class="main-hero">
	<div class="main-hero__media">
		<?php
		if ( $image_ids !== array() ) {
			echo bc_attachment_image( $image_ids[0], 'main-hero__img', $hero_title ); // phpcs:ignore WordPress.Security.EscapeOutput -- wp_get_attachment_image экранирует атрибуты.
		} else {
			echo theme_picture( 'hero', array( 'alt' => 'Интерьер гостиной с мягкой мебелью', 'imgClass' => 'main-hero__img' ) ); // phpcs:ignore WordPress.Security.EscapeOutput
		}
		?>

		<div class="main-hero__title-box">
			<h1 class="main-hero__title"><?php echo esc_html( $hero_title ); ?></h1>
			<p class="main-hero__subtitle"><?php echo esc_html( $hero_subtitle ); ?></p>
		</div>

		<div class="main-hero__offer">
			<p class="main-hero__offer-title"><?php echo esc_html__( 'Выберите свою мебель', 'my-theme' ); ?></p>
			<p class="main-hero__offer-text"><?php echo esc_html__( 'Мебель удобная не только по цене', 'my-theme' ); ?></p>
		</div>
	</div>

	<div class="main-hero__panel">
		<div class="main-hero__nav" aria-hidden="true">
			<span class="main-hero__arrow">&larr;</span>
			<span class="main-hero__arrow">&uarr;</span>
		</div>

		<div class="main-hero__pricing">
			<p class="main-hero__pricing-label"><?php echo esc_html__( 'Цены', 'my-theme' ); ?><span class="main-hero__pricing-sep"></span><?php echo esc_html__( 'от', 'my-theme' ); ?></p>
			<p class="main-hero__price">500&thinsp;+</p>
		</div>

		<ul class="main-hero__contacts">
			<li><a href="tel:+375297774857">&#9742; <?php echo esc_html__( 'Позвонить', 'my-theme' ); ?></a></li>
			<li><a href="tel:+375297774858">A<sup>1</sup> <?php echo esc_html__( 'Позвонить', 'my-theme' ); ?></a></li>
			<li><a href="viber://chat">&#9990; Viber</a></li>
			<li><a href="#vk">&#9871; <?php echo esc_html__( 'Вконтакте', 'my-theme' ); ?></a></li>
		</ul>

		<div class="main-hero__actions">
			<a class="btn main-hero__btn" href="#catalog"><?php echo esc_html__( 'Посмотреть', 'my-theme' ); ?></a>
			<a class="main-hero__call" href="tel:+375297774857" aria-label="<?php echo esc_attr__( 'Заказать звонок', 'my-theme' ); ?>">&#9742;</a>
		</div>
	</div>
</section>
