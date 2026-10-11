CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_number` text,
	`first_name` text,
	`last_name` text,
	`email` text,
	`password_hash` text,
	`pin` text,
	`created_at` integer NOT NULL,
	`last_login` integer,
	`is_logged_in` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `buddies` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`phone_number` text,
	`status` text DEFAULT 'offline' NOT NULL,
	`status_message` text,
	`is_blocked` integer DEFAULT false NOT NULL,
	`is_uzzap_user` integer DEFAULT true NOT NULL,
	`last_seen` integer,
	`avatar` text,
	`groups` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `buddies_status_idx` ON `buddies` (`status`);--> statement-breakpoint
CREATE INDEX `buddies_display_name_idx` ON `buddies` (`display_name`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`buddy_id` text NOT NULL,
	`last_message_id` text,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`draft_text` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`buddy_id`) REFERENCES `buddies`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_buddy_idx` ON `conversations` (`buddy_id`);--> statement-breakpoint
CREATE INDEX `conversations_updated_idx` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`content` text NOT NULL,
	`timestamp` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`receipt_requested` integer DEFAULT true NOT NULL,
	`offline_queued` integer DEFAULT false NOT NULL,
	`amaz_msg_id` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `messages_status_idx` ON `messages` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_amaz_msg_id_idx` ON `messages` (`amaz_msg_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
