import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createEmailUser(data: { name: string; email: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(users).values({
    openId: null,
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    loginMethod: "email_password",
    role: "user",
    lastSignedIn: new Date(),
  });
  return getUserByEmail(data.email);
}

export async function updateUserPasswordHash(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash, passwordResetToken: null, passwordResetExpiry: null }).where(eq(users.id, userId));
}

export async function setPasswordResetToken(userId: number, token: string, expiry: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordResetToken: token, passwordResetExpiry: expiry }).where(eq(users.id, userId));
}

export async function getUserByResetToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.passwordResetToken, token)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listUsers() {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    loginMethod: users.loginMethod,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(desc(users.createdAt));
  return result;
}

export async function updateUserRole(userId: number, role: 'user' | 'admin') {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function adminResetUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(users).set({ passwordHash, passwordResetToken: null, passwordResetExpiry: null }).where(eq(users.id, userId));
}

// TODO: add feature queries here as your schema grows.

// ─── Change Events ────────────────────────────────────────────────────────────

import {
  changeEvents, changeAssets, skuChanges, documents, impactAnalyses, documentDrafts,
  InsertChangeEvent, InsertChangeAsset, InsertSkuChange, InsertDocument,
  InsertImpactAnalysis, InsertDocumentDraft,
} from "../drizzle/schema";

export async function createChangeEvent(data: InsertChangeEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(changeEvents).values(data);
  return result[0];
}
export async function listChangeEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(changeEvents).orderBy(desc(changeEvents.createdAt));
}
export async function getChangeEventById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(changeEvents).where(eq(changeEvents.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
export async function updateChangeEventStatus(id: number, status: "draft"|"analyzing"|"analysis_complete"|"generating_drafts"|"pending_approval"|"approved"|"rejected") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(changeEvents).set({ status }).where(eq(changeEvents.id, id));
}

// ─── Change Assets ────────────────────────────────────────────────────────────

export async function createChangeAsset(data: InsertChangeAsset) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(changeAssets).values(data);
  return result[0];
}
export async function getChangeAssetsByEventId(changeEventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(changeAssets).where(eq(changeAssets.changeEventId, changeEventId));
}

// ─── SKU Changes ──────────────────────────────────────────────────────────────

export async function createSkuChange(data: InsertSkuChange) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(skuChanges).values(data);
  return result[0];
}
export async function getSkuChangesByEventId(changeEventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(skuChanges).where(eq(skuChanges.changeEventId, changeEventId));
}
export async function deleteSkuChange(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(skuChanges).where(eq(skuChanges.id, id));
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function createDocument(data: InsertDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documents).values(data);
  return result[0];
}
export async function listDocuments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(eq(documents.isActive, true)).orderBy(documents.name);
}
export async function getDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Impact Analyses ──────────────────────────────────────────────────────────

export async function createImpactAnalysis(data: InsertImpactAnalysis) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(impactAnalyses).values(data);
  return result[0];
}
export async function getImpactAnalysesByEventId(changeEventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(impactAnalyses).where(eq(impactAnalyses.changeEventId, changeEventId));
}
export async function updateImpactAnalysisStatus(id: number, status: "pending"|"confirmed"|"dismissed") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(impactAnalyses).set({ status }).where(eq(impactAnalyses.id, id));
}
export async function deleteImpactAnalysesByEventId(changeEventId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(impactAnalyses).where(eq(impactAnalyses.changeEventId, changeEventId));
}

// ─── Document Drafts ──────────────────────────────────────────────────────────

export async function createDocumentDraft(data: InsertDocumentDraft) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documentDrafts).values(data);
  return result[0];
}
export async function getDraftsByEventId(changeEventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentDrafts).where(eq(documentDrafts.changeEventId, changeEventId));
}
export async function getDraftById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documentDrafts).where(eq(documentDrafts.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
export async function updateDraftStatus(id: number, status: "generating"|"pending_review"|"routed_for_approval"|"approved"|"revision_requested"|"rejected", reviewNotes?: string, approvedBy?: number, approverName?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = { status };
  if (reviewNotes !== undefined) updateData.reviewNotes = reviewNotes;
  if (approverName !== undefined) updateData.approverName = approverName;
  if (approvedBy !== undefined) { updateData.approvedBy = approvedBy; updateData.approvedAt = new Date(); }
  await db.update(documentDrafts).set(updateData).where(eq(documentDrafts.id, id));
}
export async function updateDraftContent(id: number, draftContent: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documentDrafts).set({ draftContent }).where(eq(documentDrafts.id, id));
}
export async function updateDraftModifiedFile(id: number, modifiedFileUrl: string, modifiedFileKey: string, changeLog: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documentDrafts).set({ modifiedFileUrl, modifiedFileKey, changeLog }).where(eq(documentDrafts.id, id));
}
