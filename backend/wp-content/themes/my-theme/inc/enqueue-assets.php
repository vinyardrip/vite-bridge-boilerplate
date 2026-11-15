<?php
/**
 * =================================================================================================
 * inc/enqueue-assets.php
 * =================================================================================================
 *
 * Подключение фронтенд-ассетов, собранных Vite.
 *
 * Production: читает manifest.json (см. build.manifest в vite.config.js), который
 * sync:theme кладет в <тема>/assets/manifest.json вместе с собранными файлами.
 * Все имена файлов содержат хеш, поэтому браузерное кеширование работает корректно.
 *
 * Development: если манифеста нет, скрипты и стили подключаются напрямую
 * с dev-сервера Vite (http://localhost:5173) — работает связка с `pnpm dev`
 * и HMR-клиентом из layouts/_default.njk.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Возвращает URL ассета по ключу точки входа.
 *
 * Production: путь из manifest.json на домене темы.
 * Development: адрес того же файла на dev-сервере Vite.
 *
 * @param string $entry Ключ точки входа, например 'frontend/src/js/app.ts'.
 *
 * @return string URL ассета или '' (с записью в error_log), если ассет не найден.
 */
function get_asset( $entry ) {
	static $manifest = null;
	$manifest_path = get_template_directory() . '/assets/manifest.json';

	if ( $manifest === null ) {
		if ( ! file_exists( $manifest_path ) ) {
			// $entry уже содержит полный путь от корня проекта
			// ('frontend/src/js/app.ts'), поэтому дописываем только домен.
			$dev_server_url = 'http://localhost:5173';
			return $dev_server_url . '/' . $entry;
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$manifest = json_decode( file_get_contents( $manifest_path ), true );
	}

	if ( isset( $manifest[ $entry ]['file'] ) ) {
		return get_template_directory_uri() . '/assets/' . $manifest[ $entry ]['file'];
	}

	// translators: %s — ключ точки входа, который не найден в манифесте.
	error_log( sprintf( __( 'Asset not found in manifest.json: %s' ), $entry ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
	return '';
}

/**
 * Подключает CSS и JS темы.
 *
 * CSS подключается только в production: в dev-режиме стили приходят
 * через JS-модуль Vite (HMR), отдельный <link> не нужен.
 */
function my_theme_enqueue_assets() {
	$js_entry = 'frontend/src/js/app.ts';
	$js_url   = get_asset( $js_entry );

	if ( $js_url ) {
		wp_enqueue_script(
			'my-theme-app',
			$js_url,
			array(),
			null, // Версию несет хеш в имени файла.
			false // В <head>: ES-модуль deferred по умолчанию, не блокирует парсинг.
		);
	}

	// В production CSS-файл лежит в манифесте рядом с JS-точкой входа.
	$manifest_path = get_template_directory() . '/assets/manifest.json';
	if ( file_exists( $manifest_path ) ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$manifest = json_decode( file_get_contents( $manifest_path ), true );
		$css_files = $manifest[ $js_entry ]['css'] ?? array();

		foreach ( $css_files as $i => $css_file ) {
			wp_enqueue_style(
				'my-theme-app' . ( $i > 0 ? '-' . $i : '' ),
				get_template_directory_uri() . '/assets/' . $css_file,
				array(),
				null
			);
		}
	}
}
add_action( 'wp_enqueue_scripts', 'my_theme_enqueue_assets' );

/**
 * Добавляет атрибут type="module" к скрипту приложения Vite (Фаза 3.1).
 *
 * Стандартный wp_enqueue_script() не умеет type="module". Фильтр script_loader_tag
 * дописывает атрибут только для нашего handle, не трогая скрипты плагинов и ядра.
 * ES-модули выполняются deferred, поэтому подключение в <head> не блокирует
 * отрисовку и запускает код раньше, чем скрипты из футера.
 *
 * @param string $tag    Тег <script>.
 * @param string $handle  Handle скрипта.
 * @param string $src    URL скрипта.
 *
 * @return string Модифицированный тег.
 */
function my_theme_script_loader_tag( $tag, $handle, $src ) {
	if ( 'my-theme-app' !== $handle ) {
		return $tag;
	}

	// Меняем только открывающий тег, не трогая src и остальные атрибуты.
	return str_replace( '<script ', '<script type="module" ', $tag );
}
add_filter( 'script_loader_tag', 'my_theme_script_loader_tag', 10, 3 );
