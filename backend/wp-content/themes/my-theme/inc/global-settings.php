<?php
/**
 * =================================================================================================
 * inc/global-settings.php — единый центр глобальных настроек и плейсхолдеров
 * =================================================================================================
 *
 * Перенос из боевого проекта (evakuatori/jarrayone, core/global-settings.php)
 * с неймспейсом my_theme_ и настраиваемой страницей настроек.
 *
 * Значения задаются CFS-полями global_* на «странице контактов»:
 *   global_phone, global_phone_2, global_address, global_zip, global_email,
 *   global_rs, global_unp, global_bik, global_bank, global_vk, global_tg, global_wa.
 * Какую страницу считать «контакты» (см. my_theme_get_contacts_page_id()):
 *   1. константа GLOBAL_SETTINGS_PAGE_ID в wp-config.php (жёсткая фиксация);
 *   2. иначе — страница со slug `contacts`;
 *   3. иначе — 0 (плейсхолдеры тихо возвращают пустые значения).
 *
 * Плейсхолдеры для контента (фильтр the_content — работает в Гутенберге,
 * классическом редакторе и CFS-текстах): %phone%, %phone_2%, %address%, %zip%,
 * %email%, %rs%, %unp%, %bik%, %bank%, %vk%, %tg%, %wa%, %date%.
 * Полная карта — docs/BOILERPLATE_MANUAL.md, раздел «Золотая библиотека».
 * =================================================================================================
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// ID страницы настроек: константа из wp-config.php имеет приоритет,
// иначе ищем страницу со slug `contacts` (настраивается, см. докблок файла).
if ( ! defined( 'GLOBAL_SETTINGS_PAGE_ID' ) ) {
	$contacts_page = get_page_by_path( 'contacts' );
	define( 'GLOBAL_SETTINGS_PAGE_ID', $contacts_page instanceof WP_Post ? (int) $contacts_page->ID : 0 );
}

/**
 * ID страницы, к которой привязаны поля CFS с глобальными настройками.
 */
function my_theme_get_contacts_page_id(): int {
	return (int) GLOBAL_SETTINGS_PAGE_ID;
}

/**
 * Простая текстовая настройка из CFS по имени поля (экранированная).
 */
function my_theme_get_global_text_setting( string $field_name ): string {
	$page_id = my_theme_get_contacts_page_id();
	if ( $page_id < 1 || ! function_exists( 'CFS' ) ) {
		return '';
	}

	$value = CFS()->get( $field_name, $page_id );
	return is_string( $value ) ? esc_html( $value ) : '';
}

/**
 * Динамический телефон в виде HTML-ссылки.
 * По умолчанию выводит чистую ссылку без класса.
 *
 * @param string $field_name Имя поля в CFS (по умолчанию 'global_phone').
 * @param string $class_name Класс для ссылки (если нужен).
 */
function my_theme_get_global_phone_html( string $field_name = 'global_phone', string $class_name = '' ): string {
	$raw_phone = my_theme_get_global_text_setting( $field_name );
	if ( empty( $raw_phone ) ) {
		return '';
	}

	// Утилита из inc/utils.php: только цифры, «+» и префикс tel:.
	$cleaned    = my_theme_trim_spaces_phone( $raw_phone );
	$href_value = ( stripos( $cleaned, 'tel:' ) === 0 ) ? $cleaned : 'tel:' . $cleaned;

	$class_attr = '';
	if ( trim( $class_name ) !== '' ) {
		$class_attr = sprintf( ' class="%s"', esc_attr( trim( $class_name ) ) );
	}

	return sprintf(
		'<a href="%s"%s>%s</a>',
		esc_attr( $href_value ),
		$class_attr,
		esc_html( $raw_phone )
	);
}

/**
 * Парсер плейсхолдеров для автозамены в Гутенберге и CFS-текстах
 * (фильтр the_content). Регулярка учитывает %, а также HTML-сущности
 * &#37; / &#x25;, которыми редактор может экранировать процент.
 */
function my_theme_parse_global_placeholders( string $content ): string {
	if ( empty( $content ) ) {
		return $content;
	}

	$pct = '(?:%|&#37;|&#x25;)';

	// 0. Динамическая дата (%date%) — общий хелпер из inc/dates.php.
	if ( preg_match( '/' . $pct . '\s*date\s*' . $pct . '/i', $content ) ) {
		$content = (string) preg_replace(
			'/' . $pct . '\s*date\s*' . $pct . '/i',
			my_theme_dynamic_date_string(),
			$content
		);
	}

	// 1. Телефоны — через my_theme_get_global_phone_html() (tel:-ссылка).
	if ( preg_match( '/' . $pct . '\s*phone\s*' . $pct . '/i', $content ) ) {
		$content = (string) preg_replace(
			'/' . $pct . '\s*phone\s*' . $pct . '/i',
			my_theme_get_global_phone_html( 'global_phone' ),
			$content
		);
	}
	if ( preg_match( '/' . $pct . '\s*phone_2\s*' . $pct . '/i', $content ) ) {
		$content = (string) preg_replace(
			'/' . $pct . '\s*phone_2\s*' . $pct . '/i',
			my_theme_get_global_phone_html( 'global_phone_2' ),
			$content
		);
	}

	// 2. Базовые текстовые контакты и реквизиты: placeholder => CFS-поле.
	$simple_placeholders = array(
		'address' => 'global_address',
		'zip'     => 'global_zip',
		'email'   => 'global_email',
		'rs'      => 'global_rs',   // Расчётный счет (IBAN).
		'unp'     => 'global_unp',  // УНП (для Беларуси).
		'bik'     => 'global_bik',  // БИК банка.
		'bank'    => 'global_bank', // Наименование банка.
		'vk'      => 'global_vk',
		'tg'      => 'global_tg',
		'wa'      => 'global_wa',
	);

	foreach ( $simple_placeholders as $placeholder => $cfs_field ) {
		$pattern = '/' . $pct . '\s*' . $placeholder . '\s*' . $pct . '/i';
		if ( preg_match( $pattern, $content ) ) {
			$value   = my_theme_get_global_text_setting( $cfs_field );
			$content = (string) preg_replace( $pattern, $value, $content );
		}
	}

	return $content;
}
add_filter( 'the_content', 'my_theme_parse_global_placeholders' );
