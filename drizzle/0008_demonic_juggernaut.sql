ALTER TABLE `documentDrafts` ADD `approverEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `documentDrafts` ADD `approvalToken` varchar(128);--> statement-breakpoint
ALTER TABLE `documentDrafts` ADD `approvalTokenExpiry` timestamp;