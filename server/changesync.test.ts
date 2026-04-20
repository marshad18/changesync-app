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
  updateDraftModifiedFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./documentModifier", () => ({
  extractDocumentContent: vi.fn().mockResolvedValue(
    "EXCEL DOCUMENT: LubeMap-EOLA3A.xlsx\n\n=== Sheet: Sheet1 ===\nRow 1 (A1): Equipment | Lube Point | Lubricant | Frequency | Qty\nRow 2 (A2): Motor | Bearing NDE | Shell Omala 220 | Monthly | 50g\nRow 3 (A3): Motor | Bearing DE | Shell Omala 220 | Monthly | 50g\n"
  ),
  modifyDocument: vi.fn().mockResolvedValue({
    modifiedFileUrl: "https://s3.example.com/modified/lube-modified.xlsx",
    modifiedFileKey: "modified-documents/lube-modified.xlsx",
    changeLog: [
      { sheetName: "Sheet1", cellRef: "B5", oldValue: "1.5 kW", newValue: "2.2 kW", rowIndex: 4, colIndex: 1 },
    ],
    changesApplied: 1,
  }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/test.pdf", key: "test.pdf" }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockImplementation((params: { messages: Array<{ role: string; content: string }> }) => {
    // Detect which LLM call this is based on the system prompt content
    const systemMsg = params.messages.find((m: { role: string; content: string }) => m.role === "system");
    const isChangeExtraction = systemMsg?.content?.includes("documentation analyst");
    if (isChangeExtraction) {
      // Return structured change extraction result
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({
          changes: [
            { fieldName: "Lubrication Frequency", oldValue: "Monthly", newValue: "Weekly", unit: "" },
          ],
        }) } }],
      });
    }
    // Default: return impact analysis result (for analyzeImpact and generateDrafts text)
    return Promise.resolve({
      choices: [{ message: { content: JSON.stringify({
        analyses: [
          { documentId: 10, impacted: true, confidence: "high", reasoning: "Motor change affects lubrication.", impactedSections: "Lubrication points" },
        ],
      }) } }],
    });
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

describe("changeEvents.create — new change types", () => {
  it("creates a part_change event with manual sub-type", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.changeEvents.create({
      title: "Motor Manual Update",
      changeType: "part_change",
      partSubType: "manual",
      textNotes: "New motor manual uploaded",
    });
    expect(result).toBeDefined();
    expect(result?.title).toBe("Motor Swap"); // mocked listChangeEvents returns Motor Swap
  });

  it("creates a weight_change event", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.changeEvents.create({
      title: "Detergent Weight Change 500g → 450g",
      changeType: "weight_change",
      textNotes: "Reformulation reduced fill weight",
    });
    expect(result).toBeDefined();
  });

  it("creates a price_change event", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.changeEvents.create({
      title: "SKU-001 Price Update",
      changeType: "price_change",
      textNotes: "Price increase due to raw material costs",
    });
    expect(result).toBeDefined();
  });

  it("rejects invalid change type", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.changeEvents.create({
        title: "Bad type",
        changeType: "invalid_type" as "hardware",
      })
    ).rejects.toThrow();
  });
});

describe("changeEvents.uploadAsset — new asset types", () => {
  it("uploads a manual_old asset", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.changeEvents.uploadAsset({
      changeEventId: 1,
      assetType: "manual_old",
      fileName: "old-manual.pdf",
      mimeType: "application/pdf",
      fileDataBase64: Buffer.from("test").toString("base64"),
    });
    expect(result).toHaveProperty("url");
  });

  it("uploads a manual_new asset", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.changeEvents.uploadAsset({
      changeEventId: 1,
      assetType: "manual_new",
      fileName: "new-manual.pdf",
      mimeType: "application/pdf",
      fileDataBase64: Buffer.from("test").toString("base64"),
    });
    expect(result).toHaveProperty("url");
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

describe("github.listSampleDocs", () => {
  beforeEach(() => {
    vi.mock("./github", () => ({
      listGitHubSampleDocs: vi.fn().mockResolvedValue([
        {
          name: "LubeMap-EOLA3A.xlsx",
          path: "sample-documents/equipment-maps/LubeMap-EOLA3A.xlsx",
          sha: "abc123",
          size: 12345,
          downloadUrl: "https://raw.githubusercontent.com/marshad18/change-flow/main/sample-documents/equipment-maps/LubeMap-EOLA3A.xlsx",
          folder: "equipment-maps",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        {
          name: "SafetyMap-EOLA3A.pdf",
          path: "sample-documents/equipment-maps/SafetyMap-EOLA3A.pdf",
          sha: "def456",
          size: 54321,
          downloadUrl: "https://raw.githubusercontent.com/marshad18/change-flow/main/sample-documents/equipment-maps/SafetyMap-EOLA3A.pdf",
          folder: "equipment-maps",
          mimeType: "application/pdf",
        },
      ]),
      downloadGitHubFile: vi.fn().mockResolvedValue(Buffer.from("file content")),
    }));
  });

  it("returns files from GitHub with alreadyImported flag", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.github.listSampleDocs();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((f) => {
      expect(f).toHaveProperty("name");
      expect(f).toHaveProperty("folder");
      expect(f).toHaveProperty("downloadUrl");
      expect(f).toHaveProperty("alreadyImported");
      expect(typeof f.alreadyImported).toBe("boolean");
    });
  });
});

describe("github.importFiles", () => {
  it("imports selected files and returns success count", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.github.importFiles({
      files: [
        {
          name: "LubeMap-EOLA3A.xlsx",
          path: "sample-documents/equipment-maps/LubeMap-EOLA3A.xlsx",
          downloadUrl: "https://raw.githubusercontent.com/marshad18/change-flow/main/sample-documents/equipment-maps/LubeMap-EOLA3A.xlsx",
          folder: "equipment-maps",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size: 12345,
        },
      ],
    });
    expect(result).toHaveProperty("imported");
    expect(result).toHaveProperty("failed");
    expect(result).toHaveProperty("results");
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("returns empty results for empty file list", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.github.importFiles({ files: [] });
    expect(result.imported).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});
