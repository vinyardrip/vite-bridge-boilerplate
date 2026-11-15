<?php
/**
 * Plugin Name: Block Composer
 * Description: Универсальный композер блоков: CPT block + таксономия block_type + PHP-реестр со схемой полей + метабоксы + рендеринг. Схема полей — в реестре (в git), значения — современный движок cfs_next (`_cfs_fields`). Партиалы блоков берутся из активной темы (template-parts/blocks/). Документация: docs/MOCKUP_NOTES.md, аудит: docs/SECURITY_AUDIT.md.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
  exit;
}

// WP автозагружает только корневые файлы mu-plugins — точка входа здесь,
// код в подпапке block-composer/.
require_once __DIR__ . '/block-composer/block-composer.php';
