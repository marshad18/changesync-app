import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { listGitHubSampleDocs, downloadGitHubFile } from "./github";
import { sdk } from "./_core/sdk";
import {
  createChangeEvent, listChangeEvents, getChangeEventById, updateChangeEventStatus,
  createChangeAsset, getChangeAssetsByEventId,
  createSkuChange, getSkuChangesByEventId, deleteSkuChange,
  createDocument, listDocuments, getDocumentById,
  createImpactAnalysis, getImpactAnalysesByEventId, updateImpactAnalysisStatus, deleteImpactAnalysesByEventId,
  createDocumentDraft, getDraftsByEventId, getDraftById, updateDraftStatus, updateDraftContent,
  getUserByEmail, createEmailUser, updateUserPasswordHash, setPasswordResetToken, getUserByResetToken, updateUserLastSignedIn,
  listUsers, updateUserRole, adminResetUserPassword,
} from "./db";

function randomSuffix() { return Math.random().toString(36).substring(2, 10); }

const CHANGE_TYPE_LABELS: Record<string, string> = {
  hardware: "Hardware / Component Change", process: "Process / Method Change",
  material: "Raw Material / Ingredient Change", packaging: "Packaging / SKU Change",
  supplier: "Supplier / Vendor Change", regulatory: "Regulatory / Compliance Change",
  safety: "Safety Incident / Near-Miss", maintenance: "Maintenance Finding / Condition-Based Change",
  part_change: "Part Change (Manual or Drawing)",
  weight_change: "Weight Change",
  price_change: "Price Change",
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    register: publicProcedure.input(z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Invalid email address"),
      password: z.string().min(8, "Password must be at least 8 characters"),
    })).mutation(async ({ input, ctx }) => {
      const existing = await getUserByEmail(input.email.toLowerCase());
      if (existing) throw new Error("An account with this email already exists.");
      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await createEmailUser({ name: input.name, email: input.email.toLowerCase(), passwordHash });
      if (!user) throw new Error("Failed to create account.");
      // Create session cookie
      const sessionToken = await sdk.signSession({ openId: `email:${user.id}`, appId: "changesync", name: user.name ?? user.email ?? "" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),

    login: publicProcedure.input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    })).mutation(async ({ input, ctx }) => {
      const user = await getUserByEmail(input.email.toLowerCase());
      if (!user || !user.passwordHash) throw new Error("Invalid email or password.");
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw new Error("Invalid email or password.");
      await updateUserLastSignedIn(user.id);
      const sessionToken = await sdk.signSession({ openId: `email:${user.id}`, appId: "changesync", name: user.name ?? user.email ?? "" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),

    forgotPassword: publicProcedure.input(z.object({
      email: z.string().email(),
    })).mutation(async ({ input }) => {
      const user = await getUserByEmail(input.email.toLowerCase());
      // Always return success to prevent email enumeration
      if (!user) return { success: true };
      const token = randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await setPasswordResetToken(user.id, token, expiry);
      // Send reset email via notification system
      try {
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `Password Reset Request — ${user.email}`,
          content: `A password reset was requested for ${user.email}.\n\nReset link (valid 1 hour):\n/reset-password?token=${token}\n\nIf this was not requested, ignore this message.`,
        });
      } catch (e) {
        console.warn("[Auth] Failed to send reset email notification", e);
      }
      return { success: true };
    }),

    resetPassword: publicProcedure.input(z.object({
      token: z.string().min(1),
      password: z.string().min(8, "Password must be at least 8 characters"),
    })).mutation(async ({ input, ctx }) => {
      const user = await getUserByResetToken(input.token);
      if (!user || !user.passwordResetExpiry) throw new Error("Invalid or expired reset link.");
      if (new Date() > user.passwordResetExpiry) throw new Error("This reset link has expired. Please request a new one.");
      const passwordHash = await bcrypt.hash(input.password, 12);
      await updateUserPasswordHash(user.id, passwordHash);
      // Auto-login after reset
      const sessionToken = await sdk.signSession({ openId: `email:${user.id}`, appId: "changesync", name: user.name ?? user.email ?? "" });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true };
    }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  changeEvents: router({
    list: protectedProcedure.query(async () => listChangeEvents()),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const event = await getChangeEventById(input.id);
      if (!event) return null;
      const [assets, skus, analyses, drafts, allDocs] = await Promise.all([
        getChangeAssetsByEventId(input.id), getSkuChangesByEventId(input.id),
        getImpactAnalysesByEventId(input.id), getDraftsByEventId(input.id), listDocuments(),
      ]);
      const docMap = new Map(allDocs.map(d => [d.id, d]));
      const enrichedAnalyses = analyses.map(a => ({ ...a, documentName: docMap.get(a.documentId)?.name ?? null }));
      const enrichedDrafts = drafts.map(d => ({ ...d, documentName: docMap.get(d.documentId)?.name ?? null }));
      return { event, assets, skus, analyses: enrichedAnalyses, drafts: enrichedDrafts };
    }),

    create: protectedProcedure.input(z.object({
      title: z.string().min(1),
      changeType: z.enum(["hardware","process","material","packaging","supplier","regulatory","safety","maintenance","part_change","weight_change","price_change"]),
      partSubType: z.enum(["manual","drawing","image"]).optional(),
      changeScope: z.enum(["substitution","upgrade","new_introduction"]).optional(),
      affectedEquipment: z.string().optional(),
      affectedSku: z.string().optional(),
      textNotes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await createChangeEvent({ ...input, createdBy: ctx.user.id, status: "draft" });
      const events = await listChangeEvents();
      return events[0];
    }),

    uploadAsset: protectedProcedure.input(z.object({
      changeEventId: z.number(),
      assetType: z.enum(["drawing_old","drawing_new","photo_old","photo_new","sds","other","manual_old","manual_new","image_old","image_new"]),
      fileName: z.string(), mimeType: z.string(), fileDataBase64: z.string(),
    })).mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileDataBase64, "base64");
      const fileKey = `change-assets/${input.changeEventId}/${input.assetType}-${randomSuffix()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      await createChangeAsset({ changeEventId: input.changeEventId, assetType: input.assetType, fileUrl: url, fileKey, fileName: input.fileName, mimeType: input.mimeType });
      return { url, fileKey };
    }),

    addSkuChange: protectedProcedure.input(z.object({
      changeEventId: z.number(), fieldName: z.string().min(1),
      oldValue: z.string().optional(), newValue: z.string().optional(), unit: z.string().optional(),
    })).mutation(async ({ input }) => {
      await createSkuChange(input);
      return getSkuChangesByEventId(input.changeEventId);
    }),

    removeSkuChange: protectedProcedure.input(z.object({ id: z.number(), changeEventId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSkuChange(input.id);
        return getSkuChangesByEventId(input.changeEventId);
      }),

    analyzeImpact: protectedProcedure.input(z.object({ changeEventId: z.number() })).mutation(async ({ input }) => {
      const event = await getChangeEventById(input.changeEventId);
      if (!event) throw new Error("Change event not found");
      await updateChangeEventStatus(input.changeEventId, "analyzing");
      const [assets, skus, allDocs] = await Promise.all([
        getChangeAssetsByEventId(input.changeEventId), getSkuChangesByEventId(input.changeEventId), listDocuments(),
      ]);
      if (allDocs.length === 0) { await updateChangeEventStatus(input.changeEventId, "analysis_complete"); return { analysesCreated: 0 }; }
      await deleteImpactAnalysesByEventId(input.changeEventId);
      const changeTypeLabel = CHANGE_TYPE_LABELS[event.changeType] || event.changeType;
      const skuSummary = skus.length > 0 ? skus.map(s => `${s.fieldName}: ${s.oldValue ?? "N/A"} → ${s.newValue ?? "N/A"}${s.unit ? " "+s.unit : ""}`).join("; ") : "None";
      const assetSummary = assets.length > 0 ? assets.map(a => `${a.assetType}: ${a.fileName}`).join(", ") : "None";
      const docList = allDocs.map(d => `ID ${d.id}: ${d.code ? "["+d.code+"] " : ""}${d.name} (Category: ${d.category ?? "Unknown"}, Owner: ${d.owner ?? "Unknown"})`).join("\n");
      // Build change-type-specific context
      let changeContext = "";
      if (event.changeType === "part_change") {
        changeContext = `This is a Part Change. The sub-type is: ${event.partSubType ?? "unspecified"} (manual or drawing replacement). Old and new ${event.partSubType ?? "documents"} have been uploaded.`;
      } else if (event.changeType === "weight_change") {
        changeContext = `This is a Weight Change. The product weight has changed. Check skuChanges for old/new weight and SKU code values.`;
      } else if (event.changeType === "price_change") {
        changeContext = `This is a Price Change. The product price has changed. Check skuChanges for old/new price and SKU code values.`;
      }
      const prompt = `You are an expert manufacturing engineer analyzing the impact of an engineering change on plant documentation.\n\nCHANGE EVENT:\n- Title: ${event.title}\n- Change Type: ${changeTypeLabel}\n- Change Context: ${changeContext}\n- Change Scope: ${event.changeScope ?? "substitution"}\n- Affected Equipment: ${event.affectedEquipment ?? "Not specified"}\n- Affected SKU: ${event.affectedSku ?? "Not specified"}\n- Text Notes: ${event.textNotes ?? "None"}\n- Parameter Changes: ${skuSummary}\n- Uploaded Assets: ${assetSummary}\n\nDOCUMENTS IN LIBRARY:\n${docList}\n\nTASK:\nFor each document listed above, determine whether it would be impacted by this engineering change. Return a JSON array where each element has:\n- documentId: number\n- impacted: boolean\n- confidence: "high" | "medium" | "low"\n- reasoning: string (1-2 sentences explaining why this document is or is not impacted)\n- impactedSections: string (specific sections/fields to update if impacted, else empty string)\n\nBe thorough and err on the side of inclusion. For weight changes, focus on packaging specs, product data sheets, and labelling docs. For price changes, focus on pricing lists, SKU masters, and commercial docs. For part changes, focus on equipment manuals, maintenance plans, and safety docs.`;
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are an expert manufacturing engineer. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_schema", json_schema: { name: "impact_analysis", strict: true, schema: { type: "object", properties: { analyses: { type: "array", items: { type: "object", properties: { documentId: { type: "integer" }, impacted: { type: "boolean" }, confidence: { type: "string", enum: ["high","medium","low"] }, reasoning: { type: "string" }, impactedSections: { type: "string" } }, required: ["documentId","impacted","confidence","reasoning","impactedSections"], additionalProperties: false } } }, required: ["analyses"], additionalProperties: false } } },
      });
      const content = String(response.choices[0]?.message?.content ?? "");
      if (!content) throw new Error("No response from AI");
      const parsed = JSON.parse(content) as { analyses: Array<{ documentId: number; impacted: boolean; confidence: "high"|"medium"|"low"; reasoning: string; impactedSections: string }> };
      let count = 0;
      for (const analysis of parsed.analyses) {
        await createImpactAnalysis({ changeEventId: input.changeEventId, documentId: analysis.documentId, impacted: analysis.impacted, confidence: analysis.confidence, reasoning: analysis.reasoning, impactedSections: analysis.impactedSections, status: "pending" });
        count++;
      }
      await updateChangeEventStatus(input.changeEventId, "analysis_complete");
      return { analysesCreated: count };
    }),

    generateDrafts: protectedProcedure.input(z.object({ changeEventId: z.number() })).mutation(async ({ input }) => {
      const event = await getChangeEventById(input.changeEventId);
      if (!event) throw new Error("Change event not found");
      await updateChangeEventStatus(input.changeEventId, "generating_drafts");
      const [skus, analyses] = await Promise.all([getSkuChangesByEventId(input.changeEventId), getImpactAnalysesByEventId(input.changeEventId)]);
      const impactedAnalyses = analyses.filter(a => a.impacted && a.status !== "dismissed");
      const changeTypeLabel = CHANGE_TYPE_LABELS[event.changeType] || event.changeType;
      const skuSummary = skus.length > 0 ? skus.map(s => `${s.fieldName}: ${s.oldValue ?? "N/A"} → ${s.newValue ?? "N/A"}${s.unit ? " "+s.unit : ""}`).join("; ") : "None";
      let changeContext = "";
      if (event.changeType === "part_change") {
        changeContext = `Part Change — sub-type: ${event.partSubType ?? "unspecified"}. Old and new ${event.partSubType ?? "documents"} uploaded.`;
      } else if (event.changeType === "weight_change") {
        changeContext = `Weight Change. Parameter changes: ${skuSummary}.`;
      } else if (event.changeType === "price_change") {
        changeContext = `Price Change. Parameter changes: ${skuSummary}.`;
      }
      let draftsCreated = 0;
      for (const analysis of impactedAnalyses) {
        const doc = await getDocumentById(analysis.documentId);
        if (!doc) continue;
        const draftPrompt = `You are an expert manufacturing documentation writer. Generate updated content for a manufacturing document based on an engineering change.\n\nCHANGE EVENT:\n- Title: ${event.title}\n- Change Type: ${changeTypeLabel}\n- Change Context: ${changeContext || "Standard engineering change"}\n- Affected Equipment: ${event.affectedEquipment ?? "Not specified"}\n- Affected SKU: ${event.affectedSku ?? "Not specified"}\n- Text Notes: ${event.textNotes ?? "None"}\n- Parameter Changes: ${skuSummary}\n\nDOCUMENT TO UPDATE:\n- Name: ${doc.name}\n- Code: ${doc.code ?? "N/A"}\n- Category: ${doc.category ?? "Unknown"}\n- Owner: ${doc.owner ?? "Unknown"}\n\nSECTIONS TO UPDATE:\n${analysis.impactedSections ?? "Review all sections"}\n\nIMPACT REASONING:\n${analysis.reasoning}\n\nGenerate a clear, professional summary of the specific changes that need to be made to this document. Format your response as:\n\n## Changes Required for ${doc.name}\n\n### Summary\n[Brief overview of what changed and why this document needs updating]\n\n### Specific Updates Required\n[Detailed list of changes by section — be specific about what old values to replace with new values]\n\n### New Content / Values\n[New values, procedures, or content to insert]\n\n### Verification Checklist\n[Items the document owner/approver should verify before approving]`;
        const draftResponse = await invokeLLM({ messages: [{ role: "system", content: "You are an expert manufacturing documentation writer." }, { role: "user", content: draftPrompt }] });
        const draftContent = String(draftResponse.choices[0]?.message?.content ?? "Draft generation failed.");
        await createDocumentDraft({ impactAnalysisId: analysis.id, changeEventId: input.changeEventId, documentId: analysis.documentId, draftContent, status: "pending_review" });
        draftsCreated++;
      }
      await updateChangeEventStatus(input.changeEventId, "pending_approval");
      return { draftsCreated };
    }),
  }),

  documents: router({
    list: protectedProcedure.query(async () => listDocuments()),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => getDocumentById(input.id)),
    upload: protectedProcedure.input(z.object({
      name: z.string().min(1), code: z.string().optional(),
      category: z.enum(["Operator","Engineering","Safety","Operations","Maintenance"]).optional(),
      owner: z.string().optional(), fileName: z.string(), mimeType: z.string(), fileDataBase64: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileDataBase64, "base64");
      const fileKey = `documents/${randomSuffix()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      await createDocument({ name: input.name, code: input.code, category: input.category, owner: input.owner, fileUrl: url, fileKey, fileName: input.fileName, mimeType: input.mimeType, uploadedBy: ctx.user.id });
      return listDocuments();
    }),
  }),

  github: router({
    // List all files available in the repo's sample-documents folder
    listSampleDocs: protectedProcedure.query(async () => {
      const files = await listGitHubSampleDocs();
      // Get existing docs to mark already-imported ones
      const existing = await listDocuments();
      const existingNames = new Set(existing.map(d => d.fileName));
      return files.map(f => ({ ...f, alreadyImported: existingNames.has(f.name) }));
    }),

    // Import selected files from GitHub into the Document Library
    importFiles: protectedProcedure.input(z.object({
      files: z.array(z.object({
        name: z.string(),
        path: z.string(),
        downloadUrl: z.string(),
        folder: z.string(),
        mimeType: z.string(),
        size: z.number(),
      })),
    })).mutation(async ({ input, ctx }) => {
      const results: { name: string; success: boolean; error?: string }[] = [];

      for (const file of input.files) {
        try {
          // Download from GitHub
          const buffer = await downloadGitHubFile(file.downloadUrl);

          // Upload to S3
          const fileKey = `documents/${randomSuffix()}-${file.name}`;
          const { url } = await storagePut(fileKey, buffer, file.mimeType);

          // Infer document metadata from folder and filename
          const folderCategoryMap: Record<string, "Operator" | "Engineering" | "Safety" | "Operations" | "Maintenance"> = {
            "equipment-maps": "Engineering",
            "packaging": "Operations",
            "safety": "Safety",
            "maintenance": "Maintenance",
            "operator": "Operator",
          };
          const category = folderCategoryMap[file.folder.toLowerCase()] ?? "Operations";

          // Clean up display name from filename
          const displayName = file.name
            .replace(/\.[^.]+$/, "") // remove extension
            .replace(/[-_]/g, " ")   // replace dashes/underscores
            .replace(/,/g, " —")     // replace commas
            .trim();

          // Extract code if filename starts with a code pattern like FHC-PKG-001
          const codeMatch = file.name.match(/^([A-Z]{2,}-[A-Z]{2,}-\d{3})/i);
          const code = codeMatch ? codeMatch[1].toUpperCase() : undefined;

          await createDocument({
            name: displayName,
            code,
            category,
            owner: undefined,
            fileUrl: url,
            fileKey,
            fileName: file.name,
            mimeType: file.mimeType,
            uploadedBy: ctx.user.id,
          });

          results.push({ name: file.name, success: true });
        } catch (err) {
          results.push({ name: file.name, success: false, error: String(err) });
        }
      }

      return { results, imported: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length };
    }),
  }),

  admin: router({
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new Error('Forbidden');
      return listUsers();
    }),
    updateUserRole: protectedProcedure.input(z.object({
      userId: z.number(),
      role: z.enum(['user', 'admin']),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin') throw new Error('Forbidden');
      if (input.userId === ctx.user.id) throw new Error('You cannot change your own role.');
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),
    resetUserPassword: protectedProcedure.input(z.object({
      userId: z.number(),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin') throw new Error('Forbidden');
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await adminResetUserPassword(input.userId, passwordHash);
      return { success: true };
    }),
  }),

  analyses: router({
    confirmStatus: protectedProcedure.input(z.object({ id: z.number(), status: z.enum(["confirmed","dismissed"]) }))
      .mutation(async ({ input }) => { await updateImpactAnalysisStatus(input.id, input.status); return { success: true }; }),
  }),

  drafts: router({
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const draft = await getDraftById(input.id);
      if (!draft) return null;
      const doc = await getDocumentById(draft.documentId);
      return { draft, document: doc };
    }),
    approve: protectedProcedure.input(z.object({ id: z.number(), reviewNotes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => { await updateDraftStatus(input.id, "approved", input.reviewNotes, ctx.user.id); return { success: true }; }),
    requestRevision: protectedProcedure.input(z.object({ id: z.number(), reviewNotes: z.string().min(1) }))
      .mutation(async ({ input }) => { await updateDraftStatus(input.id, "revision_requested", input.reviewNotes); return { success: true }; }),
    reject: protectedProcedure.input(z.object({ id: z.number(), reviewNotes: z.string().optional() }))
      .mutation(async ({ input }) => { await updateDraftStatus(input.id, "rejected", input.reviewNotes); return { success: true }; }),
    updateContent: protectedProcedure.input(z.object({ id: z.number(), content: z.string() }))
      .mutation(async ({ input }) => { await updateDraftContent(input.id, input.content); return { success: true }; }),
    routeForApproval: protectedProcedure.input(z.object({
      id: z.number(),
      approverName: z.string().optional(),
      reviewNotes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const notes = [input.approverName ? `Routed to: ${input.approverName}` : "", input.reviewNotes ?? ""].filter(Boolean).join(" — ") || undefined;
      await updateDraftStatus(input.id, "routed_for_approval", notes, undefined, input.approverName);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
