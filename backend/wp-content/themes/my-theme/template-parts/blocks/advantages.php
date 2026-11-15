<?php
/**
 * =================================================================================================
 * template-parts/blocks/advantages.php — блок «Advantages — Почему мы?»
 * =================================================================================================
 *
 * Динамическое зеркало секции из template-parts/sections/advantages.php.
 * Данные: title/subtitle/image из полей блока (cfs_next); пустые поля →
 * статика макета. Тексты пунктов 01/02/03 — fallback-статика (поля для них
 * появятся вместе с loop-типом в реестре).
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$values      = bc_get_field_values( $block_id );
$adv_title   = (string) ( $values['title'] ?? '' );
$adv_subtitle = (string) ( $values['subtitle'] ?? '' );
$image_ids   = bc_decode_relationship_ids( $values['image'] ?? null );

if ( $adv_title === '' ) {
	$adv_title = 'Почему мы?';
}
if ( $adv_subtitle === '' ) {
	$adv_subtitle = 'То, что вам нужно о нас знать';
}

$advantages_items = array(
	array( '01/', 'Клиент, который будет доволен', 'Мы хотим не просто продать наш товар, но обрести в вашем лице постоянного клиента, который будет доволен нашей работой и оставит о ней положительный отзыв для своих друзей и знакомых.' ),
	array( '02/', 'Клиент, который будет доволен', 'Мы хотим не просто продать наш товар, но обрести в вашем лице постоянного клиента, который будет доволен нашей работой и оставит о ней положительный отзыв для своих друзей и знакомых.' ),
	array( '03/', 'Клиент, который будет доволен', 'Мы хотим не просто продать наш товар, но обрести в вашем лице постоянного клиента, который будет доволен нашей работой и оставит о ней положительный отзыв для своих друзей и знакомых.' ),
);
?>

<section class="advantages">
	<div class="layout">
		<h2 class="advantages__title"><?php echo esc_html( $adv_title ); ?></h2>
		<p class="advantages__subtitle"><?php echo esc_html( $adv_subtitle ); ?></p>

		<div class="advantages__grid">
			<ol class="advantages__list">
				<?php foreach ( $advantages_items as $advantage_item ) : ?>
					<li class="advantages__item">
						<span class="advantages__num"><?php echo esc_html( $advantage_item[0] ); ?></span>
						<div class="advantages__item-body">
							<h3 class="advantages__item-title"><?php echo esc_html( $advantage_item[1] ); ?></h3>
							<p class="advantages__item-text"><?php echo esc_html( $advantage_item[2] ); ?></p>
						</div>
					</li>
				<?php endforeach; ?>
			</ol>

			<div class="advantages__collage" aria-hidden="true">
				<div class="advantages__backdrop"></div>
				<?php
				if ( $image_ids !== array() ) {
					echo bc_attachment_image( $image_ids[0], 'advantages__img advantages__img--main' ); // phpcs:ignore WordPress.Security.EscapeOutput
				} else {
					echo theme_picture( 'cnt-four-room2', array( 'alt' => '', 'imgClass' => 'advantages__img advantages__img--main' ) ); // phpcs:ignore WordPress.Security.EscapeOutput
				}

				if ( isset( $image_ids[1] ) ) {
					echo bc_attachment_image( $image_ids[1], 'advantages__img advantages__img--narrow' ); // phpcs:ignore WordPress.Security.EscapeOutput
				} else {
					echo theme_picture( 'boiler-demo', array( 'alt' => '', 'imgClass' => 'advantages__img advantages__img--narrow' ) ); // phpcs:ignore WordPress.Security.EscapeOutput
				}
				?>
				<span class="advantages__accent"></span>
			</div>
		</div>
	</div>
</section>
