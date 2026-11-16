<?php
/**
 * =================================================================================================
 * footer.php
 * =================================================================================================
 *
 * Подвал сайта — порт partials/_footer.njk плюс общие компоненты макета
 * (_scroll-to-top.njk, _modals.njk, _counters.njk), которые в статической
 * сборке подключались на уровне index.njk / _default.njk.
 * Закрывает контейнер .site-container, открытый в header.php.
 *
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>

	<footer class="footer">
		<div class="layout">
			<div class="footer__inner">
				<div class="footer__brand">
					<span class="footer__name">LOGO</span>
					<span class="footer__descr">Vite Bridge Boilerplate</span>
				</div>

				<nav class="footer__nav" aria-label="Навигация в футере">
					<?php
					wp_nav_menu(
						array(
							'theme_location' => 'footer',
							'container'      => false,
							'menu_class'     => '',
							'items_wrap'     => '%3$s',
							'fallback_cb'    => 'my_theme_menu_fallback',
							'walker'         => new My_Theme_Anchor_Walker(),
							'depth'          => 1,
							'link_class'     => 'footer__link',
						)
					);
					?>
				</nav>

				<button type="button" class="footer__policy" data-modal-trigger="policy">
					Политика конфиденциальности
				</button>
			</div>

			<p class="footer__copy">
				© <?php echo esc_html( wp_date( 'Y' ) ); ?> Vite Bridge Boilerplate. Шаблон для статических сайтов.
			</p>
		</div>
	</footer>

	<?php
	// Кнопка «наверх» (components/_scroll-to-top.njk):
	// появление/исчезновение управляется JS.
	?>
	<button id="scroll-to-top" class="btn-exit" aria-label="Вернуться наверх"></button>

	<?php
	// Оверлей модальных окон (components/_modals.njk): общий контейнер
	// всех окон страницы, JS управляет классом .overlay-active.
	?>
	<div class="overlay" id="overlay" aria-hidden="true">

		<div class="modal" role="dialog" aria-modal="true">

			<button class="modal__close" data-modal-close="data-modal-close" aria-label="Закрыть окно">
				<?php echo theme_icon( 'cross', 'icon-cross' ); // phpcs:ignore WordPress.Security.EscapeOutput -- theme_icon экранирует разметку внутри. ?>
			</button>

			<?php // ОКНО «СПАСИБО». ?>
			<div class="modal__thanx" data-modal-window="thanks">
				<h2 class="modal__title">Спасибо</h2>
				<p class="modal__descr">Наши менеджеры свяжутся с вами через несколько минут</p>
			</div>

			<?php // ОКНО «ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ». ?>
			<div class="modal__policy" data-modal-window="policy">
				<h2 class="modal__title">Политика конфиденциальности</h2>
				<div class="modal__text">
					<p>Данное соглашение разработано в соответствии с требованиями действующего законодательства Республики Беларусь, Закона Республики Беларусь от 10.11.2008 №455-З «Об информации, информатизации и защите информации».</p>
					<p>Я, субъект персональных данных, на основании Закона Республики Беларусь от 10.11.2008 №455-З «Об информации, информатизации и защите информации» принимаю решение о предоставлении моих персональных данных и даю согласие на их обработку свободно, своей волей и в своём интересе Обществом с ограниченной ответственностью «СтройЭдвайс» (далее ООО «СтройЭдвайс») путём ведения баз данных автоматизированным, механическим и ручным способом.</p>
					<p>Все лица, заполнившие Форму заявки и Форму обратной связи, подтверждают, что полностью ознакомлены и согласны с условиями настоящего Соглашения, в частности подтверждают свое согласие:</p>
					<ol>
						<li>на осуществление ООО «СтройЭдвайс» сбора, обработки и хранения указанных в регистрационной форме персональных данных;</li>
						<li>на включение предоставленной информации (обратная связь, персональные данные) в базу ООО «СтройЭдвайс».</li>
					</ol>
					<p>При этом гражданин вправе отозвать согласие на использование персональных данных, направив ООО «СтройЭдвайс» уведомление на электронную почту info@tehnadzor-minsk.by. В случае получения уведомления об отзыве согласия на использование персональных данных ООО «СтройЭдвайс» прекращает обработку персональных данных и уничтожает данные в течение 5 (пяти) рабочих дней с даты получения отзыва.</p>
					<p>Гражданин гарантирует, что данные, содержащиеся в регистрационной форме, являются достоверными; при предоставлении информации не нарушается действующее законодательство Республики Беларусь, законные права и интересы третьих лиц.</p>
				</div>
			</div>

		</div>
	</div>

</div><!-- /.site-container -->

<?php
// Счетчики веб-аналитики (partials/_counters.njk): коды Яндекс.Метрики,
// Google Analytics и т.п. вставляются сюда, перед wp_footer().
?>
<!-- Yandex.Metrika counter -->

<!-- /Yandex.Metrika counter -->

<!-- Google tag (gtag.js) -->

<!-- /Google tag (gtag.js) -->

<?php wp_footer(); ?>
</body>
</html>
