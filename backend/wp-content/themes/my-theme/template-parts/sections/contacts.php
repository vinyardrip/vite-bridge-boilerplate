<?php
/**
 * =================================================================================================
 * template-parts/sections/contacts.php
 * =================================================================================================
 *
 * Секция «Контакты» — порт блока из frontend/src/views/pages/index.njk
 * с разметкой формы из components/_form.njk.
 *
 * Разметка phone-поля повторяет СОБРАННЫЙ вывод dist (vite-plugin-njk-
 * frontmatter в продакшене отдает input без placeholder/pattern) —
 * так WP-страница совпадает со статической сборкой, которую гоняют e2e.
 * JS-логика формы привязывается к data-form.
 * Подключается через get_template_part() во front-page.php.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>

<section class="section section--muted" id="contacts">
	<div class="layout">
		<div class="section__head">
			<h2 class="section__title">Бесплатная консультация</h2>
			<p class="section__descr">
				Оставьте номер — перезвоним и покажем, как адаптировать шаблон
				под ваш проект.
			</p>
		</div>
		<div class="contacts__form">
			<form action="#" class="form" data-form="data-form" novalidate="novalidate">
				<?php // Ловушка для ботов (макрос ui.honeypot()). ?>
				<div style="position: absolute; left: -5000px;" aria-hidden="true">
					<input type="text" name="bot-field" tabindex="-1" value="">
				</div>
				<?php // Скрытый номер формы — заполнит JS (макрос ui.hiddenInput()). ?>
				<input type="hidden" id="loc" name="loc" value="">

				<div class="form__cta">
					<h3 class="form__cta-title">Бесплатная консультация</h3>
					<p class="form__cta-descr">Звоните или оставьте свой номер</p>
				</div>
				<div class="form__wrap">
					<div class="form__phone">
						<div class="form__phone-title">
							<span class="form-big-text">Номер телефона</span>
						</div>
						<input type="tel" id="phone" name="phone" class="form__phone-field" required="required">
					</div>
					<div class="form__btn">
						<button type="submit" class="btn nowrap">
							<span class="form-small-text">Перезвоните</span>
						</button>
					</div>
				</div>
			</form>
		</div>
		<p class="contacts__note">
			Отправляя форму, вы соглашаетесь с
			<button type="button" class="contacts__policy-link" data-modal-trigger="policy">политикой конфиденциальности</button>.
		</p>
		<div class="contacts__demo">
			<button type="button" class="btn btn--ghost btn--sm" data-modal-trigger="thanks">
				Пример окна благодарности
			</button>
		</div>
	</div>
</section>
