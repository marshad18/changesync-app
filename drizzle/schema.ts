import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier — kept for backwards compat but nullable for email/password users. */
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  /** bcrypt hash of the user's password. Null for OAuth-only users. */
  passwordHash: varchar("passwordHash", { length: 255 }),
  /** Token sent in the password-reset email. Null when no reset is pending. */
  passwordResetToken: varchar("passwordResetToken", { length: 128 }),
  /** Expiry timestamp for the reset token. */
  passwordResetExpiry: timestamp("passwordResetExpiry"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Change Events ────────────────────────────────────────────────────────────

export const changeEvents = mysqlTable("changeEvents", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  changeType: mysqlEnum("changeType", [
    "hardware",
    "process",
    "material",
    "packaging",
    "supplier",
    "regulatory",
    "safety",
    "maintenance",
    "part_change",
    "weight_change",
    "price_change",
  ]).notNull(),
  // For part_change: 'manual' or 'drawing'
  partSubType: mysqlEnum("partSubType", ["manual", "drawing", "image"]),
  changeScope: mysqlEnum("changeScope", [
    "substitution",
    "upgrade",
    "new_introduction",
  ]).default("substitution"),
  affectedEquipment: varchar("affectedEquipment", { length: 255 }),
  affectedSku: varchar("affectedSku", { length: 255 }),
  textNotes: text("textNotes"),
  status: mysqlEnum("status", [
    "draft",
    "analyzing",
    "analysis_complete",
    "generating_drafts",
    "pending_approval",
    "approved",
    "rejected",
  ])
    .default("draft")
    .notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChangeEvent = typeof changeEvents.$inferSelect;
export type InsertChangeEvent = typeof changeEvents.$inferInsert;

// ─── Change Assets (drawings, photos, SDS) ───────────────────────────────────

export const changeAssets = mysqlTable("changeAssets", {
  id: int("id").autoincrement().primaryKey(),
  changeEventId: int("changeEventId").notNull(),
  assetType: mysqlEnum("assetType", [
    "drawing_old",
    "drawing_new",
    "photo_old",
    "photo_new",
    "sds",
    "other",
    "manual_old",
    "manual_new",
    "image_old",
    "image_new",
  ]).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChangeAsset = typeof changeAssets.$inferSelect;
export type InsertChangeAsset = typeof changeAssets.$inferInsert;

// ─── SKU / Parameter Changes ──────────────────────────────────────────────────

export const skuChanges = mysqlTable("skuChanges", {
  id: int("id").autoincrement().primaryKey(),
  changeEventId: int("changeEventId").notNull(),
  fieldName: varchar("fieldName", { length: 255 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  unit: varchar("unit", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SkuChange = typeof skuChanges.$inferSelect;
export type InsertSkuChange = typeof skuChanges.$inferInsert;

// ─── Document Library ─────────────────────────────────────────────────────────

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 64 }),
  category: mysqlEnum("category", [
    "Operator",
    "Engineering",
    "Safety",
    "Operations",
    "Maintenance",
  ]),
  owner: varchar("owner", { length: 255 }),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  version: int("version").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// ─── Impact Analyses ──────────────────────────────────────────────────────────

export const impactAnalyses = mysqlTable("impactAnalyses", {
  id: int("id").autoincrement().primaryKey(),
  changeEventId: int("changeEventId").notNull(),
  documentId: int("documentId").notNull(),
  impacted: boolean("impacted").default(false).notNull(),
  reasoning: text("reasoning"),
  impactedSections: text("impactedSections"),
  confidence: mysqlEnum("confidence", ["high", "medium", "low"]).default("medium"),
  status: mysqlEnum("status", ["pending", "confirmed", "dismissed"]).default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ImpactAnalysis = typeof impactAnalyses.$inferSelect;
export type InsertImpactAnalysis = typeof impactAnalyses.$inferInsert;

// ─── Document Drafts ──────────────────────────────────────────────────────────

export const documentDrafts = mysqlTable("documentDrafts", {
  id: int("id").autoincrement().primaryKey(),
  impactAnalysisId: int("impactAnalysisId").notNull(),
  changeEventId: int("changeEventId").notNull(),
  documentId: int("documentId").notNull(),
  draftContent: text("draftContent"),
  reviewNotes: text("reviewNotes"),
  status: mysqlEnum("status", [
    "generating",
    "pending_review",
    "routed_for_approval",
    "approved",
    "revision_requested",
    "rejected",
  ])
    .default("generating")
    .notNull(),
  approverName: varchar("approverName", { length: 255 }),
  approverEmail: varchar("approverEmail", { length: 320 }),
  /** Signed token embedded in the approval link — allows approver to act without logging in */
  approvalToken: varchar("approvalToken", { length: 128 }),
  approvalTokenExpiry: timestamp("approvalTokenExpiry"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  /** S3 URL of the AI-modified version of the original document (Excel/PDF with changes applied) */
  modifiedFileUrl: text("modifiedFileUrl"),
  modifiedFileKey: varchar("modifiedFileKey", { length: 512 }),
  /** S3 URL of the original document with yellow highlights over old values (for left panel in DraftReview) */
  annotatedOriginalUrl: text("annotatedOriginalUrl"),
  annotatedOriginalKey: varchar("annotatedOriginalKey", { length: 512 }),
  /** S3 URL of the clean modified document without annotation highlights (for download) */
  cleanModifiedUrl: text("cleanModifiedUrl"),
  cleanModifiedKey: varchar("cleanModifiedKey", { length: 512 }),
  /** JSON array of change descriptors: [{cellRef, oldValue, newValue, sheetName}] */
  changeLog: text("changeLog"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DocumentDraft = typeof documentDrafts.$inferSelect;
export type InsertDocumentDraft = typeof documentDrafts.$inferInsert;