import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Upload, FileText, Loader2, X, Plus, Eye,
  BookOpen, Search, Github, CheckSquare, Square,
  FolderOpen, Check, AlertCircle, Download, History, ExternalLink,
} from "lucide-react";

// ─── Version History Drawer ───────────────────────────────────────────────────
function VersionHistoryDrawer({ documentId, documentName, onClose }: { documentId: number; documentName: string; onClose: () => void }) {
  const { data: versions, isLoading } = trpc.documents.getVersionHistory.useQuery({ documentId });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <div className="relative z-10 w-full max-w-md bg-background border-l border-border shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Version History</h2>
              <p className="text-xs text-muted-foreground truncate max-w-[220px]">{documentName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading versions…</span>
            </div>
          ) : !versions || versions.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No version history yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Versions are created when documents are uploaded or approved drafts are applied.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((v, idx) => (
                <div key={v.id} className={`relative pl-8 pb-6 ${idx < versions.length - 1 ? 'border-l-2 border-border ml-3' : 'ml-3'}`}>
                  {/* Timeline dot */}
                  <div className={`absolute left-0 top-1 w-3 h-3 rounded-full border-2 -translate-x-[7px] ${
                    idx === 0 ? 'bg-primary border-primary' : 'bg-background border-border'
                  }`} />

                  <div className="bg-card border border-border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        idx === 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        v{v.versionNumber} {idx === 0 ? '(current)' : ''}
                      </span>
                      <a
                        href={v.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </a>
                    </div>

                    {v.changeEventTitle && (
                      <p className="text-xs text-foreground font-medium">{v.changeEventTitle}</p>
                    )}

                    {v.changeNote && (
                      <p className="text-xs text-muted-foreground">{v.changeNote}</p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {v.uploadedByName && <span>By {v.uploadedByName}</span>}
                      <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CATEGORIES = ["Operator", "Engineering", "Safety", "Operations", "Maintenance"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_COLORS: Record<Category, string> = {
  Operator: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Engineering: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  Safety: "bg-red-500/15 text-red-400 border-red-500/30",
  Operations: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Maintenance: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const FOLDER_COLORS: Record<string, string> = {
  "equipment-maps": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "packaging": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "safety": "bg-red-500/15 text-red-400 border-red-500/30",
  "maintenance": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "operator": "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const SUGGESTED_DOCS = [
  { code: "CIL", name: "Clean, Inspect, Lubricate", category: "Operator" as Category },
  { code: "CPE", name: "Centerline Process Equipment", category: "Engineering" as Category },
  { code: "Safety Map", name: "Safety Map", category: "Safety" as Category },
  { code: "SOC Map", name: "Standard Operating Conditions Map", category: "Operations" as Category },
  { code: "HTRA Map", name: "Hazard & Task Risk Assessment Map", category: "Safety" as Category },
  { code: "LUBE Map", name: "Lubrication Map", category: "Maintenance" as Category },
  { code: "Fastener Map", name: "Fastener Torque Map", category: "Maintenance" as Category },
  { code: "MTM", name: "Methods-Time Measurement", category: "Engineering" as Category },
  { code: "WPA", name: "Workplace Analysis", category: "Engineering" as Category },
  { code: "Manuals", name: "Equipment Manuals", category: "Operations" as Category },
  { code: "OPLs", name: "One-Point Lessons", category: "Operator" as Category },
  { code: "Troubleshooting", name: "Troubleshooting Guide", category: "Maintenance" as Category },
  { code: "AM Step 3/4/5", name: "Autonomous Maintenance Steps 3, 4 & 5", category: "Operator" as Category },
  { code: "Spare List", name: "Spare Parts List", category: "Maintenance" as Category },
  { code: "PM Plan", name: "Preventative Maintenance Plan", category: "Maintenance" as Category },
];

interface GitHubFileItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  downloadUrl: string;
  folder: string;
  mimeType: string;
  alreadyImported: boolean;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentLibrary() {
  const [showUpload, setShowUpload] = useState(false);
  const [showGitHubImport, setShowGitHubImport] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [versionDoc, setVersionDoc] = useState<{ id: number; name: string } | null>(null);

  // Upload form state
  const [docName, setDocName] = useState("");
  const [docCode, setDocCode] = useState("");
  const [docCategory, setDocCategory] = useState<Category>("Operations");
  const [docOwner, setDocOwner] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: documents, isLoading, refetch } = trpc.documents.list.useQuery();
  const uploadMutation = trpc.documents.upload.useMutation();
  const importMutation = trpc.github.importFiles.useMutation();

  // Only fetch GitHub files when the modal is open
  const { data: githubFiles, isLoading: ghLoading, error: ghError, refetch: refetchGh } =
    trpc.github.listSampleDocs.useQuery(undefined, { enabled: showGitHubImport });

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleUpload = async () => {
    if (!docName || !selectedFile) {
      toast.error("Please enter a document name and select a file.");
      return;
    }
    setUploading(true);
    try {
      const fileDataBase64 = await fileToBase64(selectedFile);
      await uploadMutation.mutateAsync({
        name: docName, code: docCode || undefined,
        category: docCategory, owner: docOwner || undefined,
        fileName: selectedFile.name, mimeType: selectedFile.type, fileDataBase64,
      });
      await refetch();
      toast.success("Document uploaded successfully!");
      setDocName(""); setDocCode(""); setDocOwner(""); setSelectedFile(null); setShowUpload(false);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const prefillFromSuggestion = (s: typeof SUGGESTED_DOCS[0]) => {
    setDocName(s.name); setDocCode(s.code); setDocCategory(s.category);
    setShowUpload(true);
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  // Group GitHub files by folder
  const githubByFolder = (githubFiles ?? []).reduce<Record<string, GitHubFileItem[]>>((acc, f) => {
    if (!acc[f.folder]) acc[f.folder] = [];
    acc[f.folder].push(f);
    return acc;
  }, {});

  const allSelectablePaths = (githubFiles ?? []).filter(f => !f.alreadyImported).map(f => f.path);
  const allSelected = allSelectablePaths.length > 0 && allSelectablePaths.every(p => selectedPaths.has(p));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(allSelectablePaths));
    }
  };

  const toggleFile = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleFolder = (folder: string) => {
    const folderFiles = (githubByFolder[folder] ?? []).filter(f => !f.alreadyImported).map(f => f.path);
    const allFolderSelected = folderFiles.every(p => selectedPaths.has(p));
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (allFolderSelected) {
        folderFiles.forEach(p => next.delete(p));
      } else {
        folderFiles.forEach(p => next.add(p));
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedPaths.size === 0) {
      toast.error("Please select at least one file to import.");
      return;
    }
    const filesToImport = (githubFiles ?? []).filter(f => selectedPaths.has(f.path));
    setImporting(true);
    try {
      const result = await importMutation.mutateAsync({ files: filesToImport });
      await refetch();
      await refetchGh();
      setSelectedPaths(new Set());
      if (result.failed > 0) {
        toast.warning(`Imported ${result.imported} documents. ${result.failed} failed.`);
      } else {
        toast.success(`Successfully imported ${result.imported} document${result.imported !== 1 ? "s" : ""} from GitHub!`);
      }
      if (result.imported > 0) setShowGitHubImport(false);
    } catch {
      toast.error("Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const filtered = (documents ?? []).filter((d) => {
    const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || (d.code ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === "All" || d.category === filterCategory;
    return matchSearch && matchCat;
  });

  const uploadedCodes = new Set((documents ?? []).map((d) => d.code).filter(Boolean));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Document Library
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload your plant documents. The AI uses these to identify what needs updating when a change is made.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setShowGitHubImport(!showGitHubImport); setShowUpload(false); }}
            className="gap-2 border-border"
          >
            <Github className="h-4 w-4" />
            Import from GitHub
          </Button>
          <Button onClick={() => { setShowUpload(!showUpload); setShowGitHubImport(false); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Upload Document
          </Button>
        </div>
      </div>

      {/* ── GitHub Import Panel ── */}
      {showGitHubImport && (
        <div className="bg-card border border-primary/30 rounded-xl overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-primary/5">
            <div className="flex items-center gap-3">
              <Github className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Import from GitHub</h2>
                <p className="text-xs text-muted-foreground">marshad18/change-flow · sample-documents/</p>
              </div>
            </div>
            <button onClick={() => setShowGitHubImport(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Loading state */}
          {ghLoading && (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Reading repository…</span>
            </div>
          )}

          {/* Error state */}
          {ghError && (
            <div className="flex items-center gap-3 p-6 text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Could not read GitHub repository</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ghError.message}</p>
              </div>
            </div>
          )}

          {/* File list */}
          {!ghLoading && !ghError && githubFiles && (
            <>
              {/* Select all + count */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-secondary/20">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                >
                  {allSelected
                    ? <CheckSquare className="h-4 w-4 text-primary" />
                    : <Square className="h-4 w-4 text-muted-foreground" />}
                  Select all ({allSelectablePaths.length} available)
                </button>
                <span className="text-xs text-muted-foreground">
                  {selectedPaths.size} selected · {githubFiles.filter(f => f.alreadyImported).length} already imported
                </span>
              </div>

              {/* Files grouped by folder */}
              <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
                {Object.entries(githubByFolder).map(([folder, files]) => {
                  const folderSelectablePaths = files.filter(f => !f.alreadyImported).map(f => f.path);
                  const folderAllSelected = folderSelectablePaths.length > 0 && folderSelectablePaths.every(p => selectedPaths.has(p));
                  const folderSomeSelected = folderSelectablePaths.some(p => selectedPaths.has(p));
                  const folderColor = FOLDER_COLORS[folder.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";

                  return (
                    <div key={folder}>
                      {/* Folder header */}
                      <div className="flex items-center gap-3 px-6 py-2.5 bg-secondary/10 sticky top-0">
                        <button
                          onClick={() => toggleFolder(folder)}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          disabled={folderSelectablePaths.length === 0}
                        >
                          {folderAllSelected
                            ? <CheckSquare className="h-4 w-4 text-primary" />
                            : folderSomeSelected
                              ? <CheckSquare className="h-4 w-4 text-primary/50" />
                              : <Square className="h-4 w-4" />}
                        </button>
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${folderColor}`}>
                          {folder}
                        </span>
                        <span className="text-xs text-muted-foreground">{files.length} files</span>
                      </div>

                      {/* Files in folder */}
                      {files.map((file) => (
                        <div
                          key={file.path}
                          className={`flex items-center gap-3 px-6 py-3 hover:bg-accent/10 transition-colors ${file.alreadyImported ? "opacity-50" : ""}`}
                        >
                          <button
                            onClick={() => !file.alreadyImported && toggleFile(file.path)}
                            disabled={file.alreadyImported}
                            className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                          >
                            {file.alreadyImported
                              ? <Check className="h-4 w-4 text-emerald-400" />
                              : selectedPaths.has(file.path)
                                ? <CheckSquare className="h-4 w-4 text-primary" />
                                : <Square className="h-4 w-4" />}
                          </button>
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                          </div>
                          {file.alreadyImported && (
                            <span className="text-xs text-emerald-400 shrink-0">Imported</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Import action bar */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/10">
                <p className="text-xs text-muted-foreground">
                  {selectedPaths.size > 0
                    ? `${selectedPaths.size} file${selectedPaths.size !== 1 ? "s" : ""} selected for import`
                    : "Select files above to import them into the Document Library"}
                </p>
                <Button
                  onClick={handleImport}
                  disabled={selectedPaths.size === 0 || importing}
                  className="gap-2"
                >
                  {importing
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                    : <><Download className="h-4 w-4" /> Import {selectedPaths.size > 0 ? `${selectedPaths.size} ` : ""}Selected</>}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Manual Upload Panel ── */}
      {showUpload && (
        <div className="bg-card border border-primary/30 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Upload New Document</h2>
            <button onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="docName">Document Name *</Label>
              <Input id="docName" placeholder="e.g., Lubrication Map" value={docName} onChange={(e) => setDocName(e.target.value)} className="bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docCode">Document Code</Label>
              <Input id="docCode" placeholder="e.g., LUBE Map" value={docCode} onChange={(e) => setDocCode(e.target.value)} className="bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select value={docCategory} onChange={(e) => setDocCategory(e.target.value as Category)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docOwner">Owner / SME</Label>
              <Input id="docOwner" placeholder="e.g., Maintenance Lead" value={docOwner} onChange={(e) => setDocOwner(e.target.value)} className="bg-background border-border" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>File *</Label>
            <div className="flex gap-3 items-center">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" />
                {selectedFile ? "Change File" : "Choose File"}
              </Button>
              {selectedFile && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-foreground">{selectedFile.name}</span>
                  <button onClick={() => setSelectedFile(null)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <Button onClick={handleUpload} disabled={uploading || !docName || !selectedFile} className="gap-2">
            {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4" /> Upload Document</>}
          </Button>
        </div>
      )}

      {/* ── Suggested Documents ── */}
      {(documents ?? []).length < SUGGESTED_DOCS.length && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Standard Manufacturing Documents
            <span className="text-xs text-muted-foreground font-normal">— click to upload</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {SUGGESTED_DOCS.filter((s) => !uploadedCodes.has(s.code)).map((s) => (
              <button
                key={s.code}
                onClick={() => prefillFromSuggestion(s)}
                className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg text-left hover:border-primary/40 hover:bg-accent/20 transition-all group"
              >
                <div className={`text-xs px-1.5 py-0.5 rounded border font-mono font-semibold shrink-0 ${CATEGORY_COLORS[s.category]}`}>{s.code}</div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate">{s.name}</span>
                <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      {(documents ?? []).length > 0 && (
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search documents…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["All", ...CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${filterCategory === cat ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/40"}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Documents Grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/3 mb-2" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((doc) => (
            <div key={doc.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {doc.code && (
                    <span className={`text-xs px-2 py-0.5 rounded border font-mono font-semibold ${CATEGORY_COLORS[doc.category as Category] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {doc.code}
                    </span>
                  )}
                  <span className="text-sm font-medium text-foreground">{doc.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setVersionDoc({ id: doc.id, name: doc.name })}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title="Version history"
                  >
                    <History className="h-4 w-4" />
                  </button>
                  {doc.fileUrl && (
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                      <Eye className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {doc.category && (
                  <span className={`px-2 py-0.5 rounded border ${CATEGORY_COLORS[doc.category as Category] ?? "bg-muted border-border"}`}>{doc.category}</span>
                )}
                {doc.owner && <span>Owner: {doc.owner}</span>}
                <span className="text-foreground/40 truncate max-w-[180px]">{doc.fileName}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (documents ?? []).length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">No documents yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Import your documents from GitHub or upload them manually to enable AI impact analysis.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setShowGitHubImport(true)} className="gap-2">
              <Github className="h-4 w-4" /> Import from GitHub
            </Button>
            <Button onClick={() => setShowUpload(true)} className="gap-2">
              <Upload className="h-4 w-4" /> Upload Document
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No documents match your search.
        </div>
      )}

      {/* Version History Drawer */}
      {versionDoc && (
        <VersionHistoryDrawer
          documentId={versionDoc.id}
          documentName={versionDoc.name}
          onClose={() => setVersionDoc(null)}
        />
      )}
    </div>
  );
}
