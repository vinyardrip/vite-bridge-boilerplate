<?php
/**
 * =================================================================================================
 * front-page.php
 * =================================================================================================
 *
 * Шаблон главной страницы — собирается из блоков Block Composer
 * (mu-plugins/block-composer/): страница-фронт несет метаполе `_page_blocks`
 * (JSON-массив ID блоков), рендер — bc_render_page_blocks().
 *
 * Блоки реестра (hero, advantages, how-we-work, categories, products-grid)
 * рендерят партиалы template-parts/blocks/ с graceful fallback на статику
 * макета при пустых полях (Zero-If) — главная выглядит как демо даже
 * без заполненных данных и без cfs_next.
 *
 * Сидирование демо-страницы: dpx ddev wp eval-file scripts/seed-home-blocks.php --here
 * Документация: docs/BOILERPLATE_MANUAL.md (разделы 4-6).
 * =================================================================================================
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>

<main class="main">

	<?php
	// ID страницы-фронта: при show_on_front=page это page_on_front,
	// при статической странице — ID из цикла. Пусто → рендер ничего
	// не выводит (главная соберется после сидирования блоков).
	$page_id = (int) get_option( 'page_on_front' );
	if ( $page_id < 1 && have_posts() ) {
		the_post();
		$page_id = (int) get_the_ID();
	}

	if ( $page_id > 0 ) {
		bc_render_page_blocks( $page_id );
	}
	?>


<?php
get_footer();
