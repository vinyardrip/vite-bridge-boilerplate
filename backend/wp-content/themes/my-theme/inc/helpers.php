<?php
/**
 * =================================================================================================
 * inc/helpers.php
 * =================================================================================================
 *
 * Хелперы для динамического контента (изображения, загруженные через админку WP).
 *
 * Порт "battle-tested" логики пользователя: <img> в контенте оборачивается в
 * <picture> с AVIF/WebP-источниками, если рядом с оригиналом в uploads лежат
 * файлы-сиблинги (конвенция legacy: photo.jpg → photo.jpg.avif + photo.jpg.webp).
 *
 * Кто кладет сиблинги: плагин-конвертер (например, «Converter for Media»)
 * конвертирует загруженные картинки автоматически. Если плагина нет — сиблингов
 * нет, фильтр возвращает <img> без изменений (безопасный фолбэк), и контент
 * обслуживается обычным JPG.
 *
 * Статические картинки темы (assets/img/) обрабатываются на СБОРКЕ
 * (bgset-миксин + imgToPicture) — этот хелпер их не касается.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Оборачивает <img> в <picture> с AVIF/WebP-источниками для динамического контента.
 *
 * Для каждого <img> ищет в uploads сиблинги исходника:
 *   {src}.avif  →  <source type="image/avif">  (первый — браузер берет первый поддерживаемый)
 *   {src}.webp  →  <source type="image/webp">
 * Оригинальный <img> остается внутри <picture> как фолбэк (со своим srcset,
 * который wp_filter_content_tags успел добавить на приоритете 10).
 *
 * !ОТКАЗ: у <img> с классом skip-picture обертка не выполняется — способ
 * вывести картинку «как есть» из произвольного HTML в записи.
 *
 * !ИСТОЧНИКИ: проверяются только src внутри uploads (строка должна реально
 * превращаться в серверный путь через baseurl→basedir). Внешние URL, data-URI
 * и относительные src не проверяются — file_exists() по URL бессмыслен,
 * такой <img> отдается без изменений.
 *
 * !ОТЛИЧИЯ ОТ ОРИГИНАЛЬНОГО legacy-кода:
 *   1. <img> без src возвращается как есть (в оригинале — оборачивался в
 *      пустой <picture> без единого <source>, бесполезная разметка);
 *   2. wp_get_upload_dir() вызывается один раз на весь фрагмент HTML,
 *      а не на каждый <img>;
 *   3. file_exists() вызывается только когда src действительно отображается
 *      в серверный путь (иначе — лишний stat по внешним URL).
 *
 * @param string $html HTML-фрагмент (the_content, post_thumbnail_html, ...).
 *
 * @return string HTML с <picture>-обертками там, где сиблинги существуют.
 */
function my_theme_replace_img_with_picture( $html ) {
	if ( strpos( $html, '<img' ) === false ) {
		return $html;
	}

	// Один вызов на весь фрагмент: baseurl/basedir нужны всем <img> внутри.
	$upload_dir = wp_get_upload_dir();

	return preg_replace_callback(
		'/<img[^>]+>/i',
		static function ( $matches ) use ( $upload_dir ) {
			$img_tag = $matches[0];

			// Явный отказ от обертки: класс skip-picture.
			if ( preg_match( '/class="[^"]*\bskip-picture\b[^"]*"/', $img_tag ) ) {
				return $img_tag;
			}

			preg_match( '/src="([^"]+)"/', $img_tag, $src_matches );
			if ( ! isset( $src_matches[1] ) ) {
				// Нет src — делать <picture> не из чего (см. отличия, п.1).
				return $img_tag;
			}

			$original_src = $src_matches[1];
			$sources      = '';

			// AVIF: первый source — браузер выбирает первый поддерживаемый формат.
			$avif_src         = $original_src . '.avif';
			$avif_server_path = str_replace( $upload_dir['baseurl'], $upload_dir['basedir'], $avif_src );
			if ( $avif_server_path !== $avif_src && file_exists( $avif_server_path ) ) {
				$sources .= '<source srcset="' . esc_url( $avif_src ) . '" type="image/avif">';
			}

			// WebP: второй source.
			$webp_src         = $original_src . '.webp';
			$webp_server_path = str_replace( $upload_dir['baseurl'], $upload_dir['basedir'], $webp_src );
			if ( $webp_server_path !== $webp_src && file_exists( $webp_server_path ) ) {
				$sources .= '<source srcset="' . esc_url( $webp_src ) . '" type="image/webp">';
			}

			if ( empty( $sources ) ) {
				// Сиблингов нет — конвертация не выполнялась (плагин не установлен
				// или формат не поддержан), отдаем <img> без изменений.
				return $img_tag;
			}

			return '<picture>' . $sources . $img_tag . '</picture>';
		},
		$html
	);
}

/**
 * Подключение к динамическому контенту.
 *
 * Приоритет 99 — после wpautop (10), do_shortcode (11) и wp_filter_content_tags (10):
 * теги уже сформированы и обогащены srcset, оборачиваем готовый HTML.
 *
 * woocommerce_product_get_image — карточки товара WooCommerce: фильтр не срабатывает,
 * пока Woo не установлен, а после установки работает без правок темы.
 */
add_filter( 'the_content', 'my_theme_replace_img_with_picture', 99 );
add_filter( 'post_thumbnail_html', 'my_theme_replace_img_with_picture', 99 );
add_filter( 'woocommerce_product_get_image', 'my_theme_replace_img_with_picture', 99 );
