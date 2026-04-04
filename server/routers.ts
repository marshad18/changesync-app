import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import {
  createChangeEvent, listChangeEvents, getChangeEventById, updateChangeEventStatus,
  createChangeAsset, getChangeAssetsByEventId,
  createSkuChange, getSkuChangesByEventId, deleteSkuChange,
  createDocument, listDocuments, getDocumentById,
  createImpactAnalysis, getImpactAnalysesByEventId, updateImpactAnalysisStatus, deleteImpactAnalysesByEventId,
  createDocumentDraft, getDraftsByEventId, getDraftById, updateDraftStatus, updateDraftContent,
} from "./db";

function randomSuffix() { return Math.random().toString(36).substring(2, 10); }

const CHANGE_TYPE_LABELS: Record<string, string> = {
  hardware: "Hardware / Component Change", process: "Process / Method Change",
  material: "Raw Material / Ingredient Change", packaging: "Packaging / SKU Change",
  supplier: "Supplier / Vendor Change", regulatory: "Regulatory / Compliance Change",
  safety: "Safety Incident / Near-Miss", maintenance: "Maintenance Finding / Condition-Based Change",
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
      changeType: z.enum(["hardware","process","material","packaging","supplier","regulatory","safety","maintenance"]),
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
      assetType: z.enum(["drawing_old","drawing_new","photo_old","photo_new","sds","other"]),
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
      const prompt = `You are an expert manufacturing engineer analyzing the impact of an engineering change on plant documentation.\n\nCHANGE EVENT:\n- Title: ${event.title}\n- Change Type: ${changeTypeLabel}\n- Change Scope: ${event.changeScope ?? "substitution"}\n- Affected Equipment: ${event.affectedEquipment ?? "Not specified"}\n- Affected SKU: ${event.affectedSku ?? "Not specified"}\n- Text Notes: ${event.textNotes ?? "None"}\n- Parameter Changes: ${skuSummary}\n- Uploaded Assets: ${assetSummary}\n\nDOCUMENTS IN LIBRARY:\n${docList}\n\nTASK:\nFor each document listed above, determine whether it would be impacted by this engineering change. Return a JSON array where each element has:\n- documentId: number\n- impacted: boolean\n- confidence: "high" | "medium" | "low"\n- reasoning: string (1-2 sentences)\n- impactedSections: string (specific sections if impacted, else empty string)\n\nBe thorough and err on the side of inclusion.`;
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
      let draftsCreated = 0;
      for (const analysis of impactedAnalyses) {
        const doc = await getDocumentById(analysis.documentId);
        if (!doc) continue;
        const draftPrompt = `You are an expert manufacturing documentation writer. Generate updated content for a manufacturing document based on an engineering change.\n\nCHANGE EVENT:\n- Title: ${event.title}\n- Change Type: ${changeTypeLabel}\n- Affected Equipment: ${event.affectedEquipment ?? "Not specified"}\n- Affected SKU: ${event.affectedSku ?? "Not specified"}\n- Text Notes: ${event.textNotes ?? "None"}\n- Parameter Changes: ${skuSummary}\n\nDOCUMENT TO UPDATE:\n- Name: ${doc.name}\n- Code: ${doc.code ?? "N/A"}\n- Category: ${doc.category ?? "Unknown"}\n- Owner: ${doc.owner ?? "Unknown"}\n\nSECTIONS TO UPDATE:\n${analysis.impactedSections ?? "Review all sections"}\n\nIMPACT REASONING:\n${analysis.reasoning}\n\nGenerate a clear, professional summary of the specific changes that need to be made to this document. Format your response as:\n\n## Changes Required for ${doc.name}\n\n### Summary\n[Brief overview]\n\n### Specific Updates Required\n[Detailed list of changes by section]\n\n### New Content / Values\n[New values, procedures, or content]\n\n### Verification Checklist\n[Items the approver should verify]`;
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
  }),
});

export type AppRouter = typeof appRouter;
