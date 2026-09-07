CREATE TABLE `scan_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`next_sequence` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spreads` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`job_started` integer,
	`data` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `scan_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_spreads_session_sequence` ON `spreads` (`session_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_spreads_sequence_unique` ON `spreads` (`session_id`,`sequence`);