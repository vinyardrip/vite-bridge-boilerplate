<?php
/**
 * =================================================================================================
 * inc/dates.php — динамические даты и умный сброс кэша
 * =================================================================================================
 *
 * Перенос из боевого проекта (evakuatori/jarrayone, core/dates.php) с
 * неймспейсом my_theme_. Механика «свежести прайсов»: контент показывает
 * «месяц год», причём до дня PRICING_UPDATE_DAY показывается ПРОШЛЫЙ месяц
 * (прайс гарантированно ещё не пересчитан). В день обновления WP-Cron сбрасывает
 * кэш страницы/объектного кэша.
 *
 * Плейсхолдер %date% в контенте обрабатывается global-settings.php
 * (фильтр the_content) через общий хелпер my_theme_dynamic_date_string().
 * =================================================================================================
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// День месяца, в который обновляются прайсы и сбрасывается кэш.
// Можно переопределить в wp-config.php ДО загрузки темы.
if ( ! defined( 'PRICING_UPDATE_DAY' ) ) {
	define( 'PRICING_UPDATE_DAY', 5 );
}

/**
 * Строка «месяц год» с откатом к прошлому месяцу до дня обновления прайсов.
 * Общий хелпер для %date% в контенте и для CFS-полей.
 */
function my_theme_dynamic_date_string(): string {
	$day_to_update = (int) PRICING_UPDATE_DAY;

	$current_day   = (int) wp_date( 'j' );
	$current_month = (int) wp_date( 'n' );
	$current_year  = (int) wp_date( 'Y' );

	if ( $current_day < $day_to_update ) {
		$current_month--;
		if ( $current_month === 0 ) {
			$current_month = 12;
			$current_year--;
		}
	}

	$months = array(
		1 => 'январь', 2 => 'февраль', 3 => 'март', 4 => 'апрель',
		5 => 'май', 6 => 'июнь', 7 => 'июль', 8 => 'август',
		9 => 'сентябрь', 10 => 'октябрь', 11 => 'ноябрь', 12 => 'декабрь',
	);

	return $months[ $current_month ] . ' ' . $current_year;
}

/**
 * Динамическая дата в CFS-поле (заголовок блока/прайса с плейсхолдером %date%).
 */
function my_theme_get_dynamic_cf_date( string $field_name ): string {
	$raw_title = function_exists( 'CFS' ) ? CFS()->get( $field_name ) : '';
	$title     = is_string( $raw_title ) ? $raw_title : '';

	if ( $title !== '' && preg_match( '/%\s*date\s*%/', $title ) ) {
		return (string) preg_replace( '/%\s*date\s*%/', my_theme_dynamic_date_string(), $title );
	}

	return $title;
}

// ── Умный сброс кэша (WP-Cron) ────────────────────────────────────────────────

add_action( 'init', 'my_theme_setup_monthly_cache_purge_cron' );

/**
 * Планировщик: ежедневная проверка наступления дня обновления прайсов.
 */
function my_theme_setup_monthly_cache_purge_cron(): void {
	if ( ! wp_next_scheduled( 'my_theme_monthly_cache_purge_event' ) ) {
		wp_schedule_event( time(), 'daily', 'my_theme_monthly_cache_purge_event' );
	}
}

add_action( 'my_theme_monthly_cache_purge_event', 'my_theme_execute_monthly_cache_purge' );

/**
 * В день PRICING_UPDATE_DAY сбрасывает кэши: WP Fastest Cache (если есть)
 * и объектный кэш (Redis/любой backend через wp_cache_flush).
 */
function my_theme_execute_monthly_cache_purge(): void {
	if ( (int) wp_date( 'j' ) === (int) PRICING_UPDATE_DAY ) {
		if ( function_exists( 'wpfc_clear_all_cache' ) ) {
			wpfc_clear_all_cache( true );
		}

		// Универсальный сброс объектного кэша (Redis через drop-in и т.п.).
		wp_cache_flush();
	}
}
