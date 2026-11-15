<?php
/**
 * =================================================================================================
 * mu-plugins/block-composer/block-composer.php
 * =================================================================================================
 *
 * Block Composer: CPT `block` + таксономия `block_type` + PHP-реестр блоков +
 * метабокс `_page_blocks` на страницах + метабокс полей блока по схеме из
 * реестра + рендеринг.
 *
 * Архитектура хранения (решение по стоп-протоколу, см. docs/MOCKUP_NOTES.md):
 *   - Схема полей каждого блока живёт в PHP-реестре (block-registry.php, в git) —
 *     переживает перенос на прод без БД-миграций. Тема может расширять реестр
 *     фильтром `bc_registry`.
 *   - Значения полей хранит СОВРЕМЕННЫЙ движок cfs_next: JSON в мета `_cfs_fields`
 *     записи блока (CFS()->engine()->save / CFS()->get(name, $block_id)).
 *   - Легаси-слой cfs_next (группы-посты `cfs`, таблица `cfs_values`) не используется.
 *
 * Партиалы блоков — в АКТИВНОЙ теме (template-parts/blocks/<partial>.php):
 * плагин универсален, тема отвечает за разметку. Каркас страницы —
 * template-constructor.php темы (перехват через template_include).
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/block-registry.php';
require_once __DIR__ . '/block-post-type.php';
require_once __DIR__ . '/block-fields-metabox.php';
require_once __DIR__ . '/page-blocks-metabox.php';
require_once __DIR__ . '/page-blocks-ajax.php';
require_once __DIR__ . '/renderer.php';

/**
 * ФИКС хранилища современного движка cfs_next (ядро не трогаем — docs/MOCKUP_NOTES.md).
 *
 * Проблема: update_metadata() применяет wp_unslash (magic quotes) к значению
 * меты ДО записи, поэтому JSON движка `_cfs_fields`, содержащий экранирование
 * (\u0422… кириллицы, \", \\), теряет обратные слэши и читается битым
 * (кириллица превращалась в «u0422u0435…», кавычки ломали синтаксис JSON).
 * Найдено интеграционным тестом tests/block-composer-eval.php; фильтры
 * update_post_metadata/sanitize_post_meta_* не спасают — unslash в ядре WP
 * происходит раньше них.
 *
 * Решение: декоратор сериализатора — на границе записи JSON прогоняется через
 * wp_slash(), и одиночный wp_unslash ядра возвращает исходный JSON 1:1.
 * Движок получает сериализатор через конструктор, поэтому приватное свойство
 * $serializer заменяется через Reflection (легитимная инъекция, класс и
 * интерфейс CFS_Serializer_Interface не меняются). Чтение правок не требует —
 * в БД лежит корректный JSON.
 *
 * Класс объявлен ВНУТРИ колбэка: как mu-plugin этот файл загружается раньше
 * cfs-next-loader.php (алфавитный порядок mu-plugins), и интерфейс
 * CFS_Serializer_Interface ещё не существует в момент парсинга файла.
 */
function bc_install_cfs_serializer_fix(): void {
	if ( ! class_exists( 'CFS_Engine' ) || ! function_exists( 'CFS' ) ) {
		return; // cfs_next не активен — фикс не нужен.
	}

	if ( ! class_exists( 'BC_CFS_Safe_Serializer' ) ) {
		final class BC_CFS_Safe_Serializer implements CFS_Serializer_Interface {
			private CFS_Serializer_Interface $inner;

			public function __construct( CFS_Serializer_Interface $inner ) {
				$this->inner = $inner;
			}

			public function encode( mixed $value ): string {
				return wp_slash( $this->inner->encode( $value ) );
			}

			public function decode( string $value ): mixed {
				return $this->inner->decode( $value );
			}
		}
	}

	try {
		$property = new ReflectionProperty( CFS_Engine::class, 'serializer' );
		$engine   = CFS()->engine();
		$property->setValue(
			$engine,
			new BC_CFS_Safe_Serializer( $property->getValue( $engine ) )
		);
	} catch ( ReflectionException $e ) {
		// Ядро cfs_next изменилось (переименовали свойство/класс) — degrade
		// безопасно: старое поведение, кириллица будет искажаться (см. MOCKUP_NOTES).
		CFS_Logger::error( 'cfs serializer fix not applied', array( 'message' => $e->getMessage() ) );
	}
}
add_action( 'init', 'bc_install_cfs_serializer_fix', 5 );
