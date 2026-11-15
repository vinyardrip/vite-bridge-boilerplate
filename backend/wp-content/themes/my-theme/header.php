<?php
/**
 * =================================================================================================
 * header.php
 * =================================================================================================
 *
 * Шапка сайта — порт frontend/src/views/layouts/_default.njk и partials/_header.njk.
 * Открывает HTML-документ и контейнер .site-container (закрывается в footer.php).
 *
 * Отличия от статического макета:
 *   - <title> выводит WordPress (add_theme_support( 'title-tag' ));
 *   - CSS/JS подключаются через inc/enqueue-assets.php из wp_head()
 *     (dev-режим Vite и manifest.json — там же);
 *   - OG/Twitter-мета (_meta-social.njk) не портируются: в WordPress их
 *     отдает SEO-плагин (Yoast, Rank Math и т.п.);
 *   - меню выводится wp_nav_menu(); классы ссылок и fallback-разметка —
 *     в inc/theme-support.php.
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
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="description" content="<?php echo esc_attr( get_bloginfo( 'description' ) ); ?>">

	<?php
	// Фавиконки генерируются из frontend/public/favicon.svg (pnpm favicons:generate,
	// выполняется автоматически перед каждой сборкой). При build:wp ассеты
	// собираются прямо в assets/ темы ПЛОСКО: иконки лежат в assets/favicons/
	// (плагин wp-flatten-favicons в vite.config.ts убирает вложенность assets/assets).
	?>
	<link rel="icon" href="<?php echo esc_url( get_template_directory_uri() . '/assets/favicons/favicon.ico' ); ?>" sizes="any">
	<link rel="icon" href="<?php echo esc_url( get_template_directory_uri() . '/assets/favicons/favicon.svg' ); ?>" type="image/svg+xml">
	<link rel="apple-touch-icon" href="<?php echo esc_url( get_template_directory_uri() . '/assets/favicons/apple-touch-icon-180x180.png' ); ?>">

	<?php wp_head(); ?>
</head>
<body <?php body_class( is_front_page() ? 'main-page' : 'page__body' ); ?>>
<?php wp_body_open(); ?>

<?php
// Инлайновый SVG-спрайт (partials/_sprite-inline.njk): сюда вручную
// добавляются многоцветные иконки, управляемые CSS-переменными.
?>
<svg xmlns="http://www.w3.org/2000/svg" style="display: none;"></svg>

<div class="site-container">

	<header class="header">
		<div class="container">
			<div class="layout">
				<div class="header-wrap">
					<a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="logo">
						<div class="logo-wrap">
							<div class="logo__name">LOGO</div>
							<div class="logo__descr">Description</div>
						</div>
					</a>

					<div class="menu">
						<button class="menu__btn" type="button" aria-label="Открыть меню" aria-expanded="false">
							<span aria-hidden="true"></span>
						</button>
						<nav class="nav">
							<?php
							wp_nav_menu(
								array(
									'theme_location' => 'primary',
									'container'      => false,
									'menu_class'     => '',
									'items_wrap'     => '%3$s',
									'fallback_cb'    => 'my_theme_menu_fallback',
									'walker'         => new My_Theme_Anchor_Walker(),
									'depth'          => 1,
									'link_class'     => 'nav__link',
								)
							);
							?>
						</nav>
					</div>
				</div>
			</div>
		</div>
	</header>
