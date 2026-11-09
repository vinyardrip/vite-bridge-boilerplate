<?php
/**
 * =================================================================================================
 * functions.php
 * =================================================================================================
 *
 * Точка входа темы. Ничего не делает сам — только подключает модули из /inc.
 * Логика разнесена по файлам по назначению:
 *
 *   inc/theme-support.php       — add_theme_support, меню, виджеты
 *   inc/enqueue-assets.php      — подключение ассетов из manifest.json (+ get_asset())
 *   inc/custom-post-types.php   — CPT и таксономии
 *   inc/helpers.php             — динамические картинки: <img> → <picture> (AVIF/WebP из uploads)
 *
 * Новую логику добавлять новым модулем в /inc и подключать его здесь.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once get_template_directory() . '/inc/theme-support.php';
require_once get_template_directory() . '/inc/enqueue-assets.php';
require_once get_template_directory() . '/inc/custom-post-types.php';
require_once get_template_directory() . '/inc/helpers.php';
