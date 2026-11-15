# ENV: разворачивание окружения (шаблон)

> Живой пример полного рецепта — `~/projects/work/php/grand-mebel/docs/ENV.md`
> (магазин, развёрнутый из этого шаблона). Здесь — минимальный набор «под ключ».
> Правило работы с контейнерами: **только `dpx ddev <command> --here` из корня
> репо**, голый `ddev` запрещён (см. `~/projects/START_HERE.md`).

## 1. Базовое окружение (кратко)

```bash
dpx ddev config --here --project-name=<slug> --docroot=backend --project-type=wordpress --php-version=8.5
dpx ddev start --here
dpx ddev wp core download --locale=ru_RU --here
dpx ddev wp config create --here   # если wp-config.php не создался ddev'ом
dpx ddev wp db create --here
# импорт дампа (если есть): dpx ddev import-db --here --file=<dump.sql>
# при импорте чужого домена: dpx ddev wp search-replace 'https://old-domain' 'https://<slug>.ddev.site' --all-tables --precise --here
dpx ddev wp theme activate my-theme --here   # после init-project: --activate=<slug>
```

## 2. Redis (объектный кэш)

Схема: аддон `ddev-redis` (сервис `redis`) + плагин `redis-cache` (создаёт
drop-in `object-cache.php`). **Константы подключения к wp-config.php добавляются
автоматически** — в шаблоне уже есть post-start-хук в `.ddev/config.yaml`.

```bash
dpx ddev get ddev/ddev-redis --here     # аддон: сервис redis (redis:6379)
dpx ddev restart --here                 # поднять контейнер redis
dpx ddev wp plugin install redis-cache --activate --here
dpx ddev wp redis enable --here         # создаст wp-content/object-cache.php
dpx ddev wp redis status --here         # ожидаемо: "Status: Connected"
```

Что делает хук: `ddev start` перегенерирует `backend/wp-config.php`
(файл с маркером `#ddev-generated` ведётся ddev) и вытирает ручные константы.
Post-start-хук возвращает их, если нет:

```php
define( 'WP_REDIS_HOST', 'redis' );  // сервис доступен ПО ИМЕНИ, не 127.0.0.1
define( 'WP_REDIS_PORT', 6379 );
```

Нюансы:

- Без констант drop-in стучится в `127.0.0.1` → `Error: Error establishing a
  Redis connection` (в wp-cli — фатально, в web — деградация без кэша).
- Тема `my-theme` содержит `inc/redis-config.php`: fallback-дефолты для поздних
  читателей констант + admin-notice, если drop-in есть, а констант в
  wp-config нет. Константы для самого кэша тема определить не может — drop-in
  стартует раньше темы.
- Диагностика Redis из контейнера: `dpx ddev exec -s redis redis-cli dbsize --here`.
- После смены хоста/туннеля сбрасывай кэш: `dpx ddev wp redis flush --here`.
