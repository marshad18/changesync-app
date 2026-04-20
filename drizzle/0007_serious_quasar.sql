ALTER TABLE `documentDrafts` ADD `modifiedFileUrl` text;--> statement-breakpoint
ALTER TABLE `documentDrafts` ADD `modifiedFileKey` varchar(512);--> statement-breakpoint
ALTER TABLE `documentDrafts` ADD `changeLog` text;