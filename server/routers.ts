import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PDFParse } from "pdf-parse";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { modifyDocument, extractDocumentContent } from "./documentModifier";
import { compareManuals, extractFileText } from "./manualComparison";
import { listGitHubSampleDocs, downloadGitHubFile } from "./github";
import { sdk } from "./_core/sdk";
import { sendApproverEmail } from "./emailHelper";
import {
  createChangeEvent, listChangeEvents, getChangeEventById, updateChangeEventStatus, updateChangeEventManualDiff,
  createChangeAsset, getChangeAssetsByEventId,
  createSkuChange, getSkuChangesByEventId, deleteSkuChange,
  createDocument, listDocuments, getDocumentById,
  createImpactAnalysis, getImpactAnalysesByEventId, updateImpactAnalysisStatus, deleteImpactAnalysesByEventId,
  createDocumentDraft, getDraftsByEventId, getDraftById, getDraftByImpactAnalysisId, updateDraftStatus, updateDraftContent, updateDraftModifiedFile,
  getDraftByApprovalToken,
  getUserByEmail, createEmailUser, updateUserPasswordHash, setPasswordResetToken, getUserByResetToken, updateUserLastSignedIn,
  listUsers, updateUserRole, adminResetUserPassword,
  getAppSetting, setAppSetting,
  createDocumentVersion, getDocumentVersions, getLatestVersionNumber,
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
    list: publicProcedure.query(async () => listChangeEvents()),

    getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
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

    create: publicProcedure.input(z.object({
      title: z.string().min(1),
      changeType: z.enum(["hardware","process","material","packaging","supplier","regulatory","safety","maintenance","part_change","weight_change","price_change"]),
      partSubType: z.enum(["manual","drawing","image"]).optional(),
      changeScope: z.enum(["substitution","upgrade","new_introduction"]).optional(),
      affectedEquipment: z.string().optional(),
      affectedSku: z.string().optional(),
      textNotes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await createChangeEvent({ ...input, createdBy: ctx.user?.id ?? 0, status: "draft" });
      const events = await listChangeEvents();
      return events[0];
    }),

    uploadAsset: publicProcedure.input(z.object({
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

    addSkuChange: publicProcedure.input(z.object({
      changeEventId: z.number(), fieldName: z.string().min(1),
      oldValue: z.string().optional(), newValue: z.string().optional(), unit: z.string().optional(),
    })).mutation(async ({ input }) => {
      await createSkuChange(input);
      return getSkuChangesByEventId(input.changeEventId);
    }),

    removeSkuChange: publicProcedure.input(z.object({ id: z.number(), changeEventId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSkuChange(input.id);
        return getSkuChangesByEventId(input.changeEventId);
      }),

    analyzeImpact: publicProcedure.input(z.object({ changeEventId: z.number() })).mutation(async ({ input }) => {
      const event = await getChangeEventById(input.changeEventId);
      if (!event) throw new Error("Change event not found");
      const selectedModel = await getAppSetting("llm_model", "gemini-2.5-flash");
      await updateChangeEventStatus(input.changeEventId, "analyzing");
      const [assets, skus, allDocs] = await Promise.all([
        getChangeAssetsByEventId(input.changeEventId), getSkuChangesByEventId(input.changeEventId), listDocuments(),
      ]);
      if (allDocs.length === 0) { await updateChangeEventStatus(input.changeEventId, "analysis_complete"); return { analysesCreated: 0 }; }
      await deleteImpactAnalysesByEventId(input.changeEventId);
      const changeTypeLabel = CHANGE_TYPE_LABELS[event.changeType] || event.changeType;
      const skuSummary = skus.length > 0 ? skus.map(s => `${s.fieldName}: ${s.oldValue ?? "N/A"} → ${s.newValue ?? "N/A"}${s.unit ? " "+s.unit : ""}`).join("; ") : "None";
      const assetSummary = assets.length > 0 ? assets.map(a => `${a.assetType}: ${a.fileName}`).join(", ") : "None";

      // ── STEP 1: Extract old values to search for (from SKU changes) ──────────
      // Build a list of search terms from the old values in the change event.
      // For weight/price changes, the old value (e.g. "155g", "155gm") is the key.
      const searchTerms: string[] = [];
      for (const sku of skus) {
        if (sku.oldValue && sku.oldValue.trim()) {
          const base = sku.oldValue.trim();
          searchTerms.push(base);
          // Also try with unit appended (e.g. "155" + "g" = "155g")
          if (sku.unit && sku.unit.trim()) {
            searchTerms.push(`${base}${sku.unit.trim()}`);
            searchTerms.push(`${base} ${sku.unit.trim()}`);
            // Try with 'm' suffix for grams (155g → 155gm)
            if (sku.unit.trim().toLowerCase() === "g") {
              searchTerms.push(`${base}gm`);
              searchTerms.push(`${base} gm`);
            }
          }
          // Try without trailing unit if value already contains it
          const numericOnly = base.replace(/[^0-9.]/g, "");
          if (numericOnly && numericOnly !== base) searchTerms.push(numericOnly);
        }
      }
      // Also add text notes keywords for part changes
      if (event.changeType === "part_change" && event.textNotes) {
        const noteWords = event.textNotes.split(/\s+/).filter(w => w.length > 4);
        searchTerms.push(...noteWords.slice(0, 5));
      }

      // ── For part_change with uploaded manuals: FULLY DETERMINISTIC impact analysis ──
      // When old and new manuals are uploaded, we compare them to get the exact diff.
      // The diff tells us WHICH document types are affected:
      //   - Lubricant name / qty / frequency changed → ONLY Lube Map documents are impacted
      //   - All other document types are NOT impacted by a lubrication-only change
      // We do NOT use search-term scanning (which would flag any doc containing "Omala 220")
      // and we do NOT use the LLM for impact scoring on Part Changes with manuals.
      let partChangeManualDiff: Array<{ fieldName: string; oldValue: string; newValue: string; documentCategory: string }> = [];
      let hasPartChangeManuals = false;
      if (event.changeType === "part_change") {
        try {
          const oldManualAsset = assets.find(a => a.assetType === "manual_old" || a.assetType === "drawing_old");
          const newManualAsset = assets.find(a => a.assetType === "manual_new" || a.assetType === "drawing_new");
          if (oldManualAsset?.fileUrl && newManualAsset?.fileUrl) {
            hasPartChangeManuals = true;
            const { extractFileText: extractFT, compareManuals: cm } = await import("./manualComparison");
            const [oldText, newText] = await Promise.all([
              extractFT(oldManualAsset.fileUrl, oldManualAsset.fileName),
              extractFT(newManualAsset.fileUrl, newManualAsset.fileName),
            ]);
            const manualChanges = await cm({
              oldManualText: oldText,
              newManualText: newText,
              oldFileName: oldManualAsset.fileName,
              newFileName: newManualAsset.fileName,
              changeEventTitle: event.title,
            });
            partChangeManualDiff = manualChanges.map(c => ({
              fieldName: c.fieldName,
              oldValue: c.oldValue,
              newValue: c.newValue,
              documentCategory: c.documentCategory ?? "Lube Map",
            }));
            console.log(`[ImpactAnalysis] Part Change manual diff: ${partChangeManualDiff.length} changes:`, partChangeManualDiff.map(c => `${c.fieldName}: "${c.oldValue}" → "${c.newValue}" (${c.documentCategory})`).join(", "));
          }
        } catch (manualScanErr) {
          console.warn("[ImpactAnalysis] Could not compare manuals for part_change:", manualScanErr);
        }
      }

      // Helper: is this document a Lube Map?
      const isLubeMapDoc = (doc: typeof allDocs[0]): boolean => {
        const name = (doc.name ?? "").toLowerCase();
        const code = (doc.code ?? "").toLowerCase();
        const file = (doc.fileName ?? "").toLowerCase();
        return name.includes("lube") || name.includes("lubric") || name.includes("lubrication") ||
               code.includes("lube") || file.includes("lubemap") || file.includes("lubricationmap");
      };

      // If we have a manual diff, use it as the sole source of truth for impact analysis.
      // SCAN ALL DOCUMENTS for old values before flagging — only flag documents that
      // actually contain the affected equipment AND the old values being changed.
      if (hasPartChangeManuals && partChangeManualDiff.length > 0) {
        const affEquip = (event.affectedEquipment ?? "").trim();
        const equipKws = buildEquipmentKeywords(affEquip);

        // Collect old values from the manual diff as search terms
        const diffOldValues = partChangeManualDiff
          .map(c => c.oldValue.trim().toLowerCase())
          .filter(v => v.length > 0);

        // Scan ALL documents in the library for content matching
        const scanResults = await Promise.all(
          allDocs.map(async (doc) => {
            if (!doc.fileUrl || !doc.fileName) return { docId: doc.id, text: "", hasEquipment: false, hasOldValues: false, matchedValues: [] as string[] };
            let text = "";
            try {
              const isPdf = doc.mimeType === "application/pdf" || doc.fileName.endsWith(".pdf");
              if (isPdf) {
                const res = await fetch(doc.fileUrl);
                if (!res.ok) return { docId: doc.id, text: "", hasEquipment: false, hasOldValues: false, matchedValues: [] as string[] };
                const buf = Buffer.from(await res.arrayBuffer());
                const parser = new PDFParse({ data: Buffer.from(buf) });
                const result = await parser.getText();
                await parser.destroy();
                text = result.text;
              } else {
                text = await extractDocumentContent({ fileUrl: doc.fileUrl, fileName: doc.fileName, mimeType: doc.mimeType ?? "application/octet-stream" });
              }
            } catch (e) {
              console.warn(`[ImpactAnalysis] Could not extract text from ${doc.name}:`, e);
            }
            const lowerText = text.toLowerCase();
            // Check if document contains the affected equipment
            const hasEquipment = equipKws.length === 0 || equipKws.some(kw => lowerText.includes(kw));
            // Check if document contains any of the old values from the manual diff
            const matchedValues = diffOldValues.filter(v => lowerText.includes(v));
            return { docId: doc.id, text, hasEquipment, hasOldValues: matchedValues.length > 0, matchedValues };
          })
        );

        let count = 0;
        const changedFields = partChangeManualDiff
          .map(c => `${c.fieldName}: "${c.oldValue}" → "${c.newValue}"`);

        for (const result of scanResults) {
          const doc = allDocs.find(d => d.id === result.docId)!;
          // A document is impacted ONLY if it contains both the equipment reference AND at least one old value
          if (result.hasEquipment && result.hasOldValues) {
            await createImpactAnalysis({
              changeEventId: input.changeEventId,
              documentId: doc.id,
              impacted: true,
              confidence: "high",
              reasoning: `Document scanned: contains ${affEquip || "equipment"} reference and old value(s) [${result.matchedValues.join(", ")}]. Manual comparison found ${changedFields.length} change(s): ${changedFields.join("; ")}. The ${affEquip || "equipment"} rows in this document will be updated.`,
              impactedSections: `${affEquip || "Equipment"} rows — ${changedFields.join("; ")}`,
              status: "pending",
            });
          } else {
            // Document does NOT contain the affected equipment or old values — not impacted
            const reason = !result.hasEquipment
              ? `Document scanned: does not contain any reference to "${affEquip}". Not impacted by this change.`
              : `Document scanned: contains equipment reference but none of the old values [${diffOldValues.join(", ")}] were found in the document content. Not impacted.`;
            await createImpactAnalysis({
              changeEventId: input.changeEventId,
              documentId: doc.id,
              impacted: false,
              confidence: "high",
              reasoning: reason,
              impactedSections: "",
              status: "pending",
            });
          }
          count++;
        }
        console.log(`[ImpactAnalysis] Part Change with manuals: scanned ${count} docs, flagged ${scanResults.filter(r => r.hasEquipment && r.hasOldValues).length} as impacted`);
        await updateChangeEventStatus(input.changeEventId, "analysis_complete");
        return { analysesCreated: count };
      }

      // ── FALLBACK: No manuals uploaded — use search-term scanning + LLM ──────────
      // This path handles weight changes, price changes, and part changes without manuals.
      const uniqueSearchTerms = Array.from(new Set(searchTerms.map(t => t.toLowerCase())));
      console.log(`[ImpactAnalysis] Fallback path — searching for terms in ${allDocs.length} documents:`, uniqueSearchTerms);

      // ── STEP 2: Scan each document's text content for the old value ──────────
      // For Part Changes, we do equipment-aware matching:
      //   - For Excel files: a match only counts if the search term appears in the SAME ROW
      //     as the affected equipment name. This prevents flagging Driver Roller rows when
      //     the change is for the Gearbox.
      //   - For PDF/Word: require both the search term AND the equipment name to appear
      //     in the document text.
      // For Weight/Price changes: plain text match is sufficient (no equipment scoping needed).

      // Build equipment keywords from affectedEquipment field.
      // We also generate normalised variants (e.g. "gear box" ↔ "gearbox") so that
      // a document containing either spelling is correctly matched.
      const affectedEquipmentRaw = (event.affectedEquipment ?? "").trim();
      function buildEquipmentKeywords(raw: string): string[] {
        if (!raw) return [];
        const base = raw.toLowerCase();
        const words = base.split(/[\s,\/\-]+/).filter(w => w.length > 2);
        // Add compound variants: "gear box" → also try "gearbox", and vice-versa
        const extras: string[] = [];
        const joined = words.join(""); // "gear" + "box" → "gearbox"
        if (joined !== words.join(" ")) extras.push(joined);
        const spaced = base.replace(/([a-z])([A-Z])/g, "$1 $2"); // camelCase → spaced
        if (spaced !== base) extras.push(spaced.toLowerCase());
        // Also add the full raw string normalised
        extras.push(base);
        return Array.from(new Set([...words, ...extras]));
      }
      const equipmentKeywords: string[] = buildEquipmentKeywords(affectedEquipmentRaw);
      const isPartChange = event.changeType === "part_change";

      /**
       * Check if a document row (from extractDocumentContent Excel output) references
       * the affected equipment. Returns true if any equipment keyword appears in the row.
       */
      function rowReferencesEquipment(rowLine: string): boolean {
        if (equipmentKeywords.length === 0) return true; // no equipment specified — accept all rows
        const lowerRow = rowLine.toLowerCase();
        return equipmentKeywords.some(kw => lowerRow.includes(kw));
      }

      /**
       * For an Excel document (text extracted as "Row N: col1 | col2 | ..."),
       * check if any row contains BOTH a search term AND the equipment keyword.
       * Returns the matched terms that appear in equipment-relevant rows.
       */
      function equipmentAwareExcelMatch(text: string): string[] {
        if (!isPartChange || equipmentKeywords.length === 0) {
          // No equipment scoping — fall back to plain text match
          const lowerText = text.toLowerCase();
          return uniqueSearchTerms.filter(term => lowerText.includes(term));
        }
        const matched = new Set<string>();
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("Row ")) continue;
          const lowerLine = line.toLowerCase();
          if (!rowReferencesEquipment(lowerLine)) continue;
          // This row is for the affected equipment — check if any search term appears
          for (const term of uniqueSearchTerms) {
            if (lowerLine.includes(term)) matched.add(term);
          }
        }
        return Array.from(matched);
      }

      /**
       * For PDF/Word documents in a Part Change, require that the document text
       * contains at least one equipment keyword alongside the search term.
       * This prevents flagging a Driver Roller SOP just because it mentions "220".
       */
      function equipmentAwarePdfWordMatch(text: string): string[] {
        const lowerText = text.toLowerCase();
        const termMatches = uniqueSearchTerms.filter(term => lowerText.includes(term));
        if (termMatches.length === 0) return [];
        if (!isPartChange || equipmentKeywords.length === 0) return termMatches;
        // Require at least one equipment keyword to also appear in the document
        const hasEquipment = equipmentKeywords.some(kw => lowerText.includes(kw));
        return hasEquipment ? termMatches : [];
      }

      interface DocTextResult {
        docId: number;
        text: string;
        containsOldValue: boolean;
        matchedTerms: string[];
      }
      const docTextResults: DocTextResult[] = await Promise.all(
        allDocs.map(async (doc) => {
          if (!doc.fileUrl || !doc.fileName) return { docId: doc.id, text: "", containsOldValue: false, matchedTerms: [] };
          let text = "";
          try {
            const res = await fetch(doc.fileUrl);
            if (!res.ok) return { docId: doc.id, text: "", containsOldValue: false, matchedTerms: [] };
            const arrayBuf = await res.arrayBuffer();
            const buf = Buffer.from(arrayBuf);
            const isPdf = doc.mimeType === "application/pdf" || doc.fileName.endsWith(".pdf");
            if (isPdf) {
              const parser = new PDFParse({ data: Buffer.from(buf) });
              const pdfResult = await parser.getText();
              await parser.destroy();
              text = pdfResult.text;
            } else {
              // For Excel/Word, use extractDocumentContent
              text = await extractDocumentContent({ fileUrl: doc.fileUrl, fileName: doc.fileName, mimeType: doc.mimeType ?? "application/octet-stream" });
            }
          } catch (e) {
            console.warn(`[ImpactAnalysis] Could not extract text from ${doc.name}:`, e);
          }

          // Equipment-aware matching
          const isExcel = doc.mimeType?.includes("spreadsheet") || doc.mimeType?.includes("excel") ||
                          doc.fileName.endsWith(".xlsx") || doc.fileName.endsWith(".xls");
          let matchedTerms: string[];
          if (isExcel) {
            matchedTerms = equipmentAwareExcelMatch(text);
          } else {
            matchedTerms = equipmentAwarePdfWordMatch(text);
          }

          return { docId: doc.id, text: text.substring(0, 3000), containsOldValue: matchedTerms.length > 0, matchedTerms };
        })
      );

      // ── STEP 3: Auto-mark docs containing old value; pass the rest to LLM ───
      // For weight/price changes, exclude document types that are structurally irrelevant.
      // A product weight change cannot affect lubrication maps, safety maps, CPE docs, HTRA maps,
      // fastener maps, MTM studies, workplace analyses, or PM plans — these documents govern
      // equipment operation and maintenance, not product specifications.
      const WEIGHT_PRICE_EXCLUDED_CODES = new Set(["LUBE Map", "Safety Map", "CPE", "HTRA Map", "Fastener Map", "MTM", "WPA", "PM Plan", "CIL", "SOC Map", "AM Step 3/4/5"]);
      const isWeightOrPrice = event.changeType === "weight_change" || event.changeType === "price_change";

      function isDocExcludedForChangeType(doc: typeof allDocs[0]): boolean {
        if (!isWeightOrPrice) return false;
        const code = (doc.code ?? "").trim();
        const name = (doc.name ?? "").toLowerCase();
        if (WEIGHT_PRICE_EXCLUDED_CODES.has(code)) return true;
        // Also exclude by name patterns
        if (name.includes("lube") || name.includes("lubric")) return true;
        if (name.includes("safety map")) return true;
        if (name.includes("centerline")) return true;
        if (name.includes("htra") || name.includes("hazard")) return true;
        if (name.includes("fastener")) return true;
        if (name.includes("methods-time") || name.includes("mtm")) return true;
        if (name.includes("workplace analysis")) return true;
        if (name.includes("preventative maintenance") || name.includes("pm plan")) return true;
        if (name.includes("autonomous maintenance")) return true;
        if (name.includes("clean, inspect") || name.includes("cil")) return true;
        if (name.includes("standard operating conditions") || name.includes("soc map")) return true;
        return false;
      }

      // ── For weight changes: always flag Line Clearance / Changeover SOPs ────
      // These documents contain the product weight as a verification checkpoint
      // (operators verify the correct weight during line clearance). They must
      // always be updated when the product weight changes, regardless of whether
      // the old value string appears literally in the document text.
      function isLineClearanceDoc(doc: typeof allDocs[0]): boolean {
        if (event!.changeType !== "weight_change") return false;
        const name = (doc.name ?? "").toLowerCase();
        const code = (doc.code ?? "").toLowerCase();
        return name.includes("line clearance") || name.includes("lineclearance") ||
               name.includes("changeover") || code.includes("line clearance") ||
               code.includes("lineclearance") || code.includes("changeover");
      }

      // ── For weight changes: exclude documents that are change records/templates ─
      // Documents whose name contains "weight change" are records of the change itself,
      // not operational documents that need updating.
      function isChangeRecordDoc(doc: typeof allDocs[0]): boolean {
        if (event!.changeType !== "weight_change") return false;
        const name = (doc.name ?? "").toLowerCase();
        return name.includes("weight change") || name.includes("change record") ||
               name.includes("change form") || name.includes("change request");
      }

      const autoImpacted = docTextResults.filter(r => {
        if (!r.containsOldValue) return false;
        const doc = allDocs.find(d => d.id === r.docId)!;
        if (isDocExcludedForChangeType(doc)) return false;
        if (isChangeRecordDoc(doc)) return false; // exclude change record docs
        return true;
      });
      // Also add line clearance docs as always-impacted for weight changes
      const alwaysImpacted = allDocs.filter(doc => {
        if (isLineClearanceDoc(doc)) return true;
        return false;
      });
      const alwaysImpactedIds = new Set(alwaysImpacted.map(d => d.id));
      const autoImpactedIds = new Set(autoImpacted.map(r => r.docId));

      const needsLLM = docTextResults.filter(r => {
        if (r.containsOldValue) return false; // already handled by autoImpacted
        if (alwaysImpactedIds.has(r.docId)) return false; // already handled by alwaysImpacted
        const doc = allDocs.find(d => d.id === r.docId)!;
        if (isDocExcludedForChangeType(doc)) return false; // excluded — mark as not impacted
        if (isChangeRecordDoc(doc)) return false; // change records don't need LLM assessment
        return true;
      });
      // Docs excluded by change type — save as not impacted immediately
      const excludedByType = docTextResults.filter(r => {
        const doc = allDocs.find(d => d.id === r.docId)!;
        return isDocExcludedForChangeType(doc) || isChangeRecordDoc(doc);
      });
      console.log(`[ImpactAnalysis] Auto-impacted (text match): ${autoImpacted.length} docs, always-impacted (rule): ${alwaysImpacted.length} docs, sending ${needsLLM.length} to LLM`);

      // Build change-type-specific context
      let changeContext = "";
      if (event.changeType === "part_change") {
        changeContext = `This is a Part Change. The sub-type is: ${event.partSubType ?? "unspecified"} (manual or drawing replacement). Old and new ${event.partSubType ?? "documents"} have been uploaded.`;
      } else if (event.changeType === "weight_change") {
        changeContext = `This is a Weight Change. The product weight has changed from ${skus.map(s => s.oldValue).join("/")} to ${skus.map(s => s.newValue).join("/")}. Any document referencing the old weight value must be updated.`;
      } else if (event.changeType === "price_change") {
        changeContext = `This is a Price Change. The product price has changed. Any document referencing the old price must be updated.`;
      }

      // ── STEP 4: LLM analysis for remaining documents (with text snippets) ───
      let llmAnalyses: Array<{ documentId: number; impacted: boolean; confidence: "high"|"medium"|"low"; reasoning: string; impactedSections: string }> = [];
      if (needsLLM.length > 0) {
        const docListWithText = needsLLM.map(r => {
          const doc = allDocs.find(d => d.id === r.docId)!;
          const textSnippet = r.text ? `\n   TEXT EXCERPT: "${r.text.substring(0, 400).replace(/\n/g, " ")}"` : "";
          return `ID ${doc.id}: ${doc.code ? "["+doc.code+"] " : ""}${doc.name} (Category: ${doc.category ?? "Unknown"}, Owner: ${doc.owner ?? "Unknown"})${textSnippet}`;
        }).join("\n\n");

        const prompt = `You are a senior manufacturing engineer performing a rigorous document impact assessment for an engineering change.

CHANGE EVENT:
- Title: ${event.title}
- Change Type: ${changeTypeLabel}
- Context: ${changeContext}
- Change Scope: ${event.changeScope ?? "substitution"}
- Affected Equipment: ${event.affectedEquipment ?? "Not specified"}
- Affected SKU: ${event.affectedSku ?? "Not specified"}
- Text Notes: ${event.textNotes ?? "None"}
- Parameter Changes: ${skuSummary}
- Uploaded Assets: ${assetSummary}

DOCUMENTS TO ASSESS (with text excerpts):
${docListWithText}

INSTRUCTIONS:
For each document above, determine if it is impacted by this engineering change. A document is impacted if:
1. It contains values that reference the changed parameter (weight, price, part number, etc.)
2. It contains procedures or specifications that would be affected by this change
3. It is a regulatory, safety, or compliance document that must reflect the new state

IMPORTANT SCOPING RULES FOR THIS CHANGE TYPE:
${isWeightOrPrice
  ? `This is a ${changeTypeLabel}. ONLY flag a document as impacted if it literally contains or references the product weight/price value. Do NOT flag lubrication maps, safety maps, equipment manuals, CPE documents, maintenance procedures, or any document that governs equipment operation — those are irrelevant to a product weight or price change. Be conservative and precise.`
  : isPartChange && affectedEquipmentRaw
    ? `This is a Part Change for the equipment: "${affectedEquipmentRaw}". ONLY flag a document as impacted if it specifically references "${affectedEquipmentRaw}" or contains values that are specific to this equipment. Do NOT flag documents for other equipment types (e.g. Driver Roller, Conveyor, Motor) just because they share a numeric value or general term. Be equipment-specific and precise.`
    : `Be thorough — err on the side of inclusion. If in doubt, mark as impacted with medium confidence.`}

Return JSON with an "analyses" array where each element has:
- documentId: number (exact ID from the list above)
- impacted: boolean
- confidence: "high" | "medium" | "low"
- reasoning: string (1-2 sentences — be specific about WHY this document is or is not impacted)
- impactedSections: string (specific sections/fields to update if impacted, else empty string)`;

        const response = await invokeLLM({
          model: selectedModel,
          messages: [
            { role: "system", content: "You are a senior manufacturing engineer. Always respond with valid JSON only. Never hallucinate document IDs — only use the IDs provided." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_schema", json_schema: { name: "impact_analysis", strict: true, schema: { type: "object", properties: { analyses: { type: "array", items: { type: "object", properties: { documentId: { type: "integer" }, impacted: { type: "boolean" }, confidence: { type: "string", enum: ["high","medium","low"] }, reasoning: { type: "string" }, impactedSections: { type: "string" } }, required: ["documentId","impacted","confidence","reasoning","impactedSections"], additionalProperties: false } } }, required: ["analyses"], additionalProperties: false } } },
        });
        const content = String(response.choices[0]?.message?.content ?? "");
        if (content) {
          try {
            const parsed = JSON.parse(content) as { analyses: typeof llmAnalyses };
            llmAnalyses = parsed.analyses ?? [];
          } catch (e) {
            console.warn("[ImpactAnalysis] Failed to parse LLM response:", e);
          }
        }
      }

      // ── STEP 5: Save all analyses to DB ──────────────────────────────────────
      let count = 0;
      // Excluded by change type — save as not impacted
      for (const r of excludedByType) {
        await createImpactAnalysis({
          changeEventId: input.changeEventId,
          documentId: r.docId,
          impacted: false,
          confidence: "high",
          reasoning: `This document type is not relevant to a ${changeTypeLabel} — it governs equipment operation/maintenance, not product specifications.`,
          impactedSections: "",
          status: "pending",
        });
        count++;
      }
      // Always-impacted by rule (e.g. Line Clearance for weight changes)
      for (const doc of alwaysImpacted) {
        // Skip if already covered by text match
        if (autoImpactedIds.has(doc.id)) continue;
        await createImpactAnalysis({
          changeEventId: input.changeEventId,
          documentId: doc.id,
          impacted: true,
          confidence: "high",
          reasoning: `Line Clearance / Changeover documents always require updating when the product weight changes — operators verify the correct weight during line clearance and changeover procedures.`,
          impactedSections: `Weight verification checkpoints — update old weight value to new value throughout`,
          status: "pending",
        });
        count++;
      }
      // Auto-impacted (text match)
      for (const r of autoImpacted) {
        const matchedStr = r.matchedTerms.join(", ");
        await createImpactAnalysis({
          changeEventId: input.changeEventId,
          documentId: r.docId,
          impacted: true,
          confidence: "high",
          reasoning: `Document text contains the exact old value ("${matchedStr}") — automatically flagged as impacted.`,
          impactedSections: `All sections referencing ${matchedStr}`,
          status: "pending",
        });
        count++;
      }
      // LLM-assessed
      for (const analysis of llmAnalyses) {
        // Validate documentId is in our list
        if (!allDocs.find(d => d.id === analysis.documentId)) continue;
        await createImpactAnalysis({
          changeEventId: input.changeEventId,
          documentId: analysis.documentId,
          impacted: analysis.impacted,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          impactedSections: analysis.impactedSections,
          status: "pending",
        });
        count++;
      }
      // For any docs that weren't covered by either path, add a non-impacted entry
      const coveredIds = new Set([
        ...alwaysImpacted.map(d => d.id),
        ...autoImpacted.map(r => r.docId),
        ...llmAnalyses.map(a => a.documentId),
      ]);
      for (const doc of allDocs) {
        if (!coveredIds.has(doc.id)) {
          await createImpactAnalysis({
            changeEventId: input.changeEventId,
            documentId: doc.id,
            impacted: false,
            confidence: "low",
            reasoning: "Document was not assessed by LLM (possibly due to large library size). Marked as not impacted by default — review manually if needed.",
            impactedSections: "",
            status: "pending",
          });
          count++;
        }
      }

      await updateChangeEventStatus(input.changeEventId, "analysis_complete");
      return { analysesCreated: count };
    }),

    generateDrafts: publicProcedure.input(z.object({ changeEventId: z.number() })).mutation(async ({ input }) => {
      const event = await getChangeEventById(input.changeEventId);
      if (!event) throw new Error("Change event not found");
      const selectedModel = await getAppSetting("llm_model", "gemini-2.5-flash");
      await updateChangeEventStatus(input.changeEventId, "generating_drafts");
      const [skus, analyses] = await Promise.all([getSkuChangesByEventId(input.changeEventId), getImpactAnalysesByEventId(input.changeEventId)]);
      // All impacted analyses are processed — no manual confirmation step required
      const impactedAnalyses = analyses.filter(a => a.impacted);
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
      // --- Resolve effective equipment name ---
      // If the user didn't fill in affectedEquipment, try to infer it from the event title.
      // Common patterns: "Gear Box Change", "Gearbox Replacement", "Motor Gear Box Update"
      // We extract the equipment noun by stripping trailing change-type words.
      function inferEquipmentFromTitle(title: string): string {
        if (!title) return "";
        // Remove trailing change-type words (case-insensitive)
        const cleaned = title
          .replace(/\b(change|replacement|update|upgrade|swap|fix|repair|modification|mod|rev|revision|install|installation)\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        return cleaned;
      }
      // For weight/price changes, equipment scoping is irrelevant — the change applies
      // to all rows in the document (e.g. every row in the Line Clearance table that
      // contains the old weight value). Do NOT infer equipment from the title for these
      // change types, as it would incorrectly restrict the row guard.
      const isWeightOrPriceChange = event.changeType === "weight_change" || event.changeType === "price_change";
      const effectiveEquipment = isWeightOrPriceChange
        ? ""  // no equipment constraint for weight/price changes
        : (event.affectedEquipment ?? "").trim() || inferEquipmentFromTitle(event.title);

      // --- Step 0: If old and new manuals are uploaded, compare them to get a precise diff ---
      // This is the primary source of truth for what changed.
      // All affected Document Library files will be modified using this diff.
      let manualDiff: Array<{ fieldName: string; oldValue: string; newValue: string; unit?: string; documentCategory?: string }> = [];
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
          // Persist the diff so the UI can display it on the Change Detail page
          if (manualDiff.length > 0) {
            await updateChangeEventManualDiff(input.changeEventId, JSON.stringify(manualDiff));
          }
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
        const draftResponse = await invokeLLM({ model: selectedModel, messages: [{ role: "system", content: "You are an expert manufacturing documentation writer." }, { role: "user", content: draftPrompt }] });
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
                // Filter changes to only those relevant to this specific document's category.
                // Each ChangeEntry has a documentCategory field (e.g. "Lube Map", "Safety Map", "All").
                // We match the document's category against the change's documentCategory so that
                // lubrication changes only go to Lube Maps, safety changes only to Safety Maps, etc.
                const docCategory = (doc.category ?? "").toLowerCase();
                const docName = (doc.name ?? "").toLowerCase();
                const docFileName = (doc.fileName ?? "").toLowerCase();
                changesToApply = manualDiff.filter(c => {
                  const cat = (c.documentCategory ?? "All").toLowerCase();
                  if (cat === "all" || cat === "") return true;

                  // Match by explicit category name
                  if (cat.includes("lube") || cat.includes("lubrication")) {
                    // A Lube Map document: name contains "lube", "lubric", "lubrication map"
                    // OR file name contains "lubemap", "lubricationmap"
                    // OR category is "Maintenance" AND name contains "map"
                    return docName.includes("lube") || docName.includes("lubric") ||
                           docFileName.includes("lubemap") || docFileName.includes("lubricationmap") ||
                           (docCategory.includes("maintenance") && docName.includes("map"));
                  }
                  if (cat.includes("safety")) {
                    return docName.includes("safety") || docName.includes("htra") ||
                           docFileName.includes("safety") ||
                           docCategory.includes("safety");
                  }
                  if (cat.includes("pm plan") || cat.includes("preventive") || cat.includes("preventative")) {
                    return docName.includes("pm") || docName.includes("preventat") ||
                           docName.includes("preventive") || docName.includes("fastener") ||
                           docFileName.includes("pmplan") || docCategory.includes("maintenance");
                  }
                  if (cat.includes("cpe") || cat.includes("soc") || cat.includes("operations")) {
                    return docName.includes("cpe") || docName.includes("soc") ||
                           docName.includes("centerline") || docCategory.includes("engineering") ||
                           docCategory.includes("operations");
                  }
                  // Fallback: include if category keywords appear in doc name or filename
                  return docName.includes(cat) || docCategory.includes(cat) || docFileName.includes(cat);
                });
                console.log(`[DocumentModifier] Filtered to ${changesToApply.length}/${manualDiff.length} changes for ${doc.name} (category: ${doc.category})`);
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
                  model: selectedModel,
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
                  affectedEquipment: effectiveEquipment || undefined,
                });
                await updateDraftModifiedFile(
                  latestDraft.id,
                  modResult.modifiedFileUrl,
                  modResult.modifiedFileKey,
                  JSON.stringify(modResult.changeLog),
                  modResult.annotatedOriginalUrl,
                  modResult.annotatedOriginalKey,
                  modResult.cleanModifiedUrl,
                  modResult.cleanModifiedKey,
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
    list: publicProcedure.query(async () => listDocuments()),
    getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => getDocumentById(input.id)),
    upload: publicProcedure.input(z.object({
      name: z.string().min(1), code: z.string().optional(),
      category: z.enum(["Operator","Engineering","Safety","Operations","Maintenance"]).optional(),
      owner: z.string().optional(), fileName: z.string(), mimeType: z.string(), fileDataBase64: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileDataBase64, "base64");
      const fileKey = `documents/${randomSuffix()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      const insertResult = await createDocument({ name: input.name, code: input.code, category: input.category, owner: input.owner, fileUrl: url, fileKey, fileName: input.fileName, mimeType: input.mimeType, uploadedBy: ctx.user?.id ?? 0, version: 1 });
      // Record version 1 in version history
      const docId = (insertResult as { insertId?: number })?.insertId;
      if (docId) {
        await createDocumentVersion({
          documentId: docId,
          versionNumber: 1,
          fileUrl: url,
          fileKey,
          fileName: input.fileName,
          mimeType: input.mimeType,
          changeNote: "Initial upload",
          uploadedBy: ctx.user?.id ?? 0,
          uploadedByName: ctx.user?.name ?? ctx.user?.email ?? "Unknown",
        });
      }
      return listDocuments();
    }),
    getVersionHistory: publicProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ input }) => {
        return getDocumentVersions(input.documentId);
      }),
  }),

  github: router({
    // List all files available in the repo's sample-documents folder
    listSampleDocs: publicProcedure.query(async () => {
      const files = await listGitHubSampleDocs();
      // Get existing docs to mark already-imported ones
      const existing = await listDocuments();
      const existingNames = new Set(existing.map(d => d.fileName));
      return files.map(f => ({ ...f, alreadyImported: existingNames.has(f.name) }));
    }),

    // Import selected files from GitHub into the Document Library
    importFiles: publicProcedure.input(z.object({
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

          const insertResult = await createDocument({
            name: displayName,
            code,
            category,
            owner: undefined,
            fileUrl: url,
            fileKey,
            fileName: file.name,
            mimeType: file.mimeType,
            uploadedBy: ctx.user?.id ?? 0,
            version: 1,
          });
          // Record version 1 in version history
          const docId = (insertResult as { insertId?: number })?.insertId;
          if (docId) {
            await createDocumentVersion({
              documentId: docId,
              versionNumber: 1,
              fileUrl: url,
              fileKey,
              fileName: file.name,
              mimeType: file.mimeType,
              changeNote: "Imported from GitHub",
              uploadedBy: ctx.user?.id ?? 0,
              uploadedByName: ctx.user?.name ?? ctx.user?.email ?? "Unknown",
            });
          }

          results.push({ name: file.name, success: true });
        } catch (err) {
          results.push({ name: file.name, success: false, error: String(err) });
        }
      }

      return { results, imported: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length };
    }),
  }),

  admin: router({
    listUsers: publicProcedure.query(async () => {
      return listUsers();
    }),
    updateUserRole: publicProcedure.input(z.object({
      userId: z.number(),
      role: z.enum(['user', 'admin']),
    })).mutation(async ({ input }) => {
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),
    resetUserPassword: publicProcedure.input(z.object({
      userId: z.number(),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    })).mutation(async ({ input }) => {
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await adminResetUserPassword(input.userId, passwordHash);
      return { success: true };
    }),
  }),

  analyses: router({
    confirmStatus: publicProcedure.input(z.object({ id: z.number(), status: z.enum(["confirmed","dismissed"]) }))
      .mutation(async ({ input }) => { await updateImpactAnalysisStatus(input.id, input.status); return { success: true }; }),
  }),

  drafts: router({
    getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
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
    approve: publicProcedure.input(z.object({ id: z.number(), reviewNotes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const draft = await getDraftById(input.id);
        if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
        await updateDraftStatus(input.id, "approved", input.reviewNotes, ctx.user?.id ?? 0);
        // As soon as any single draft is approved, mark the change event as approved.
        try {
          await updateChangeEventStatus(draft.changeEventId, "approved");
        } catch (e) { console.warn("[approve] Failed to update change event status:", e); }
        return { success: true };
      }),
    requestRevision: publicProcedure.input(z.object({ id: z.number(), reviewNotes: z.string().min(1) }))
      .mutation(async ({ input }) => { await updateDraftStatus(input.id, "revision_requested", input.reviewNotes); return { success: true }; }),
    reject: publicProcedure.input(z.object({ id: z.number(), reviewNotes: z.string().optional() }))
      .mutation(async ({ input }) => {
        const draft = await getDraftById(input.id);
        if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
        await updateDraftStatus(input.id, "rejected", input.reviewNotes);
        // Check if all drafts for this change event are now in a terminal state
        try {
          const allDrafts = await getDraftsByEventId(draft.changeEventId);
          const updatedStatuses = allDrafts.map((d) => d.id === input.id ? "rejected" : d.status);
          const allTerminal = updatedStatuses.every((s) => s === "approved" || s === "rejected");
          if (allTerminal && updatedStatuses.length > 0) {
            const allApproved = updatedStatuses.every((s) => s === "approved");
            await updateChangeEventStatus(draft.changeEventId, allApproved ? "approved" : "rejected");
          }
        } catch (e) { console.warn("[reject] Failed to update change event status:", e); }
        return { success: true };
      }),
    updateContent: publicProcedure.input(z.object({ id: z.number(), content: z.string() }))
      .mutation(async ({ input }) => { await updateDraftContent(input.id, input.content); return { success: true }; }),
    routeForApproval: publicProcedure.input(z.object({
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

      // When approved: create a new version of the document in the library
      if (input.action === "approve" && draft.cleanModifiedUrl && draft.cleanModifiedKey) {
        try {
          const doc = await getDocumentById(draft.documentId);
          if (doc) {
            const latestVersion = await getLatestVersionNumber(draft.documentId);
            const nextVersion = latestVersion + 1;
            const event = await getChangeEventById(draft.changeEventId);
            await createDocumentVersion({
              documentId: draft.documentId,
              versionNumber: nextVersion,
              fileUrl: draft.cleanModifiedUrl,
              fileKey: draft.cleanModifiedKey,
              fileName: doc.fileName,
              mimeType: doc.mimeType ?? "application/octet-stream",
              changeEventId: draft.changeEventId,
              changeEventTitle: event?.title ?? undefined,
              changeNote: input.reviewNotes ?? `Approved via change event`,
              uploadedBy: undefined,
              uploadedByName: draft.approverName ?? "Approver",
            });
          }
        } catch (e) {
          console.warn("[ApproveByToken] Failed to create document version:", e);
        }
      }

      // As soon as any draft is approved, mark the change event as approved.
      if (input.action === "approve") {
        try {
          await updateChangeEventStatus(draft.changeEventId, "approved");
        } catch (e) {
          console.warn("[ApproveByToken] Failed to update change event status:", e);
        }
      }

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
    reGenerateModifiedFile: publicProcedure
      .input(z.object({ draftId: z.number() }))
      .mutation(async ({ input }) => {
        const draft = await getDraftById(input.draftId);
        if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
        const doc = await getDocumentById(draft.documentId);
        if (!doc?.fileUrl || !doc.fileName) throw new TRPCError({ code: "BAD_REQUEST", message: "Document has no file attached" });

        // Get the change event and its manual diff
        const event = await getChangeEventById(draft.changeEventId);
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Change event not found" });
        const selectedModel = await getAppSetting("llm_model", "gemini-2.5-flash");

        // Resolve effective equipment name (same logic as generateDrafts)
        const regenEffectiveEquipment = (event.affectedEquipment ?? "").trim() ||
          event.title
            .replace(/\b(change|replacement|update|upgrade|swap|fix|repair|modification|mod|rev|revision|install|installation)\b/gi, "")
            .replace(/\s+/g, " ")
            .trim();

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
              model: selectedModel,
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
          affectedEquipment: regenEffectiveEquipment || undefined,
        });
        await updateDraftModifiedFile(
          input.draftId,
          modResult.modifiedFileUrl,
          modResult.modifiedFileKey,
          JSON.stringify(modResult.changeLog),
          modResult.annotatedOriginalUrl,
          modResult.annotatedOriginalKey,
          modResult.cleanModifiedUrl,
          modResult.cleanModifiedKey,
        );
         return { success: true, changesApplied: modResult.changesApplied, message: `Modified file generated with ${modResult.changesApplied} change(s) applied.` };
      }),
  }),

  // ─── App Settings ─────────────────────────────────────────────────────────
  settings: router({
    getModel: publicProcedure.query(async () => {
      const model = await getAppSetting("llm_model", "gemini-2.5-flash");
      return { model };
    }),

    setModel: publicProcedure
      .input(z.object({ model: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await setAppSetting("llm_model", input.model);
        return { model: input.model };
      }),
  }),
});
export type AppRouter = typeof appRouter;
