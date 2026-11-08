<?php
/**
 * =================================================================================================
 * template-parts/sections/hero.php
 * =================================================================================================
 *
 * Секция HERO — порт блока из frontend/src/views/pages/index.njk.
 * Кнопки — развернутый HTML макроса ui.button() из macros/_ui.njk.
 * Подключается через get_template_part() во front-page.php.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>

<section class="hero">
	<div class="layout">
		<div class="hero__inner">
			<p class="hero__badge">Vite · Nunjucks · SCSS (ITCSS)</p>
			<h1 class="hero__title">Стартовый шаблон для быстрых статических сайтов</h1>
			<p class="hero__descr">
				Готовая сборка с живым styleguide, UI-китом на Nunjucks-макросах,
				оптимизацией изображений и e2e-тестами. Меняете дизайн-токены —
				перекрашивается весь сайт.
			</p>
			<div class="hero__actions">
				<a class="btn btn--primary btn--lg" href="#contacts">Оставить заявку</a>
				<a class="btn btn--outline btn--lg hero__btn-outline" href="#features">Что внутри</a>
			</div>
		</div>
	</div>
</section>
