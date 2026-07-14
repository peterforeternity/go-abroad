-- 0000_init already created these tables. This migration preserves every row
-- while rebuilding the child tables so SQLite can attach foreign keys.
CREATE TABLE `auth_tokens__production` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `auth_tokens__production` (`id`, `user_id`, `token_hash`, `purpose`, `expires_at`, `consumed_at`, `created_at`)
SELECT `id`, `user_id`, `token_hash`, `purpose`, `expires_at`, `consumed_at`, `created_at`
FROM `auth_tokens`;
--> statement-breakpoint
DROP TABLE `auth_tokens`;
--> statement-breakpoint
ALTER TABLE `auth_tokens__production` RENAME TO `auth_tokens`;
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_hash_unique` ON `auth_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `auth_tokens_user_id_idx` ON `auth_tokens` (`user_id`);
--> statement-breakpoint
CREATE INDEX `auth_tokens_purpose_expires_idx` ON `auth_tokens` (`purpose`, `expires_at`);
--> statement-breakpoint
CREATE TABLE `saved_items__production` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `saved_items__production` (`id`, `user_id`, `item_id`, `created_at`)
SELECT `id`, `user_id`, `item_id`, `created_at`
FROM `saved_items`;
--> statement-breakpoint
DROP TABLE `saved_items`;
--> statement-breakpoint
ALTER TABLE `saved_items__production` RENAME TO `saved_items`;
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_items_user_item_unique` ON `saved_items` (`user_id`, `item_id`);
--> statement-breakpoint
CREATE INDEX `saved_items_user_id_idx` ON `saved_items` (`user_id`);
