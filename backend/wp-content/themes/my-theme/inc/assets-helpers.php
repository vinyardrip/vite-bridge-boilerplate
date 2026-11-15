<?php
/**
 * =================================================================================================
 * inc/assets-helpers.php
 * =================================================================================================
 *
 * Вывод ассетов конвейера smart-assets в PHP-шаблонах темы. PHP-зеркала
 * Nunjucks-макросов ui.icon()/ui.picture() (frontend/src/views/macros/_ui.njk,
 * фильтры smartSvg/smartPicture в vite.config.js → projectSvg пакета
 * vite-plugin-smart-assets).
 *
 * Источник данных — манифест assets-manifest.json, который пишет
 * vite-plugin-smart-assets в корень assets/ темы (pnpm build:wp или
 * pnpm sync:theme из dist/). Читается ОДИН раз за запрос — static-кэш
 * в my_theme_smart_assets().
 *
 * Формат записи манифеста:
 *   SVG (icon inline): { source: "frontend/raw/phone.svg", file: "ui/phone.svg",
 *                        kind: "icon", mode: "inline", hash }
 *   SVG (sprite):      { source: "frontend/raw/demo-sprite.svg", file: "icons/sprite.<hash>.svg",
 *                        kind: "sprite", mode: "sprite", symbol: "demo-sprite", hash }
 *   SVG (illustration):{ source, file: "img/<stem>.<hash>.svg", kind: "illustration", mode: "img" }
 *   Растр:             { source: "frontend/raw/hero.jpg", type: "img", hash, retina,
 *                        width, height, output, variants: [{ path, format, descriptor, width, height }] }
 *
 * Функции:
 *   theme_icon( $name, $class = '', $args = [] ) — SVG: инлайн <svg> / <use> спрайта / <img>
 *   theme_picture( $name, $args = [] )           — растровый <picture> (AVIF/WebP + retina-пары)
 *   theme_asset_url( $file )                     — URL файла в assets/ темы по относительному пути
 *   my_theme_smart_assets()                      — манифест с static-кэшем (поиск по source)
 *
 * Ошибки — fail-fast (RuntimeException с именем ассета): в проде это падение
 * страницы с понятным сообщением вместо «молчаливой» дыры в разметке — то же
 * поведение, что у ui.icon() на фронте (throw при отсутствии записи).
 *
 * Отличие от projectSvg (осознанное): в <picture> src указывает на 1x-вариант
 * (у фронтенд-макроса src при ретина-исходнике — @2x-оригинал; srcset в обоих
 * случаях полный, поэтому видимая разницы нет, но PHP-версия не отдает
 * браузерам без srcset двухкилобайтный файл).
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * URL файла из каталога assets темы по пути относительно корня манифеста.
 *
 * @param string $file Относительный путь ("img/hero.abc.jpg", "ui/phone.svg").
 * @return string
 */
function theme_asset_url( $file ) {
	return get_template_directory_uri() . '/assets/' . ltrim( (string) $file, '/' );
}

/**
 * Манифест smart-assets с static-кэшем: читается один раз за запрос.
 * Возвращает ['by_source' => <записи манифеста, индексированные по source>].
 *
 * @return array
 * @throws RuntimeException Если assets-manifest.json не найден (нет сборки в теме).
 */
