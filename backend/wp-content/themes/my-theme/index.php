<?php
/**
 * =================================================================================================
 * index.php
 * =================================================================================================
 *
 * Минимальный fallback-шаблон, обязательный для активации темы в WordPress.
 *
 * !ВАЖНО: Каркас не задает разметку сайта — реальные шаблоны (front-page.php,
 * single.php, archive.php, header.php, footer.php и т.д.) добавляются по мере
 * развития проекта. WP-цикл ниже — технический минимум, чтобы тема не падала.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<main class="main">
	<?php
	if ( have_posts() ) {
		while ( have_posts() ) {
			the_post();
			the_content();
		}
	}
	?>
</main>

<?php wp_footer(); ?>
</body>
</html>
