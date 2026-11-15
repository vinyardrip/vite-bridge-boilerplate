<?php
/**
 * =================================================================================================
 * inc/redis-config.php
 * =================================================================================================
 *
 * Redis (объектный кэш) — диагностика и fallback-дефолты.
 *
 * ГЛАВНОЕ, ЧТО НУЖНО ЗНАТЬ: константы WP_REDIS_HOST / WP_REDIS_PORT должны быть
 * определены ДО загрузки object-cache.php (drop-in читает их при подключении),
 * а drop-in стартует в wp-settings.php РАНЬШЕ темы. Поэтому ТЕМА эти константы
 * для кэша не определяет — было бы бесполезно. Механизм настройки:
 *
 *   1. post-start хук `.ddev/config.yaml` (идёт в шаблоне) после каждого
 *      `ddev start` инъектирует define() в backend/wp-config.php, если их нет.
 *   2. Рецепт включения Redis (аддон redis, плагин redis-cache) — docs/ENV.md.
 *
 * Этот модуль делает остальное:
 *   - fallback-дефолты для кода, читающего WP_REDIS_* ПОСЛЕ загрузки темы
 *     (ddev → сервис `redis`, прод → 127.0.0.1);
 *   - admin-notice: если drop-in object-cache.php установлен, а в wp-config.php
 *     констант нет (хук не отработал / wp-config пересоздан) — подсказка с
 *     ссылкой на рецепт; выводится только администраторам.
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Fallback-дефолты для поздних читателей констант.
 * Для самого object-cache это уже не играет роли (см. шапку файла).
 */
function my_theme_redis_defaults(): void {
	if ( getenv( 'IS_DDEV_PROJECT' ) === 'true' ) {
		if ( ! defined( 'WP_REDIS_HOST' ) ) {
			define( 'WP_REDIS_HOST', 'redis' );
		}
	} elseif ( ! defined( 'WP_REDIS_HOST' ) ) {
		define( 'WP_REDIS_HOST', '127.0.0.1' );
	}

	if ( ! defined( 'WP_REDIS_PORT' ) ) {
		define( 'WP_REDIS_PORT', 6379 );
	}
}
my_theme_redis_defaults();

/**
 * Диагностика: drop-in есть, констант в wp-config.php нет → notice админу.
 */
function my_theme_redis_admin_notice(): void {
	if ( ! is_admin() || ! current_user_can( 'manage_options' ) ) {
		return;
	}

	if ( ! getenv( 'IS_DDEV_PROJECT' ) ) {
		return; // Прод-окружение настраивается вручную, без подсказок.
	}

	$drop_in = ABSPATH . 'object-cache.php';
	if ( ! file_exists( $drop_in ) ) {
		return; // Redis ещё не включен — notice не нужен.
	}

	$wp_config = ABSPATH . 'wp-config.php';
	if ( ! is_readable( $wp_config ) ) {
		return;
	}

	$contents = (string) file_get_contents( $wp_config ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- разовая диагностика.
	if ( str_contains( $contents, 'WP_REDIS_HOST' ) ) {
		return; // Константы на месте — все хорошо.
	}

	printf(
		'<div class="notice notice-warning"><p><strong>%1$s</strong> %2$s <code>%3$s</code> %4$s</p></div>',
		esc_html__( 'Redis object cache:', 'my-theme' ),
		esc_html__( 'drop-in установлен, но в', 'my-theme' ),
		esc_html( 'backend/wp-config.php' ),
		esc_html__( 'нет WP_REDIS_HOST/PORT — Redis не подключится. Пост-старт-хук .ddev/config.yaml должен был их добавить: сделайте `ddev start` ещё раз и проверьте рецепт в docs/ENV.md (раздел Redis).', 'my-theme' )
	);
}
add_action( 'admin_notices', 'my_theme_redis_admin_notice' );
