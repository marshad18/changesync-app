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
    <div className="p-6 max-w-2xl mx-auto">
      {/* Progress Stepper */}
      <div className="mb-8">
        <ChangeProgressStepper currentStep={1} />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => setLocation("/")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">New Change Event</h1>
          <p className="text-sm text-muted-foreground">
            Select the type of change and provide the details
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {/* ── Change Event Title ── */}
        <div className="space-y-2">
          <Label htmlFor="title">
            Change Event Title <span className="text-destructive">*</span>
          </Label>
          <Input
            id="title"
            placeholder="e.g., Motor replacement on Detergent Line 3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-card border-border"
          />
        </div>

        {/* ── Change Type Dropdown ── */}
        <div className="space-y-3">
          <Label>
            Change Type <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <select
              value={changeType}
              onChange={(e) => {
                setChangeType(e.target.value as ChangeType | "");
                setOldValue("");
                setNewValue("");
                setOldSku("");
                setNewSku("");
                setOldFile(null);
                setNewFile(null);
              }}
              className="w-full appearance-none bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
            >
              <option value="">Select a change type…</option>
              {CHANGE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>

          {/* Selected type description */}
          {selectedType && (
            <div
              className={`flex items-start gap-3 p-4 rounded-xl border ${selectedType.borderColor} ${selectedType.bgColor}`}
            >
              <selectedType.icon className={`h-5 w-5 mt-0.5 shrink-0 ${selectedType.color}`} />
              <p className="text-sm text-muted-foreground leading-relaxed">{selectedType.desc}</p>
            </div>
          )}
        </div>

        {/* ── PART CHANGE: sub-type + file uploads ── */}
        {changeType === "part_change" && (
          <div className="space-y-6">
            {/* Sub-type selector */}
            <div className="space-y-2">
              <Label>Document Type</Label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { id: "manual" as PartSubType, label: "Manual", desc: "Upload old and new equipment manuals (PDF)", accept: ".pdf,.doc,.docx" },
                  { id: "drawing" as PartSubType, label: "Engineering Drawing", desc: "Upload old and new engineering drawings (PDF, DWG)", accept: ".pdf,.dwg,.dxf" },
                  { id: "image" as PartSubType, label: "Image", desc: "Upload or photograph the old and new part", accept: ".png,.jpg,.jpeg,.webp" },
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
                    className={`p-4 rounded-xl border text-left transition-all ${
                      partSubType === sub.id
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${
                      partSubType === sub.id ? "text-primary" : "text-foreground"
                    }`}>
                      {sub.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{sub.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Old part slot */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
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
                <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
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
                  className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all"
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
                <Label>
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
                <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
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
                  className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all"
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
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Old Weight <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., 500g"
                  value={oldValue}
                  onChange={(e) => setOldValue(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  New Weight <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., 450g"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Old SKU Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., SKU-001-A"
                  value={oldSku}
                  onChange={(e) => setOldSku(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  New SKU Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., SKU-001-B"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
            </div>

            {/* Visual comparison */}
            {(oldValue || newValue) && (
              <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
                <div className="flex-1 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Old Weight</p>
                  <p className="text-lg font-bold text-red-400">{oldValue || "—"}</p>
                  {oldSku && <p className="text-xs text-muted-foreground mt-1">{oldSku}</p>}
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-muted-foreground mb-1">New Weight</p>
                  <p className="text-lg font-bold text-emerald-400">{newValue || "—"}</p>
                  {newSku && <p className="text-xs text-muted-foreground mt-1">{newSku}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PRICE CHANGE: old/new price + SKU codes ── */}
        {changeType === "price_change" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Old Price <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., $4.99"
                  value={oldValue}
                  onChange={(e) => setOldValue(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  New Price <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., $5.49"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Old SKU Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., SKU-001-A"
                  value={oldSku}
                  onChange={(e) => setOldSku(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  New SKU Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., SKU-001-B"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="bg-card border-border"
                />
              </div>
            </div>

            {/* Visual comparison */}
            {(oldValue || newValue) && (
              <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
                <div className="flex-1 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Old Price</p>
                  <p className="text-lg font-bold text-red-400">{oldValue || "—"}</p>
                  {oldSku && <p className="text-xs text-muted-foreground mt-1">{oldSku}</p>}
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-muted-foreground mb-1">New Price</p>
                  <p className="text-lg font-bold text-emerald-400">{newValue || "—"}</p>
                  {newSku && <p className="text-xs text-muted-foreground mt-1">{newSku}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Description / Notes (always shown once type is selected) ── */}
        {changeType && (
          <div className="space-y-2">
            <Label htmlFor="notes">
              Description of Change{" "}
              <span className="text-muted-foreground text-xs font-normal">(optional but recommended)</span>
            </Label>
            <Textarea
              id="notes"
              placeholder="Describe what changed and any additional context you want the AI to use when updating documents…"
              value={textNotes}
              onChange={(e) => setTextNotes(e.target.value)}
              rows={4}
              className="bg-card border-border resize-none"
            />
          </div>
        )}

        {/* ── Summary card before submit ── */}
        {canProceedStep1 && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
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

        {/* ── Submit button ── */}
        <Button
          onClick={handleSubmit}
          disabled={!canProceedStep1 || submitting}
          className="w-full gap-2"
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating Change Event…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Create Change Event &amp; Analyse Impact
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