function my_theme_smart_assets() {
	static $manifest = null;

	if ( $manifest === null ) {
		$manifest = array( 'by_source' => array() );

		$path = get_template_directory() . '/assets/assets-manifest.json';
		if ( ! file_exists( $path ) ) {
			throw new RuntimeException(
				'assets-manifest.json не найден в assets/ темы — выполните pnpm build:wp (или pnpm sync:theme из dist/)'
			);
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$decoded = json_decode( file_get_contents( $path ), true );
		$entries = is_array( $decoded ) ? ( $decoded['entries'] ?? array() ) : array();

		foreach ( $entries as $entry ) {
			if ( ! empty( $entry['source'] ) ) {
				$manifest['by_source'][ $entry['source'] ] = $entry;
			}
		}
	}

	return $manifest;
}

/**
 * Строка атрибутов из пар [name, value] (зеркало renderAttrs из projectSvg):
 * null/false пропускаются, true — голый булев атрибут, остальное — esc_attr.
 *
 * @param array $pairs Список [ имя, значение ].
 * @return string
 */
function my_theme_render_attrs( $pairs ) {
	$out = '';

	foreach ( $pairs as $pair ) {
		list( $name, $value ) = $pair;

		if ( $value === null || $value === false ) {
			continue;
		}

		$out .= ( $value === true )
			? ' ' . $name
			: sprintf( ' %s="%s"', $name, esc_attr( (string) $value ) );
	}

	return $out;
}

/**
 * Общие атрибуты иконки (зеркало iconDefaults из projectSvg):
 * aria-hidden="true" — если нет aria-label (явный aria-hidden сильнее дефолта),
 * focusable="false", плюс остальные $args как атрибуты.
 *
 * @param array  $args       Аргументы theme_icon().
 * @param bool   $with_class Включить class первой парой (режим sprite).
 * @param string $class      Значение class.
 * @return array Список пар [ name, value ].
 */
function my_theme_icon_pairs( $args, $with_class, $class ) {
	$aria_label  = $args['aria-label'] ?? null;
	$aria_hidden = $args['aria-hidden'] ?? ( $aria_label === null ? 'true' : null );
	$focusable   = $args['focusable'] ?? 'false';

	$skip = array( 'class', 'aria-hidden', 'focusable', 'alt', 'loading', 'decoding', 'imgClass', 'width', 'height' );

	$pairs = array();
	if ( $with_class && $class !== '' ) {
		$pairs[] = array( 'class', $class );
	}
	$pairs[] = array( 'aria-hidden', $aria_hidden );
	$pairs[] = array( 'focusable', $focusable );

	foreach ( $args as $key => $value ) {
		if ( in_array( $key, $skip, true ) ) {
			continue;
		}
		$pairs[] = array( $key, $value );
	}

	return $pairs;
}

/**
 * mode inline: нормализованный <svg> целиком — класс сливается с корнем,
 * aria-атрибуты добавляются/заменяются (как projectInline в projectSvg).
 *
 * @param array  $entry      Запись манифеста.
 * @param string $inline_svg Содержимое файла assets/ui/<имя>.svg.
 * @param string $class      CSS-класс.
 * @param array  $args       Аргументы theme_icon().
 * @return string
 * @throws RuntimeException Если в контенте нет корневого <svg>.
 */
function my_theme_icon_inline_html( $entry, $inline_svg, $class, $args ) {
	if ( ! preg_match( '/<svg\b([^>]*)>/i', $inline_svg, $root_match, PREG_OFFSET_CAPTURE ) ) {
		throw new RuntimeException(
			'Icon broken: ' . $entry['source'] . ' — нет корневого <svg> в inline-контенте'
		);
	}

	$attrs = $root_match[1][0];

	if ( $class !== '' ) {
		if ( preg_match( '/\bclass\s*=\s*"([^"]*)"/i', $attrs, $class_match ) ) {
			// str_replace, а не preg_replace: в замене нет служебных символов шаблона.
			$attrs = str_replace(
				$class_match[0],
				sprintf( 'class="%s"', esc_attr( trim( $class_match[1] . ' ' . $class ) ) ),
				$attrs
			);
		} else {
			$attrs .= sprintf( ' class="%s"', esc_attr( $class ) );
		}
	}

	// Дефолтные aria-атрибуты не должны дублировать уже существующие в корне.
	$attrs = preg_replace( '/\s(?:aria-hidden|focusable)\s*=\s*("[^"]*"|\'[^\']*\'|\S+)/i', '', $attrs );
	$attrs .= my_theme_render_attrs( my_theme_icon_pairs( $args, false, '' ) );

	return substr_replace( $inline_svg, '<svg' . $attrs . '>', $root_match[0][1], strlen( $root_match[0][0] ) );
}

/**
 * mode sprite: обертка <svg> + <use href="URL#symbol"> (URL и symbol из манифеста).
 *
 * @param array  $entry Запись манифеста.
 * @param string $class CSS-класс.
 * @param array  $args  Аргументы theme_icon().
 * @return string
 * @throws RuntimeException Если в записи нет file или symbol.
 */
function my_theme_icon_sprite_html( $entry, $class, $args ) {
	if ( empty( $entry['file'] ) || empty( $entry['symbol'] ) ) {
		throw new RuntimeException(
			'Icon broken: ' . $entry['source'] . ' — у sprite-записи нет file или symbol'
		);
	}

	$pairs = my_theme_icon_pairs( $args, true, $class );
	$href  = theme_asset_url( $entry['file'] ) . '#' . rawurlencode( $entry['symbol'] );

	return sprintf(
		'<svg%s><use href="%s"></use></svg>',
		my_theme_render_attrs( $pairs ),
		esc_url( $href )
	);
}

/**
 * mode img (SVG-иллюстрации): <img src loading alt [width] [height] class …>
 * (порядок пар — как projectImg в projectSvg; aria-ключи идут в rest).
 *
 * @param array  $entry Запись манифеста.
 * @param string $class CSS-класс.
 * @param array  $args  Аргументы theme_icon().
 * @return string
 * @throws RuntimeException Если в записи нет file.
 */
function my_theme_icon_img_html( $entry, $class, $args ) {
	if ( empty( $entry['file'] ) ) {
		throw new RuntimeException(
			'Icon broken: ' . $entry['source'] . ' — у img-записи нет file'
		);
	}

	$pairs = array(
		array( 'src', theme_asset_url( $entry['file'] ) ),
		array( 'loading', $args['loading'] ?? 'lazy' ),
		array( 'alt', $args['alt'] ?? '' ),
		array( 'width', $args['width'] ?? null ),
		array( 'height', $args['height'] ?? null ),
		array( 'class', $class !== '' ? $class : null ),
	);

	$img_skip = array( 'alt', 'width', 'height', 'class', 'loading', 'imgClass', 'decoding' );
	foreach ( $args as $key => $value ) {
		if ( in_array( $key, $img_skip, true ) ) {
			continue;
		}
		$pairs[] = array( $key, $value );
	}

	return '<img' . my_theme_render_attrs( $pairs ) . '>';
}

/**
 * SVG-иконка/иллюстрация из манифеста smart-assets — PHP-зеркало ui.icon().
 *
 * Режим берется из записи манифеста (вызывающему все равно):
 *   • inline — содержимое assets/ui/<имя>.svg целиком (currentColor, класс
 *     сливается с корнем, aria-hidden="true" если нет aria-label);
 *   • sprite — <svg class="…"><use href="…/assets/icons/sprite.<hash>.svg#<symbol>"></use></svg>;
 *   • img    — <img> с loading="lazy" и alt.
 *
 * @param string $name  Имя файла в frontend/raw/ без расширения (подпапка — через слеш).
 * @param string $class Дополнительный CSS-класс (если задан и в $args['class'] — побеждает $class).
 * @param array  $args  Атрибуты проекции: alt, loading, aria-label (снимает aria-hidden),
 *                      width, height, style, data-* и т.д.
 * @return string Готовый HTML (экранирование атрибутов — esc_attr/esc_url).
 * @throws RuntimeException Если записи нет в манифесте или она битая (fail-fast).
 */
function theme_icon( $name, $class = '', $args = array() ) {
	$manifest = my_theme_smart_assets();
	$source   = 'frontend/raw/' . $name . '.svg';
	$entry    = $manifest['by_source'][ $source ] ?? null;

	if ( ! $entry ) {
		throw new RuntimeException(
			'Icon not found: ' . $name . ' — нет ' . $source . ' в assets-manifest.json (пересоберите: pnpm build:wp)'
		);
	}

	$effective_class = ( $class !== '' ) ? $class : ( $args['class'] ?? '' );

	switch ( $entry['mode'] ?? '' ) {
		case 'inline':
			$path   = get_template_directory() . '/assets/' . ltrim( (string) ( $entry['file'] ?? '' ), '/' );
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$inline = ( $entry['file'] ?? '' ) !== '' ? file_get_contents( $path ) : false;
			if ( $inline === false ) {
				throw new RuntimeException(
					'Icon not readable: ' . $name . ' — файла ' . ( $entry['file'] ?? '?' ) . ' нет в assets/ (пересоберите: pnpm build:wp)'
				);
			}
			return my_theme_icon_inline_html( $entry, $inline, $effective_class, $args );

		case 'sprite':
			return my_theme_icon_sprite_html( $entry, $effective_class, $args );

		case 'img':
			return my_theme_icon_img_html( $entry, $effective_class, $args );

		default:
			throw new RuntimeException(
				'Icon unknown mode: ' . $name . ' — mode "' . ( $entry['mode'] ?? '?' ) . '"'
			);
	}
}

/**
 * srcset-строка вариантов одного формата: "URL 1x, URL 2x" (URL абсолютные).
 *
 * @param array  $variants Варианты из записи манифеста.
 * @param string $format   Формат (jpg|png|webp|avif).
 * @return string Пустая строка, если вариантов формата нет.
 */
function my_theme_srcset( $variants, $format ) {
	$parts = array();

	foreach ( $variants as $variant ) {
		if ( ( $variant['format'] ?? '' ) === $format ) {
			$parts[] = esc_url( theme_asset_url( $variant['path'] ?? '' ) ) . ' ' . ( $variant['descriptor'] ?? '1x' );
		}
	}

	return implode( ', ', $parts );
}

/**
 * Растровый <picture> из манифеста smart-assets — PHP-зеркало ui.picture():
 * <source> AVIF → WebP (srcset с retina-парами 1x/2x) + <img>-фолбэк исходного
 * формата (src — 1x-вариант), размеры против CLS, loading/decoding.
 *
 * @param string $name Имя файла в frontend/raw/ без расширения (.jpg/.jpeg/.png ищутся по очереди).
 * @param array  $args { alt, imgClass, loading, decoding }.
 * @return string Готовый HTML.
 * @throws RuntimeException Если записи нет в манифесте или нет фолбэк-вариантов (fail-fast).
 */
function theme_picture( $name, $args = array() ) {
	$manifest = my_theme_smart_assets();
	$entry    = null;

	foreach ( array( 'jpg', 'jpeg', 'png' ) as $ext ) {
		$source = 'frontend/raw/' . $name . '.' . $ext;
		if ( isset( $manifest['by_source'][ $source ] ) ) {
			$entry = $manifest['by_source'][ $source ];
			break;
		}
	}

	if ( ! $entry ) {
		throw new RuntimeException(
			'Picture not found: ' . $name . ' — нет frontend/raw/' . $name . '.jpg|.jpeg|.png в assets-manifest.json (пересоберите: pnpm build:wp)'
		);
	}

	return my_theme_picture_html( $entry, $args );
}

/**
 * Сборка <picture>-разметки по растровой записи манифеста.
 *
 * @param array $entry Запись манифеста (type: img).
 * @param array $args  Аргументы theme_picture().
 * @return string
 * @throws RuntimeException Если у записи нет фолбэк-вариантов исходного формата.
 */
function my_theme_picture_html( $entry, $args ) {
	$variants = is_array( $entry['variants'] ?? null ) ? $entry['variants'] : array();

	$alt      = $args['alt'] ?? '';
	$img_class = $args['imgClass'] ?? '';
	$loading  = $args['loading'] ?? 'lazy';
	$decoding = $args['decoding'] ?? 'async';

	// <source> современными форматами, AVIF первым (браузер берет первый поддерживаемый).
	$sources = '';
	foreach ( array( 'avif', 'webp' ) as $format ) {
		$srcset = my_theme_srcset( $variants, $format );
		if ( $srcset === '' ) {
			continue;
		}
		$sources .= sprintf( '<source type="image/%1$s" srcset="%2$s">', esc_attr( $format ), $srcset );
	}

	// Фолбэк — исходный формат; src = 1x-вариант (см. докблок модуля), srcset — вся серия.
	$fallback_variants = array();
	$fallback_src      = '';
	foreach ( $variants as $variant ) {
		if ( ! in_array( $variant['format'] ?? '', array( 'jpg', 'jpeg', 'png' ), true ) ) {
			continue;
		}
		$fallback_variants[] = $variant;
		if ( $fallback_src === '' && ( $variant['descriptor'] ?? '' ) === '1x' ) {
			$fallback_src = $variant['path'] ?? '';
		}
	}
	if ( $fallback_src === '' && $fallback_variants ) {
		$fallback_src = $fallback_variants[0]['path'] ?? '';
	}
	if ( $fallback_src === '' ) {
		throw new RuntimeException(
			'Picture broken: ' . $entry['source'] . ' — нет фолбэк-вариантов (jpg/jpeg/png)'
		);
	}

	$srcset_attr = '';
	if ( count( $fallback_variants ) > 1 ) {
		$srcset_attr = sprintf(
			' srcset="%s"',
			my_theme_srcset( $fallback_variants, $fallback_variants[0]['format'] ?? 'jpg' )
		);
	}

	$size_attrs = '';
	if ( ! empty( $entry['width'] ) && ! empty( $entry['height'] ) ) {
		$size_attrs = sprintf( ' width="%d" height="%d"', $entry['width'], $entry['height'] );
	}

	$img = '<img'
		. ( $img_class !== '' ? sprintf( ' class="%s"', esc_attr( $img_class ) ) : '' )
		. sprintf( ' src="%s"', esc_url( theme_asset_url( $fallback_src ) ) )
		. $srcset_attr
		. $size_attrs
		. sprintf( ' loading="%s" decoding="%s" alt="%s">', esc_attr( $loading ), esc_attr( $decoding ), esc_attr( $alt ) );

	return '<picture>' . $sources . $img . '</picture>';
}
