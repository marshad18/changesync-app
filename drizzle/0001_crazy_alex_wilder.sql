CREATE TABLE `changeAssets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeEventId` int NOT NULL,
	`assetType` enum('drawing_old','drawing_new','photo_old','photo_new','sds','other') NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `changeAssets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `changeEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`changeType` enum('hardware','process','material','packaging','supplier','regulatory','safety','maintenance') NOT NULL,
	`changeScope` enum('substitution','upgrade','new_introduction') DEFAULT 'substitution',
	`affectedEquipment` varchar(255),
	`affectedSku` varchar(255),
	`textNotes` text,
	`status` enum('draft','analyzing','analysis_complete','generating_drafts','pending_approval','approved','rejected') NOT NULL DEFAULT 'draft',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `changeEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documentDrafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`impactAnalysisId` int NOT NULL,
	`changeEventId` int NOT NULL,
	`documentId` int NOT NULL,
	`draftContent` text,
	`reviewNotes` text,
	`status` enum('generating','pending_review','approved','revision_requested','rejected') NOT NULL DEFAULT 'generating',
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documentDrafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`code` varchar(64),
	`category` enum('Operator','Engineering','Safety','Operations','Maintenance'),
	`owner` varchar(255),
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(128),
	`version` int NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `impactAnalyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeEventId` int NOT NULL,
	`documentId` int NOT NULL,
	`impacted` boolean NOT NULL DEFAULT false,
	`reasoning` text,
	`impactedSections` text,
	`confidence` enum('high','medium','low') DEFAULT 'medium',
	`status` enum('pending','confirmed','dismissed') DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `impactAnalyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skuChanges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeEventId` int NOT NULL,
	`fieldName` varchar(255) NOT NULL,
	`oldValue` text,
	`newValue` text,
	`unit` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `skuChanges_id` PRIMARY KEY(`id`)
);
