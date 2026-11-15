<?php
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Универсальные настройки Redis Object Cache (DDEV + Prod)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Файл — часть шаблона, переезжает в новый проект вместе с репозиторием.
 * Подключается из backend/wp-config.php ОДНОЙ строкой (добавляет post-start
 * хук .ddev/config.yaml, т.к. ddev перегенерирует wp-config.php при каждом
 * старте и вытер бы сам блок):
 *
 *   require_once __DIR__ . '/wp-redis-config.php';
 *
 * На проде (без ddev) — добавить ту же строку в wp-config.php руками.
 * ВАЖНО: подключение должно быть РАНЬШЕ wp-settings.php — то есть в самом
 * wp-config.php; константы читает object-cache.php drop-in при загрузке.
 *
 * Рецепт включения Redis в окружении — docs/ENV.md (раздел Redis).
 */

// Гварды: файл может быть подключён несколько раз (wp-config + ручные
// подключения) — повторный define() в PHP 8 кидает Warning/Fatal.
if ( ! defined( 'WP_REDIS_CLIENT' ) ) {
	define( 'WP_REDIS_CLIENT', 'phpredis' );
}
if ( ! defined( 'WP_REDIS_GRACEFUL' ) ) {
	define( 'WP_REDIS_GRACEFUL', true );        // Переключение на MySQL при сбое.
}
if ( ! defined( 'WP_REDIS_TIMEOUT' ) ) {
	define( 'WP_REDIS_TIMEOUT', 1 );
}
if ( ! defined( 'WP_REDIS_READ_TIMEOUT' ) ) {
	define( 'WP_REDIS_READ_TIMEOUT', 1 );
}
if ( ! defined( 'WP_REDIS_DISABLE_BANNERS' ) ) {
	define( 'WP_REDIS_DISABLE_BANNERS', true );
}

// Умное определение хоста.
if ( getenv( 'IS_DDEV_PROJECT' ) == 'true' ) {
	if ( ! defined( 'WP_REDIS_HOST' ) ) {
		define( 'WP_REDIS_HOST', 'redis' );
	}
} else {
	if ( ! defined( 'WP_REDIS_HOST' ) ) {
		define( 'WP_REDIS_HOST', '127.0.0.1' );
	}
}
if ( ! defined( 'WP_REDIS_PORT' ) ) {
	define( 'WP_REDIS_PORT', 6379 );
}
