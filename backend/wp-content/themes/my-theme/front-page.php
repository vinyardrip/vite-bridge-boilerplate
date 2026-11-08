<?php
/**
 * =================================================================================================
 * front-page.php
 * =================================================================================================
 *
 * Шаблон главной страницы — порт frontend/src/views/pages/index.njk.
 *
 * Крупные секции вынесены в template-parts/sections/ и подключаются
 * через get_template_part(): hero, features, faq, contacts. Разметка
 * секций совпадает со статической сборкой 1:1 (классы, data-атрибуты),
 * поэтому стили UI-кита и JS-логика (модалки, аккордеон, форма, видео)
 * работают без изменений.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>

<main class="main">

	<?php
	// HERO: заголовок, лид и кнопки.
	get_template_part( 'template-parts/sections/hero' );

	// ВОЗМОЖНОСТИ: сетка карточек.
	get_template_part( 'template-parts/sections/features' );
	?>

	<?php
	// ВИДЕО: ленивый YouTube-плеер (компонент components/_video.njk).
	// JS находит контейнер по классу .video и подгружает плеер по клику.
	?>
	<section class="section section--muted" id="video">
		<div class="layout">
			<div class="section__head">
				<h2 class="section__title">Видео-презентация</h2>
				<p class="section__descr">
					Превью подгружается по клику — YouTube стартует только тогда,
					когда пользователь действительно хочет смотреть.
				</p>
			</div>
			<div class="section__video">
				<div class="video-wrap">
					<div class="video" data-video-id="xD5RyFonLSE">
						<a class="video__link" href="https://youtu.be/xD5RyFonLSE">
							<picture>
								<source srcset="https://i.ytimg.com/vi_webp/xD5RyFonLSE/maxresdefault.webp" type="image/webp">
								<img class="video__media" src="https://i.ytimg.com/vi/xD5RyFonLSE/maxresdefault.jpg" alt="Презентация услуг">
							</picture>
						</a>
						<button class="video__btn" aria-label="Запустить видео">
							<svg viewbox="0 0 91 91" fill="none" xmlns="http://www.w3.org/2000/svg">
								<circle class="video__btn-circle-out" cx="45.5" cy="45.5" r="45.5"/>
								<circle class="video__btn-circle-inner" cx="45.5" cy="45.5" r="30.5"/>
								<path class="video__btn-icon" d="M59 46.5L38.75 58.1913L38.75 34.8087L59 46.5Z"/>
							</svg>
						</button>
					</div>
				</div>
			</div>
		</div>
	</section>

	<?php
	// FAQ: аккордеон.
	get_template_part( 'template-parts/sections/faq' );

	// КОНТАКТЫ: форма заявки.
	get_template_part( 'template-parts/sections/contacts' );
	?>

</main>

<?php
get_footer();
