import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Upload, X, CheckCircle2, Loader2,
  FileText, Weight, DollarSign, ChevronDown, Camera, ImageIcon,
} from "lucide-react";
import ChangeProgressStepper from "@/components/ChangeProgressStepper";
import WebcamCapture from "@/components/WebcamCapture";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChangeType = "part_change" | "weight_change" | "price_change";
type PartSubType = "manual" | "drawing" | "image";
type AssetUpload = { assetType: string; file: File; preview?: string };

// ─── Change type config ───────────────────────────────────────────────────────

const CHANGE_TYPE_OPTIONS = [
  {
    id: "part_change" as ChangeType,
    label: "Part Change",
    icon: FileText,
    desc: "A part has been replaced — upload the old and new manual or engineering drawing",
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/10",
  },
  {
    id: "weight_change" as ChangeType,
    label: "Weight Change",
    icon: Weight,
    desc: "The product weight has changed — enter old and new weight with SKU codes",
    color: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-500/10",
  },
  {
    id: "price_change" as ChangeType,
    label: "Price Change",
    icon: DollarSign,
    desc: "The product price has changed — enter old and new price with SKU codes",
    color: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/10",
  },
];

export default function NewChange() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);

  // Step 1 — change type selection
  const [changeType, setChangeType] = useState<ChangeType | "">("");
  const [partSubType, setPartSubType] = useState<PartSubType>("manual");
  const [title, setTitle] = useState("");
  const [textNotes, setTextNotes] = useState("");

  // Part change assets
  const [oldFile, setOldFile] = useState<File | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const oldFileRef = useRef<HTMLInputElement>(null);
  const newFileRef = useRef<HTMLInputElement>(null);

  // Webcam state — which slot is currently open ("old" | "new" | null)
  const [webcamSlot, setWebcamSlot] = useState<"old" | "new" | null>(null);
  // Input mode per slot: "upload" or "camera"
  const [oldInputMode, setOldInputMode] = useState<"upload" | "camera">("upload");
  const [newInputMode, setNewInputMode] = useState<"upload" | "camera">("upload");

  // Weight / Price change fields
  const [oldValue, setOldValue] = useState("");
  const [newValue, setNewValue] = useState("");
  const [oldSku, setOldSku] = useState("");
  const [newSku, setNewSku] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const createMutation = trpc.changeEvents.create.useMutation();
  const uploadAssetMutation = trpc.changeEvents.uploadAsset.useMutation();
  const addSkuMutation = trpc.changeEvents.addSkuChange.useMutation();
  const utils = trpc.useUtils();

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const selectedType = CHANGE_TYPE_OPTIONS.find((t) => t.id === changeType);

  const canProceedStep1 =
    changeType !== "" &&
    title.trim() !== "" &&
    (changeType !== "part_change" || (oldFile !== null && newFile !== null)) &&
    (changeType !== "weight_change" || (oldValue.trim() && newValue.trim() && oldSku.trim() && newSku.trim())) &&
    (changeType !== "price_change" || (oldValue.trim() && newValue.trim() && oldSku.trim() && newSku.trim()));

  const handleSubmit = async () => {
    if (!changeType || !title.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      // Build a descriptive title if not set
      const event = await createMutation.mutateAsync({
        title,
        changeType,
        partSubType: changeType === "part_change" ? partSubType : undefined,
        textNotes: textNotes || undefined,
      });

      const eventId = event?.id;
      if (!eventId) throw new Error("Failed to create event");

      // Upload files for part change
      if (changeType === "part_change") {
        if (oldFile) {
          const oldBase64 = await fileToBase64(oldFile);
          await uploadAssetMutation.mutateAsync({
            changeEventId: eventId,
            assetType: partSubType === "manual" ? "manual_old" : partSubType === "drawing" ? "drawing_old" : "image_old",
            fileName: oldFile.name,
            mimeType: oldFile.type,
            fileDataBase64: oldBase64,
          });
        }
        if (newFile) {
          const newBase64 = await fileToBase64(newFile);
          await uploadAssetMutation.mutateAsync({
            changeEventId: eventId,
            assetType: partSubType === "manual" ? "manual_new" : partSubType === "drawing" ? "drawing_new" : "image_new",
            fileName: newFile.name,
            mimeType: newFile.type,
            fileDataBase64: newBase64,
          });
        }
      }

      // Add SKU/parameter rows for weight or price change
      if (changeType === "weight_change") {
        await addSkuMutation.mutateAsync({ changeEventId: eventId, fieldName: "Weight", oldValue, newValue, unit: "g" });
        await addSkuMutation.mutateAsync({ changeEventId: eventId, fieldName: "SKU Code", oldValue: oldSku, newValue: newSku });
      } else if (changeType === "price_change") {
        await addSkuMutation.mutateAsync({ changeEventId: eventId, fieldName: "Price", oldValue, newValue, unit: "USD" });
        await addSkuMutation.mutateAsync({ changeEventId: eventId, fieldName: "SKU Code", oldValue: oldSku, newValue: newSku });
      }

      await utils.changeEvents.list.invalidate();
      toast.success("Change event created — running impact analysis…");
      setLocation(`/changes/${eventId}`);
    } catch (err) {
      toast.error("Failed to create change event. Please try again.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const valueLabel = changeType === "weight_change" ? "Weight" : changeType === "price_change" ? "Price" : "";
  const valuePlaceholder = changeType === "weight_change" ? "e.g., 500g" : "e.g., $4.99";
  const subTypeLabel =
    partSubType === "manual" ? "Manual" :
    partSubType === "drawing" ? "Engineering Drawing" : "Image";

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.09 0.018 255)" }}>
      {/* Top header bar */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-8 py-4"
        style={{
          background: "oklch(0.11 0.020 255 / 0.95)",
          borderBottom: "1px solid oklch(0.20 0.020 255)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="h-4 w-px" style={{ background: "oklch(0.25 0.020 255)" }} />
          <div>
            <h1 className="text-base font-semibold text-foreground tracking-tight">New Change Event</h1>
            <p className="text-xs text-muted-foreground">Define the change and submit for AI analysis</p>
          </div>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!canProceedStep1 || submitting}
          size="sm"
          className="gap-2 font-semibold"
          style={{
            background: canProceedStep1 && !submitting
              ? "linear-gradient(135deg, oklch(0.58 0.22 260), oklch(0.52 0.20 280))"
              : undefined,
            border: "none",
            boxShadow: canProceedStep1 && !submitting ? "0 4px 16px oklch(0.58 0.22 260 / 0.3)" : undefined,
          }}
        >
          {submitting ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…</>
          ) : (
            <><CheckCircle2 className="h-3.5 w-3.5" /> Create & Analyse</>
          )}
        </Button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Progress Stepper */}
        <ChangeProgressStepper currentStep={1} />

      <div className="space-y-8">
        {/* ── Change Event Title ── */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.58 0.22 260)" }} />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Change Details</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Event Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="e.g., Motor replacement on Detergent Line 3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 text-sm"
              style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.25 0.022 255)" }}
            />
          </div>
        </div>

        {/* ── Change Type ── */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.58 0.22 260)" }} />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Change Type</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {CHANGE_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  setChangeType(opt.id);
                  setOldValue("");
                  setNewValue("");
                  setOldSku("");
                  setNewSku("");
                  setOldFile(null);
                  setNewFile(null);
                }}
                className="p-4 rounded-xl text-left transition-all"
                style={{
                  background: changeType === opt.id ? "oklch(0.58 0.22 260 / 0.12)" : "oklch(0.10 0.018 255)",
                  border: `1px solid ${changeType === opt.id ? "oklch(0.58 0.22 260 / 0.5)" : "oklch(0.22 0.020 255)"}`,
                  boxShadow: changeType === opt.id ? "0 0 0 1px oklch(0.58 0.22 260 / 0.2)" : "none",
                }}
              >
                <opt.icon className={`h-5 w-5 mb-2 ${opt.color}`} />
                <p className={`text-sm font-semibold ${changeType === opt.id ? "text-foreground" : "text-muted-foreground"}`}>
                  {opt.label}
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-1 leading-snug">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── PART CHANGE: sub-type + file uploads ── */}
        {changeType === "part_change" && (
          <div
            className="rounded-2xl p-6 space-y-6"
            style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
          >
            <div className="flex items-center gap-2">
              <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.58 0.22 260)" }} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Part Change Details</p>
            </div>
            {/* Sub-type selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Document Type</Label>
              <div className="grid grid-cols-3 gap-3">
              {([
                  { id: "manual" as PartSubType, label: "Manual", desc: "Equipment manuals (PDF, DOCX)", accept: ".pdf,.doc,.docx" },
                  { id: "drawing" as PartSubType, label: "Engineering Drawing", desc: "Drawings (PDF, DWG, DXF)", accept: ".pdf,.dwg,.dxf" },
                  { id: "image" as PartSubType, label: "Image", desc: "Upload or photograph the part", accept: ".png,.jpg,.jpeg,.webp" },
                ]).map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setPartSubType(sub.id);
                      setOldFile(null);
                      setNewFile(null);
                      setOldInputMode("upload");
                      setNewInputMode("upload");
                      setWebcamSlot(null);
                    }}
                    className="p-4 rounded-xl text-left transition-all"
                    style={{
                      background: partSubType === sub.id ? "oklch(0.58 0.22 260 / 0.10)" : "oklch(0.10 0.018 255)",
                      border: `1px solid ${partSubType === sub.id ? "oklch(0.58 0.22 260 / 0.45)" : "oklch(0.22 0.020 255)"}`,
                    }}
                  >
                    <p className={`text-sm font-semibold ${
                      partSubType === sub.id ? "text-primary" : "text-muted-foreground"
                    }`}>
                      {sub.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">{sub.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Old part slot */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Old {subTypeLabel} <span className="text-destructive">*</span>
                </Label>
                {/* Mode toggle — only for Image sub-type */}
                {partSubType === "image" && !oldFile && webcamSlot !== "old" && (
                  <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                    <button
                      onClick={() => setOldInputMode("upload")}
                      className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                        oldInputMode === "upload"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Upload className="h-3 w-3" /> Upload
                    </button>
                    <button
                      onClick={() => setOldInputMode("camera")}
                      className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                        oldInputMode === "camera"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Camera className="h-3 w-3" /> Camera
                    </button>
                  </div>
                )}
              </div>

              {/* File already selected */}
              {oldFile ? (
                <div
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.22 0.020 255)" }}
                >
                  {oldFile.type.startsWith("image/") ? (
                    <img
                      src={URL.createObjectURL(oldFile)}
                      alt="Old part"
                      className="h-12 w-12 rounded object-cover shrink-0 border border-border"
                    />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm text-foreground flex-1 truncate">{oldFile.name}</span>
                  <button
                    onClick={() => { setOldFile(null); setOldInputMode("upload"); }}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : webcamSlot === "old" ? (
                /* Webcam open for old slot — Image only */
                <WebcamCapture
                  label={`Old ${subTypeLabel}`}
                  onCapture={(file) => { setOldFile(file); setWebcamSlot(null); }}
                  onCancel={() => { setWebcamSlot(null); setOldInputMode("upload"); }}
                />
              ) : partSubType === "image" && oldInputMode === "camera" ? (
                /* Camera mode — Image sub-type only */
                <button
                  onClick={() => setWebcamSlot("old")}
                  className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-primary/40 rounded-xl text-sm text-primary hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Camera className="h-4 w-4" />
                  Open camera to photograph old {subTypeLabel.toLowerCase()}
                </button>
              ) : (
                /* Upload mode */
                <button
                  onClick={() => oldFileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 p-5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-all"
                  style={{
                    border: "2px dashed oklch(0.28 0.022 255)",
                    background: "oklch(0.10 0.018 255 / 0.5)",
                  }}
                >
                  <Upload className="h-4 w-4" />
                  Click to upload old {subTypeLabel.toLowerCase()}
                </button>
              )}
              <input
                ref={oldFileRef}
                type="file"
                className="hidden"
                accept={
                  partSubType === "manual" ? ".pdf,.doc,.docx" :
                  partSubType === "drawing" ? ".pdf,.dwg,.dxf" :
                  ".png,.jpg,.jpeg,.webp"
                }
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setOldFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            {/* New part slot */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  New {subTypeLabel} <span className="text-destructive">*</span>
                </Label>
                {/* Mode toggle — only for Image sub-type */}
                {partSubType === "image" && !newFile && webcamSlot !== "new" && (
                  <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                    <button
                      onClick={() => setNewInputMode("upload")}
                      className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                        newInputMode === "upload"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Upload className="h-3 w-3" /> Upload
                    </button>
                    <button
                      onClick={() => setNewInputMode("camera")}
                      className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                        newInputMode === "camera"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Camera className="h-3 w-3" /> Camera
                    </button>
                  </div>
                )}
              </div>

              {/* File already selected */}
              {newFile ? (
                <div
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.22 0.020 255)" }}
                >
                  {newFile.type.startsWith("image/") ? (
                    <img
                      src={URL.createObjectURL(newFile)}
                      alt="New part"
                      className="h-12 w-12 rounded object-cover shrink-0 border border-border"
                    />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm text-foreground flex-1 truncate">{newFile.name}</span>
                  <button
                    onClick={() => { setNewFile(null); setNewInputMode("upload"); }}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : webcamSlot === "new" ? (
                /* Webcam open for new slot — Image only */
                <WebcamCapture
                  label={`New ${subTypeLabel}`}
                  onCapture={(file) => { setNewFile(file); setWebcamSlot(null); }}
                  onCancel={() => { setWebcamSlot(null); setNewInputMode("upload"); }}
                />
              ) : partSubType === "image" && newInputMode === "camera" ? (
                /* Camera mode — Image sub-type only */
                <button
                  onClick={() => setWebcamSlot("new")}
                  className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-primary/40 rounded-xl text-sm text-primary hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Camera className="h-4 w-4" />
                  Open camera to photograph new {subTypeLabel.toLowerCase()}
                </button>
              ) : (
                /* Upload mode */
                <button
                  onClick={() => newFileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 p-5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-all"
                  style={{
                    border: "2px dashed oklch(0.28 0.022 255)",
                    background: "oklch(0.10 0.018 255 / 0.5)",
                  }}
                >
                  <Upload className="h-4 w-4" />
                  Click to upload new {subTypeLabel.toLowerCase()}
                </button>
              )}
              <input
                ref={newFileRef}
                type="file"
                className="hidden"
                accept={
                  partSubType === "manual" ? ".pdf,.doc,.docx" :
                  partSubType === "drawing" ? ".pdf,.dwg,.dxf" :
                  ".png,.jpg,.jpeg,.webp"
                }
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setNewFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        )}

        {/* ── WEIGHT CHANGE: old/new weight + SKU codes ── */}
        {changeType === "weight_change" && (
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
          >
            <div className="flex items-center gap-2">
              <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.75 0.18 85)" }} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Weight Change Details</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Old Weight <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., 500g"
                  value={oldValue}
                  onChange={(e) => setOldValue(e.target.value)}
                  className="h-11 text-sm"
                  style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.25 0.022 255)" }}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  New Weight <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., 450g"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="h-11 text-sm"
                  style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.25 0.022 255)" }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Old SKU Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., SKU-001-A"
                  value={oldSku}
                  onChange={(e) => setOldSku(e.target.value)}
                  className="h-11 text-sm"
                  style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.25 0.022 255)" }}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  New SKU Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., SKU-001-B"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="h-11 text-sm"
                  style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.25 0.022 255)" }}
                />
              </div>
            </div>

            {/* Visual comparison */}
            {(oldValue || newValue) && (
              <div
                className="flex items-center gap-4 p-4 rounded-xl"
                style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.22 0.020 255)" }}
              >
                <div className="flex-1 text-center p-3 rounded-lg" style={{ background: "oklch(0.55 0.22 25 / 0.08)" }}>
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest mb-1">Old Weight</p>
                  <p className="text-xl font-bold" style={{ color: "oklch(0.65 0.20 25)" }}>{oldValue || "—"}</p>
                  {oldSku && <p className="text-xs text-muted-foreground mt-1 font-mono">{oldSku}</p>}
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 text-center p-3 rounded-lg" style={{ background: "oklch(0.65 0.18 145 / 0.08)" }}>
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest mb-1">New Weight</p>
                  <p className="text-xl font-bold" style={{ color: "oklch(0.65 0.18 145)" }}>{newValue || "—"}</p>
                  {newSku && <p className="text-xs text-muted-foreground mt-1 font-mono">{newSku}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PRICE CHANGE: old/new price + SKU codes ── */}
        {changeType === "price_change" && (
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
          >
            <div className="flex items-center gap-2">
              <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.65 0.18 145)" }} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Price Change Details</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Old Price <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., $4.99"
                  value={oldValue}
                  onChange={(e) => setOldValue(e.target.value)}
                  className="h-11 text-sm"
                  style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.25 0.022 255)" }}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  New Price <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., $5.49"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="h-11 text-sm"
                  style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.25 0.022 255)" }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Old SKU Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., SKU-001-A"
                  value={oldSku}
                  onChange={(e) => setOldSku(e.target.value)}
                  className="h-11 text-sm"
                  style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.25 0.022 255)" }}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  New SKU Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., SKU-001-B"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="h-11 text-sm"
                  style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.25 0.022 255)" }}
                />
              </div>
            </div>

            {/* Visual comparison */}
            {(oldValue || newValue) && (
              <div
                className="flex items-center gap-4 p-4 rounded-xl"
                style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.22 0.020 255)" }}
              >
                <div className="flex-1 text-center p-3 rounded-lg" style={{ background: "oklch(0.55 0.22 25 / 0.08)" }}>
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest mb-1">Old Price</p>
                  <p className="text-xl font-bold" style={{ color: "oklch(0.65 0.20 25)" }}>{oldValue || "—"}</p>
                  {oldSku && <p className="text-xs text-muted-foreground mt-1 font-mono">{oldSku}</p>}
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 text-center p-3 rounded-lg" style={{ background: "oklch(0.65 0.18 145 / 0.08)" }}>
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest mb-1">New Price</p>
                  <p className="text-xl font-bold" style={{ color: "oklch(0.65 0.18 145)" }}>{newValue || "—"}</p>
                  {newSku && <p className="text-xs text-muted-foreground mt-1 font-mono">{newSku}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Description / Notes (always shown once type is selected) ── */}
        {changeType && (
          <div
            className="rounded-2xl p-6 space-y-3"
            style={{ background: "oklch(0.12 0.022 255)", border: "1px solid oklch(0.20 0.020 255)" }}
          >
            <div className="flex items-center gap-2">
              <div className="h-1 w-5 rounded-full" style={{ background: "oklch(0.72 0.15 200)" }} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Change Description</p>
            </div>
            <Label htmlFor="notes" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Describe what changed{" "}
              <span className="text-muted-foreground/50 normal-case font-normal">(optional but recommended)</span>
            </Label>
            <Textarea
              id="notes"
              placeholder="Describe what changed and any additional context you want the AI to use when updating documents…"
              value={textNotes}
              onChange={(e) => setTextNotes(e.target.value)}
              rows={4}
              className="resize-none text-sm"
              style={{ background: "oklch(0.10 0.018 255)", border: "1px solid oklch(0.25 0.022 255)" }}
            />
          </div>
        )}

        {/* ── Summary card before submit ── */}
        {canProceedStep1 && (
          <div
            className="rounded-2xl p-5 space-y-3"
            style={{
              background: "oklch(0.65 0.18 145 / 0.06)",
              border: "1px solid oklch(0.65 0.18 145 / 0.25)",
            }}
          >
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" style={{ color: "oklch(0.65 0.18 145)" }} />
              Ready to Submit
            </h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-28 shrink-0">Title:</span>
                <span className="text-foreground">{title}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-28 shrink-0">Change Type:</span>
                <span className="text-foreground">{selectedType?.label}</span>
              </div>
              {changeType === "part_change" && (
                <>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Sub-type:</span>
                    <span className="text-foreground capitalize">{subTypeLabel}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Old file:</span>
                    <span className="text-foreground truncate">{oldFile?.name ?? "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">New file:</span>
                    <span className="text-foreground truncate">{newFile?.name ?? "—"}</span>
                  </div>
                </>
              )}
              {(changeType === "weight_change" || changeType === "price_change") && (
                <>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">{valueLabel}:</span>
                    <span className="text-red-400 line-through">{oldValue}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-emerald-400">{newValue}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">SKU Code:</span>
                    <span className="text-red-400 line-through">{oldSku}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-emerald-400">{newSku}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
