import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { modifyDocument, extractDocumentContent } from "./documentModifier";
import { compareManuals, extractFileText } from "./manualComparison";
import { listGitHubSampleDocs, downloadGitHubFile } from "./github";
import { sdk } from "./_core/sdk";
import { sendApproverEmail } from "./emailHelper";
import {
  createChangeEvent, listChangeEvents, getChangeEventById, updateChangeEventStatus,
  createChangeAsset, getChangeAssetsByEventId,
  createSkuChange, getSkuChangesByEventId, deleteSkuChange,
  createDocument, listDocuments, getDocumentById,
  createImpactAnalysis, getImpactAnalysesByEventId, updateImpactAnalysisStatus, deleteImpactAnalysesByEventId,
  createDocumentDraft, getDraftsByEventId, getDraftById, getDraftByImpactAnalysisId, updateDraftStatus, updateDraftContent, updateDraftModifiedFile,
  getDraftByApprovalToken,
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
      // --- Step 0: If old and new manuals are uploaded, compare them to get a precise diff ---
      // This is the primary source of truth for what changed.
      // All affected Document Library files will be modified using this diff.
      let manualDiff: Array<{ fieldName: string; oldValue: string; newValue: string; unit?: string }> = [];
      try {
        const assets = await getChangeAssetsByEventId(input.changeEventId);
        const oldManualAsset = assets.find(a => a.assetType === "manual_old" || a.assetType === "drawing_old");
        const newManualAsset = assets.find(a => a.assetType === "manual_new" || a.assetType === "drawing_new");
        if (oldManualAsset?.fileUrl && newManualAsset?.fileUrl) {
          console.log(`[ManualComparison] Comparing old manual (${oldManualAsset.fileName}) with new manual (${newManualAsset.fileName})`);
          const [oldText, newText] = await Promise.all([
            extractFileText(oldManualAsset.fileUrl, oldManualAsset.fileName),
            extractFileText(newManualAsset.fileUrl, newManualAsset.fileName),
          ]);
          manualDiff = await compareManuals({
            oldManualText: oldText,
            newManualText: newText,
            oldFileName: oldManualAsset.fileName,
            newFileName: newManualAsset.fileName,
            changeEventTitle: event.title,
          });
          console.log(`[ManualComparison] Found ${manualDiff.length} changes from manual comparison:`,
            manualDiff.map(c => `${c.fieldName}: "${c.oldValue}" → "${c.newValue}"`).join(", ")
          );
        } else {
          console.log(`[ManualComparison] No old/new manual assets found — will fall back to document content analysis`);
        }
      } catch (manualErr) {
        console.warn(`[ManualComparison] Failed to compare manuals:`, manualErr);
      }

      let draftsCreated = 0;
      for (const analysis of impactedAnalyses) {
        const doc = await getDocumentById(analysis.documentId);
        if (!doc) continue;
        const draftPrompt = `You are an expert manufacturing documentation writer. Generate updated content for a manufacturing document based on an engineering change.\n\nCHANGE EVENT:\n- Title: ${event.title}\n- Change Type: ${changeTypeLabel}\n- Change Context: ${changeContext || "Standard engineering change"}\n- Affected Equipment: ${event.affectedEquipment ?? "Not specified"}\n- Affected SKU: ${event.affectedSku ?? "Not specified"}\n- Text Notes: ${event.textNotes ?? "None"}\n- Parameter Changes: ${skuSummary}\n\nDOCUMENT TO UPDATE:\n- Name: ${doc.name}\n- Code: ${doc.code ?? "N/A"}\n- Category: ${doc.category ?? "Unknown"}\n- Owner: ${doc.owner ?? "Unknown"}\n\nSECTIONS TO UPDATE:\n${analysis.impactedSections ?? "Review all sections"}\n\nIMPACT REASONING:\n${analysis.reasoning}\n\nGenerate a clear, professional summary of the specific changes that need to be made to this document. Format your response as:\n\n## Changes Required for ${doc.name}\n\n### Summary\n[Brief overview of what changed and why this document needs updating]\n\n### Specific Updates Required\n[Detailed list of changes by section — be specific about what old values to replace with new values]\n\n### New Content / Values\n[New values, procedures, or content to insert]\n\n### Verification Checklist\n[Items the document owner/approver should verify before approving]`;
        const draftResponse = await invokeLLM({ messages: [{ role: "system", content: "You are an expert manufacturing documentation writer." }, { role: "user", content: draftPrompt }] });
        const draftContent = String(draftResponse.choices[0]?.message?.content ?? "Draft generation failed.");
        const draftRecord = await createDocumentDraft({ impactAnalysisId: analysis.id, changeEventId: input.changeEventId, documentId: analysis.documentId, draftContent, status: "pending_review" });
        draftsCreated++;

        // --- Real document modification with LLM-driven change extraction ---
        // Step 1: Extract the actual document content so the LLM can read it
        // Step 2: Ask the LLM to identify exactly which values in THIS document need changing
        // Step 3: Pass those specific changes to documentModifier to produce a real modified file
        if (doc.fileUrl && doc.fileName) {
          try {
            // Use the impact analysis ID to find the exact draft we just created — avoids
            // the race condition where allDrafts[last] could be the wrong draft.
            const latestDraft = await getDraftByImpactAnalysisId(analysis.id);
            if (latestDraft) {
              let changesToApply: Array<{ fieldName: string; oldValue: string; newValue: string; unit?: string }> = [];

              if (manualDiff.length > 0) {
                // PRIMARY PATH: Use the diff extracted from the uploaded old/new manuals.
                // These are the most accurate changes — taken directly from the actual documents.
                // Filter to changes that are relevant to this specific document category.
                changesToApply = manualDiff;
                console.log(`[DocumentModifier] Using ${changesToApply.length} manual-diff changes for ${doc.name}`);
              } else {
                // FALLBACK PATH: No manuals uploaded. Extract the document content and ask the
                // LLM to identify which values in THIS document need updating based on the
                // change event parameters (SKU changes, text notes, etc.).
                let docContent = "";
                try {
                  docContent = await extractDocumentContent({
                    fileUrl: doc.fileUrl,
                    fileName: doc.fileName,
                    mimeType: doc.mimeType ?? "application/octet-stream",
                  });
                } catch (extractErr) {
                  console.warn(`[DocumentModifier] Could not extract content from ${doc.name}:`, extractErr);
                }

                const changeExtractionPrompt = `You are an expert manufacturing documentation analyst. Identify SPECIFIC values in this document that need updating.

CHANGE EVENT: ${event.title} (${changeTypeLabel})
Equipment: ${event.affectedEquipment ?? "Not specified"}
Notes: ${event.textNotes ?? "None"}
Parameter Changes: ${skuSummary}

DOCUMENT: ${doc.name} (${doc.category ?? "Unknown"} category)
Impacted Sections: ${analysis.impactedSections ?? "All sections"}
Reasoning: ${analysis.reasoning}

DOCUMENT CONTENT:
${docContent || "(Not available — use parameter changes from the change event)"}

For each value that needs changing, return:
- fieldName: short label (e.g. "Motor Power", "Lubrication Frequency")
- oldValue: EXACT text as it appears in the document
- newValue: the replacement value
- unit: unit of measurement (e.g. "kW") or empty string

Only return changes where you found the exact old value in the document content. Return a JSON object with a "changes" array.`;

                const changeExtractionResponse = await invokeLLM({
                  messages: [
                    { role: "system", content: "You are an expert manufacturing documentation analyst. Always respond with valid JSON only." },
                    { role: "user", content: changeExtractionPrompt },
                  ],
                  response_format: {
                    type: "json_schema",
                    json_schema: {
                      name: "document_changes",
                      strict: true,
                      schema: {
                        type: "object",
                        properties: {
                          changes: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                fieldName: { type: "string" },
                                oldValue: { type: "string" },
                                newValue: { type: "string" },
                                unit: { type: "string" },
                              },
                              required: ["fieldName", "oldValue", "newValue", "unit"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["changes"],
                        additionalProperties: false,
                      },
                    },
                  },
                });

                let llmChanges: Array<{ fieldName: string; oldValue: string; newValue: string; unit: string }> = [];
                try {
                  const parsed = JSON.parse(String(changeExtractionResponse.choices[0]?.message?.content ?? "{}")) as { changes: typeof llmChanges };
                  // Allow empty oldValue for new-value-only additions (the modifier handles them via fieldName matching)
                  llmChanges = (parsed.changes ?? []).filter(c => c.newValue && c.newValue.trim() !== "" && c.oldValue !== c.newValue);
                } catch (parseErr) {
                  console.warn(`[DocumentModifier] Failed to parse LLM change extraction for ${doc.name}:`, parseErr);
                }

                // Last resort: use SKU params directly
                changesToApply = llmChanges.length > 0
                  ? llmChanges.map(c => ({ fieldName: c.fieldName, oldValue: c.oldValue, newValue: c.newValue, unit: c.unit || undefined }))
                  : skus.map(s => ({ fieldName: s.fieldName, oldValue: s.oldValue ?? "", newValue: s.newValue ?? "", unit: s.unit ?? undefined }));
              }

              if (changesToApply.length === 0) {
                console.log(`[DocumentModifier] No changes identified for ${doc.name} — skipping file modification (text draft still available)`);
              } else {
                console.log(`[DocumentModifier] Applying ${changesToApply.length} changes to ${doc.name}:`,
                  changesToApply.map(c => `${c.fieldName}: "${c.oldValue}" → "${c.newValue}"`).join(", "));

                const modResult = await modifyDocument({
                  fileUrl: doc.fileUrl,
                  fileName: doc.fileName,
                  mimeType: doc.mimeType ?? "application/octet-stream",
                  documentName: doc.name,
                  originalFileKey: doc.fileKey ?? "",
                  changes: changesToApply,
                });
                await updateDraftModifiedFile(
                  latestDraft.id,
                  modResult.modifiedFileUrl,
                  modResult.modifiedFileKey,
                  JSON.stringify(modResult.changeLog),
                );
              } // end else (changesToApply.length > 0)
            }
          } catch (modErr) {
            console.warn(`[DocumentModifier] Failed to modify document ${doc.name}:`, modErr);
            // Non-fatal: draft still exists with text content
          }
        }
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
      const [doc, assets] = await Promise.all([
        getDocumentById(draft.documentId),
        getChangeAssetsByEventId(draft.changeEventId),
      ]);
      // Find the "old" uploaded asset for this draft's document type
      const oldAsset = assets.find(a =>
        a.assetType === "manual_old" || a.assetType === "drawing_old" || a.assetType === "image_old" || a.assetType === "photo_old"
      ) ?? null;
      return { draft, document: doc, oldAsset };
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
      approverEmail: z.string().email(),
      reviewNotes: z.string().optional(),
      origin: z.string().url(),
    })).mutation(async ({ input }) => {
      // Generate a secure token valid for 7 days
      const token = randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const notes = [input.approverName ? `Routed to: ${input.approverName}` : "", input.reviewNotes ?? ""].filter(Boolean).join(" — ") || undefined;
      await updateDraftStatus(input.id, "routed_for_approval", notes, undefined, input.approverName, input.approverEmail, token, expiry);

      // Fetch draft + change event details for the email
      const draft = await getDraftById(input.id);
      if (!draft) throw new Error("Draft not found");
      const changeEvent = await getChangeEventById(draft.changeEventId);
      const doc = await getDocumentById(draft.documentId);
      const changeLog: Array<{fieldName?: string; oldValue?: string; newValue?: string}> = [];
      try { const parsed = JSON.parse(draft.changeLog ?? "[]"); if (Array.isArray(parsed)) changeLog.push(...parsed); } catch {}

      const approvalLink = `${input.origin}/approve?token=${token}&action=approve`;
      const rejectionLink = `${input.origin}/approve?token=${token}&action=reject`;

      const emailSent = await sendApproverEmail({
        to: input.approverEmail,
        approverName: input.approverName,
        changeEventTitle: changeEvent?.title ?? "Change Event",
        documentName: doc?.name ?? `Document #${draft.documentId}`,
        changedFields: changeLog.map(c => ({ fieldName: c.fieldName ?? "Field", oldValue: c.oldValue ?? "", newValue: c.newValue ?? "" })),
        approvalLink,
        rejectionLink,
      });

      return { success: true, emailSent, approvalLink };
    }),

    // Public endpoint — approver clicks the link in the email (no login required)
    approveByToken: publicProcedure.input(z.object({
      token: z.string(),
      action: z.enum(["approve", "reject"]),
      reviewNotes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const draft = await getDraftByApprovalToken(input.token);
      if (!draft) throw new Error("Invalid or expired approval link.");
      if (draft.approvalTokenExpiry && new Date() > draft.approvalTokenExpiry) {
        throw new Error("This approval link has expired. Please ask the requester to re-send.");
      }
      if (draft.status === "approved" || draft.status === "rejected") {
        return { success: true, alreadyActioned: true, status: draft.status };
      }
      const newStatus = input.action === "approve" ? "approved" : "rejected";
      await updateDraftStatus(draft.id, newStatus, input.reviewNotes);
      return { success: true, alreadyActioned: false, status: newStatus, draftId: draft.id, changeEventId: draft.changeEventId };
    }),

    // Public endpoint — get draft info for the approval page (no login required, token-gated)
    getByToken: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
      const draft = await getDraftByApprovalToken(input.token);
      if (!draft) return null;
      const [doc, eventData] = await Promise.all([
        getDocumentById(draft.documentId),
        getChangeEventById(draft.changeEventId),
      ]);
      return { draft, document: doc, event: eventData ?? null };
    }),

    // Re-generate the modified file for an existing draft (useful when the original generation failed)
    reGenerateModifiedFile: protectedProcedure
      .input(z.object({ draftId: z.number() }))
      .mutation(async ({ input }) => {
        const draft = await getDraftById(input.draftId);
        if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
        const doc = await getDocumentById(draft.documentId);
        if (!doc?.fileUrl || !doc.fileName) throw new TRPCError({ code: "BAD_REQUEST", message: "Document has no file attached" });

        // Get the change event and its manual diff
        const event = await getChangeEventById(draft.changeEventId);
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Change event not found" });

        const assets = await getChangeAssetsByEventId(draft.changeEventId);
        const skus = await getSkuChangesByEventId(draft.changeEventId);

        let changesToApply: Array<{ fieldName: string; oldValue: string; newValue: string; unit?: string }> = [];

        // Try manual comparison first
        const oldManualAsset = assets.find(a => a.assetType === "manual_old" || a.assetType === "drawing_old");
        const newManualAsset = assets.find(a => a.assetType === "manual_new" || a.assetType === "drawing_new");
        if (oldManualAsset?.fileUrl && newManualAsset?.fileUrl) {
          try {
            const [oldText, newText] = await Promise.all([
              extractFileText(oldManualAsset.fileUrl, oldManualAsset.fileName),
              extractFileText(newManualAsset.fileUrl, newManualAsset.fileName),
            ]);
            const manualDiff = await compareManuals({
              oldManualText: oldText,
              newManualText: newText,
              oldFileName: oldManualAsset.fileName,
              newFileName: newManualAsset.fileName,
              changeEventTitle: event.title,
            });
            if (manualDiff.length > 0) changesToApply = manualDiff;
          } catch (e) {
            console.warn("[ReGenerate] Manual comparison failed:", e);
          }
        }

        // Fallback: use SKU parameters
        if (changesToApply.length === 0 && skus.length > 0) {
          changesToApply = skus.map(s => ({ fieldName: s.fieldName, oldValue: s.oldValue ?? "", newValue: s.newValue ?? "", unit: s.unit ?? undefined }));
        }

        // Fallback: use LLM to extract changes from the document content
        if (changesToApply.length === 0) {
          try {
            const docContent = await extractDocumentContent({ fileUrl: doc.fileUrl, fileName: doc.fileName, mimeType: doc.mimeType ?? "application/octet-stream" });
            const changeExtractionResponse = await invokeLLM({
              messages: [
                { role: "system", content: "You are an expert at identifying specific value changes in manufacturing documents. Return ONLY valid JSON." },
                { role: "user", content: `Change event: ${event.title}\n\nDocument content:\n${docContent.substring(0, 8000)}\n\nIdentify specific values that need to change. Return JSON: {"changes": [{"fieldName": "...", "oldValue": "...", "newValue": "...", "unit": "..."}]}` },
              ],
              response_format: { type: "json_schema", json_schema: { name: "changes", strict: true, schema: { type: "object", properties: { changes: { type: "array", items: { type: "object", properties: { fieldName: { type: "string" }, oldValue: { type: "string" }, newValue: { type: "string" }, unit: { type: "string" } }, required: ["fieldName", "oldValue", "newValue", "unit"], additionalProperties: false } } }, required: ["changes"], additionalProperties: false } } },
            });
            const parsed = JSON.parse(String(changeExtractionResponse.choices[0]?.message?.content ?? "{}")) as { changes: typeof changesToApply };
            changesToApply = (parsed.changes ?? []).filter(c => c.newValue && c.newValue.trim() !== "" && c.oldValue !== c.newValue);
          } catch (e) {
            console.warn("[ReGenerate] LLM extraction failed:", e);
          }
        }

        if (changesToApply.length === 0) {
          return { success: false, message: "No changes could be identified. Please upload old and new manuals to enable document modification." };
        }

        const modResult = await modifyDocument({
          fileUrl: doc.fileUrl,
          fileName: doc.fileName,
          mimeType: doc.mimeType ?? "application/octet-stream",
          documentName: doc.name,
          originalFileKey: doc.fileKey ?? "",
          changes: changesToApply,
        });
        await updateDraftModifiedFile(input.draftId, modResult.modifiedFileUrl, modResult.modifiedFileKey, JSON.stringify(modResult.changeLog));
        return { success: true, changesApplied: modResult.changesApplied, message: `Modified file generated with ${modResult.changesApplied} change(s) applied.` };
      }),
  }),
});

export type AppRouter = typeof appRouter;
