<?php
/**
 * =================================================================================================
 * template-parts/blocks/how-we-work.php — блок «How we work — Как мы работаем?»
 * =================================================================================================
 *
 * Динамическое зеркало секции из template-parts/sections/how-we-work.php.
 * Данные: title/subtitle/image из полей блока; тексты шагов и чередование
 * вариантов клеток — fallback-статика макета.
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$values      = bc_get_field_values( $block_id );
$how_title   = (string) ( $values['title'] ?? '' );
$how_subtitle = (string) ( $values['subtitle'] ?? '' );
$image_ids   = bc_decode_relationship_ids( $values['image'] ?? null );

if ( $how_title === '' ) {
	$how_title = 'Как мы работаем?';
}
if ( $how_subtitle === '' ) {
	$how_subtitle = 'То, что вам нужно о нас знать';
}

$how_steps = array(
	array( 'num' => '01/', 'variant' => 'photo',      'side' => 'left' ),
	array( 'num' => '02/', 'variant' => 'dark',       'side' => 'right' ),
	array( 'num' => '03/', 'variant' => 'terracotta', 'side' => 'left' ),
	array( 'num' => '04/', 'variant' => 'photo',      'side' => 'right' ),
	array( 'num' => '05/', 'variant' => 'dark',       'side' => 'left' ),
	array( 'num' => '06/', 'variant' => 'terracotta', 'side' => 'right' ),
);

$how_text = 'Мы хотим не просто продать наш товар, но обрести в вашем лице постоянного клиента, который будет доволен нашей работой и оставит о ней положительный отзыв для своих друзей и знакомых.';
?>

<section class="how-we-work">
	<div class="layout">
		<h2 class="how-we-work__title"><?php echo esc_html( $how_title ); ?></h2>
		<p class="how-we-work__subtitle"><?php echo esc_html( $how_subtitle ); ?></p>
	</div>

	<div class="layout">
		<div class="how-we-work__grid">
			<?php foreach ( $how_steps as $how_step ) : ?>
				<div class="how-we-work__row how-we-work__row--<?php echo esc_attr( $how_step['side'] ); ?>">
					<div class="how-we-work__cell how-we-work__cell--<?php echo esc_attr( $how_step['variant'] ); ?>">
						<?php
						if ( 'photo' === $how_step['variant'] ) {
							if ( $image_ids !== array() ) {
								echo bc_attachment_image( $image_ids[0], 'how-we-work__img' ); // phpcs:ignore WordPress.Security.EscapeOutput
							} else {
								echo theme_picture( 'cnt-four-room2', array( 'alt' => 'Гостиная с диваном', 'imgClass' => 'how-we-work__img' ) ); // phpcs:ignore WordPress.Security.EscapeOutput
							}
						}
						?>
						<span class="how-we-work__num"><?php echo esc_html( $how_step['num'] ); ?></span>
						<span class="how-we-work__num-line" aria-hidden="true"></span>
					</div>
					<div class="how-we-work__cell how-we-work__cell--text">
						<h3 class="how-we-work__cell-title"><?php echo esc_html__( 'Клиент, который будет доволен', 'my-theme' ); ?></h3>
						<p class="how-we-work__cell-text"><?php echo esc_html( $how_text ); ?></p>
					</div>
				</div>
			<?php endforeach; ?>
		</div>
		<span class="how-we-work__scroll-line" aria-hidden="true"></span>
	</div>
</section>
