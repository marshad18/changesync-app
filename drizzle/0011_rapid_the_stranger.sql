CREATE TABLE `documentVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(128),
	`changeEventId` int,
	`changeEventTitle` varchar(255),
	`changeNote` text,
	`uploadedBy` int,
	`uploadedByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documentVersions_id` PRIMARY KEY(`id`)
);
