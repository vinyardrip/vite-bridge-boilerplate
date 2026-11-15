/**
 * Управление метабоксом «Блоки страницы» (_page_blocks).
 * Vanilla JS, без зависимостей: все действия через admin-ajax (см. page-blocks-ajax.php).
 * Drag-to-reorder — SortableJS (подключается зависимостью bc-page-blocks).
 */
(function () {
	'use strict';

	var cfg = window.bcPageBlocks || {};

	function request(data) {
		var body = new URLSearchParams();
		Object.keys(data).forEach(function (key) {
			body.append(key, String(data[key]));
		});
		body.append('action', 'bc_page_blocks');

		return window.fetch(cfg.ajaxUrl, {
			method: 'POST',
			credentials: 'same-origin',
			body: body
		})
			.then(function (response) { return response.json(); })
			.then(function (result) {
				if (result && result.success && result.data && result.data.rows) {
					var container = document.getElementById('bc-page-blocks-rows');
					if (container) {
						container.outerHTML = result.data.rows;
					}
					return;
				}
				var message = result && result.data && result.data.message ? result.data.message : 'Ошибка запроса';
				window.alert(message);
			})
			.catch(function () {
				window.alert('Сеть недоступна, повторите попытку');
			});
	}

	document.addEventListener('click', function (event) {
		var button = event.target.closest('[data-bc-pb]');
		if (!button) {
			return;
		}

		var action = button.getAttribute('data-bc-pb');

		if (action === 'add') {
			var select = document.getElementById('bc-pb-slug');
			if (!select) {
				return;
			}
			request({ sub: 'add', nonce: cfg.nonce, page_id: cfg.pageId, slug: select.value });
			return;
		}

		var row = button.closest('[data-bc-pb-block]');
		if (!row) {
			return;
		}

		request({ sub: action, nonce: cfg.nonce, page_id: cfg.pageId, block_id: row.getAttribute('data-bc-pb-block') });
	});

	// Drag-to-reorder: после перетаскивания шлем новый порядок целиком (sub=reorder).
	// Без SortableJS (CDN недоступен) список просто не перетаскивается — остальные
	// действия продолжают работать.
	var rows = document.getElementById('bc-page-blocks-rows');
	if (window.Sortable && rows) {
		new window.Sortable(rows, {
			handle: '.bc-pb-row__handle',
			animation: 150,
			onEnd: function () {
				var ids = Array.prototype.map.call(
					rows.querySelectorAll('[data-bc-pb-block]'),
					function (el) { return Number(el.getAttribute('data-bc-pb-block')); }
				);
				request({ sub: 'reorder', nonce: cfg.nonce, page_id: cfg.pageId, ids: JSON.stringify(ids) });
			}
		});
	}
})();
