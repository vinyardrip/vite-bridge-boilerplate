<?php
/**
 * =================================================================================================
 * template-parts/sections/features.php
 * =================================================================================================
 *
 * Секция «Что внутри» — порт блока из frontend/src/views/pages/index.njk.
 * Карточки — развернутый HTML макроса ui.card(), кнопки в card__footer —
 * ui.button(). Подключается через get_template_part() во front-page.php.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>

<section class="section" id="features">
	<div class="layout">
		<div class="section__head">
			<h2 class="section__title">Что внутри</h2>
			<p class="section__descr">
				Четыре опоры бойлерплейта — от шаблонов до продакшен-сборки.
			</p>
		</div>
		<div class="features__grid">
			<div class="card">
				<h3 class="card__title">UI-кит на макросах</h3>
				<p class="card__text">Кнопки, поля ввода и карточки — Nunjucks-макросы с BEM-стилями. Живые примеры и готовый код — на странице styleguide.</p>
			</div>
			<div class="card">
				<h3 class="card__title">Методология ITCSS</h3>
				<p class="card__text">Слои стилей от общих к частным: токены, база, компоненты, страницы. Порядок импортов защищает от войн специфичности.</p>
				<div class="card__footer">
					<a class="btn btn--outline btn--sm" href="/styleguide.html">Смотреть токены</a>
				</div>
			</div>
			<div class="card">
				<h3 class="card__title">Оптимизация ассетов</h3>
				<p class="card__text">Сжатие картинок через TinyPNG и чистка SVG на этапе сборки. Нет ключей или ассетов — сборка не падает, только предупреждает.</p>
				<div class="card__footer">
					<a class="btn btn--outline btn--sm" href="#faq">Как включить</a>
				</div>
			</div>
			<div class="card">
				<h3 class="card__title">Тесты и сборка</h3>
				<p class="card__text">Smoke-тесты проверяют dist после каждой сборки, Playwright гоняет интерактив: модалки, меню, аккордеон, форму и видео.</p>
			</div>
		</div>
	</div>
</section>
