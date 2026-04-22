ALTER TABLE `documentDrafts` ADD `annotatedOriginalUrl` text;--> statement-breakpoint
ALTER TABLE `documentDrafts` ADD `annotatedOriginalKey` varchar(512);--> statement-breakpoint
ALTER TABLE `documentDrafts` ADD `cleanModifiedUrl` text;--> statement-breakpoint
ALTER TABLE `documentDrafts` ADD `cleanModifiedKey` varchar(512);