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
 *   inc/assets-helpers.php      — вывод ассетов smart-assets: theme_icon()/theme_picture()
 *                                 (PHP-зеркала Nunjucks-макросов ui.icon()/ui.picture())
 *   inc/redis-config.php        — Redis: fallback-дефолты WP_REDIS_* + admin-notice диагностика
 *                                 (сами константы для object-cache инъектирует в wp-config.php
 *                                 post-start хук .ddev/config.yaml — см. docs/ENV.md)
 *   inc/utils.php               — утилиты «золотой библиотеки»: trim_spaces_phone, is_mobile
 *   inc/dates.php               — динамические даты (%date%) и умный сброс кэша (WP-Cron)
 *   inc/translit.php            — транслитерация слагов и имён файлов (Яндекс-таблица)
 *   inc/global-settings.php     — глобальные настройки CFS + плейсхолдеры %phone%/%address%/… (см. мануал р.4)
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
require_once get_template_directory() . '/inc/assets-helpers.php';
require_once get_template_directory() . '/inc/redis-config.php';
require_once get_template_directory() . '/inc/utils.php';
require_once get_template_directory() . '/inc/dates.php';
require_once get_template_directory() . '/inc/translit.php';
require_once get_template_directory() . '/inc/global-settings.php';
