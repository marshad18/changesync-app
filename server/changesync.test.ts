import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock all DB and storage helpers ─────────────────────────────────────────
vi.mock("./db", () => ({
  createChangeEvent: vi.fn().mockResolvedValue(undefined),
  listChangeEvents: vi.fn().mockResolvedValue([
    {
      id: 1, title: "Motor Swap", changeType: "hardware", changeScope: "substitution",
      affectedEquipment: "Detergent Line 3", affectedSku: null, textNotes: "New 5kW motor",
      status: "draft", createdBy: 1, createdAt: new Date(), updatedAt: new Date(),
    },
  ]),
  getChangeEventById: vi.fn().mockResolvedValue({
    id: 1, title: "Motor Swap", changeType: "hardware", changeScope: "substitution",
    affectedEquipment: "Detergent Line 3", affectedSku: null, textNotes: "New 5kW motor",
    status: "draft", createdBy: 1, createdAt: new Date(), updatedAt: new Date(),
  }),
  updateChangeEventStatus: vi.fn().mockResolvedValue(undefined),
  createChangeAsset: vi.fn().mockResolvedValue(undefined),
  getChangeAssetsByEventId: vi.fn().mockResolvedValue([]),
  createSkuChange: vi.fn().mockResolvedValue(undefined),
  getSkuChangesByEventId: vi.fn().mockResolvedValue([]),
  deleteSkuChange: vi.fn().mockResolvedValue(undefined),
  createDocument: vi.fn().mockResolvedValue(undefined),
  listDocuments: vi.fn().mockResolvedValue([
    {
      id: 10, name: "Lubrication Map", code: "LUBE Map", category: "Maintenance",
      owner: "Maintenance Lead", fileUrl: "https://s3.example.com/lube.pdf",
      fileKey: "documents/lube.pdf", fileName: "LubeMap.pdf", mimeType: "application/pdf",
      uploadedBy: 1, createdAt: new Date(), updatedAt: new Date(),
    },
  ]),
  getDocumentById: vi.fn().mockResolvedValue({
    id: 10, name: "Lubrication Map", code: "LUBE Map", category: "Maintenance",
    owner: "Maintenance Lead", fileUrl: "https://s3.example.com/lube.pdf",
    fileKey: "documents/lube.pdf", fileName: "LubeMap.pdf", mimeType: "application/pdf",
    uploadedBy: 1, createdAt: new Date(), updatedAt: new Date(),
  }),
  createImpactAnalysis: vi.fn().mockResolvedValue(undefined),
  getImpactAnalysesByEventId: vi.fn().mockResolvedValue([
    {
      id: 5, changeEventId: 1, documentId: 10, impacted: true, confidence: "high",
      reasoning: "Motor change affects lubrication requirements.",
      impactedSections: "Lubrication points, frequency",
      status: "pending", createdAt: new Date(), updatedAt: new Date(),
    },
  ]),
  updateImpactAnalysisStatus: vi.fn().mockResolvedValue(undefined),
  deleteImpactAnalysesByEventId: vi.fn().mockResolvedValue(undefined),
  createDocumentDraft: vi.fn().mockResolvedValue(undefined),
  getDraftsByEventId: vi.fn().mockResolvedValue([
    {
      id: 20, changeEventId: 1, documentId: 10, impactAnalysisId: 5,
      draftContent: "## Changes Required\n### Summary\nUpdate lubrication frequency.",
      status: "pending_review", reviewedBy: null, reviewNotes: null,
      createdAt: new Date(), updatedAt: new Date(),
    },
  ]),
  getDraftById: vi.fn().mockResolvedValue({
    id: 20, changeEventId: 1, documentId: 10, impactAnalysisId: 5,
    draftContent: "## Changes Required\n### Summary\nUpdate lubrication frequency.",
    status: "pending_review", reviewedBy: null, reviewNotes: null,
    createdAt: new Date(), updatedAt: new Date(),
  }),
  updateDraftStatus: vi.fn().mockResolvedValue(undefined),
  updateDraftContent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/test.pdf", key: "test.pdf" }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          analyses: [
            { documentId: 10, impacted: true, confidence: "high", reasoning: "Motor change affects lubrication.", impactedSections: "Lubrication points" },
          ],
        }),
      },
    }],
  }),
}));

// ─── Auth context helper ──────────────────────────────────────────────────────
function createCtx(): TrpcContext {
  return {
    user: {
      id: 1, openId: "test-user", email: "test@example.com", name: "Test User",
      loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("changeEvents.list", () => {
  it("returns a list of change events", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.changeEvents.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("title", "Motor Swap");
    expect(result[0]).toHaveProperty("changeType", "hardware");
  });
});

describe("changeEvents.create", () => {
  it("creates a change event and returns it", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.changeEvents.create({
      title: "Motor Swap",
      changeType: "hardware",
      changeScope: "substitution",
      affectedEquipment: "Detergent Line 3",
      textNotes: "New 5kW motor installed",
    });
    expect(result).toBeDefined();
    expect(result?.title).toBe("Motor Swap");
  });
});

describe("changeEvents.getById", () => {
  it("returns enriched event with analyses and drafts", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.changeEvents.getById({ id: 1 });
    expect(result).not.toBeNull();
    expect(result?.event.title).toBe("Motor Swap");
    expect(Array.isArray(result?.analyses)).toBe(true);
    expect(Array.isArray(result?.drafts)).toBe(true);
    // Enriched with documentName
    expect(result?.analyses[0]).toHaveProperty("documentName");
    expect(result?.drafts[0]).toHaveProperty("documentName");
  });
});

describe("changeEvents.analyzeImpact", () => {
  it("calls AI and creates impact analyses", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.changeEvents.analyzeImpact({ changeEventId: 1 });
    expect(result).toHaveProperty("analysesCreated");
    expect(typeof result.analysesCreated).toBe("number");
  });
});

describe("documents.list", () => {
  it("returns the document library", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.documents.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("name", "Lubrication Map");
    expect(result[0]).toHaveProperty("code", "LUBE Map");
  });
});

describe("analyses.confirmStatus", () => {
  it("confirms an analysis as confirmed", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.analyses.confirmStatus({ id: 5, status: "confirmed" });
    expect(result).toEqual({ success: true });
  });

  it("confirms an analysis as dismissed", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.analyses.confirmStatus({ id: 5, status: "dismissed" });
    expect(result).toEqual({ success: true });
  });
});

describe("drafts.approve", () => {
  it("approves a draft with review notes", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.drafts.approve({ id: 20, reviewNotes: "Looks good." });
    expect(result).toEqual({ success: true });
  });
});

describe("drafts.requestRevision", () => {
  it("requests a revision with notes", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.drafts.requestRevision({ id: 20, reviewNotes: "Please update section 3." });
    expect(result).toEqual({ success: true });
  });
});

describe("drafts.reject", () => {
  it("rejects a draft", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.drafts.reject({ id: 20 });
    expect(result).toEqual({ success: true });
  });
});

describe("drafts.updateContent", () => {
  it("updates draft content", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.drafts.updateContent({ id: 20, content: "Updated content." });
    expect(result).toEqual({ success: true });
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const ctx = createCtx();
    const clearedCookies: string[] = [];
    ctx.res.clearCookie = (name: string) => { clearedCookies.push(name); };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});
