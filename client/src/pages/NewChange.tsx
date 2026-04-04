import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Upload, X, Plus, Wrench, Settings, FlaskConical,
  Package, Truck, Scale, ShieldAlert, Hammer, CheckCircle2, Loader2,
} from "lucide-react";

const CHANGE_TYPES = [
  { id: "hardware", label: "Hardware / Component", icon: Wrench, desc: "Physical part replaced with different specification" },
  { id: "process", label: "Process / Method", icon: Settings, desc: "How something is done changes without hardware change" },
  { id: "material", label: "Raw Material / Ingredient", icon: FlaskConical, desc: "Ingredient or raw material changed" },
  { id: "packaging", label: "Packaging / SKU", icon: Package, desc: "Wrapper, format, grammage, or price code changed" },
  { id: "supplier", label: "Supplier / Vendor", icon: Truck, desc: "Same part now sourced from different supplier" },
  { id: "regulatory", label: "Regulatory / Compliance", icon: Scale, desc: "External regulation or standard changed" },
  { id: "safety", label: "Safety Incident / Near-Miss", icon: ShieldAlert, desc: "Incident revealed documentation gap" },
  { id: "maintenance", label: "Maintenance Finding", icon: Hammer, desc: "Inspection revealed documents need updating" },
];

const CHANGE_SCOPES = [
  { id: "substitution", label: "Like-for-like substitution", desc: "Same spec, different brand/supplier" },
  { id: "upgrade", label: "Performance upgrade", desc: "Different spec, improved capability" },
  { id: "new_introduction", label: "New introduction", desc: "Entirely new component or SKU" },
];

const ASSET_TYPES = [
  { id: "drawing_old", label: "Drawing — Old Part" },
  { id: "drawing_new", label: "Drawing — New Part" },
  { id: "photo_old", label: "Photo — Old Part/Packaging" },
  { id: "photo_new", label: "Photo — New Part/Packaging" },
  { id: "sds", label: "Safety Data Sheet (SDS)" },
  { id: "other", label: "Other Supporting Document" },
];

type SkuRow = { fieldName: string; oldValue: string; newValue: string; unit: string };
type AssetUpload = { assetType: string; file: File; preview?: string };

export default function NewChange() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);

  // Form state
  const [title, setTitle] = useState("");
  const [changeType, setChangeType] = useState("");
  const [changeScope, setChangeScope] = useState("substitution");
  const [affectedEquipment, setAffectedEquipment] = useState("");
  const [affectedSku, setAffectedSku] = useState("");
  const [textNotes, setTextNotes] = useState("");
  const [skuRows, setSkuRows] = useState<SkuRow[]>([{ fieldName: "", oldValue: "", newValue: "", unit: "" }]);
  const [assets, setAssets] = useState<AssetUpload[]>([]);
  const [createdEventId, setCreatedEventId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAssetType, setPendingAssetType] = useState("drawing_old");

  const createMutation = trpc.changeEvents.create.useMutation();
  const uploadAssetMutation = trpc.changeEvents.uploadAsset.useMutation();
  const addSkuMutation = trpc.changeEvents.addSkuChange.useMutation();
  const utils = trpc.useUtils();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
    setAssets((prev) => [...prev, { assetType: pendingAssetType, file, preview }]);
    e.target.value = "";
  };

  const removeAsset = (idx: number) => {
    setAssets((prev) => prev.filter((_, i) => i !== idx));
  };

  const addSkuRow = () => {
    setSkuRows((prev) => [...prev, { fieldName: "", oldValue: "", newValue: "", unit: "" }]);
  };

  const updateSkuRow = (idx: number, field: keyof SkuRow, value: string) => {
    setSkuRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeSkuRow = (idx: number) => {
    setSkuRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title || !changeType) {
      toast.error("Please fill in the title and change type.");
      return;
    }
    setSubmitting(true);
    try {
      const event = await createMutation.mutateAsync({
        title,
        changeType: changeType as "hardware" | "process" | "material" | "packaging" | "supplier" | "regulatory" | "safety" | "maintenance",
        changeScope: changeScope as "substitution" | "upgrade" | "new_introduction",
        affectedEquipment: affectedEquipment || undefined,
        affectedSku: affectedSku || undefined,
        textNotes: textNotes || undefined,
      });

      const eventId = event?.id;
      if (!eventId) throw new Error("Failed to create event");
      setCreatedEventId(eventId);

      // Upload assets
      for (const asset of assets) {
        const fileDataBase64 = await fileToBase64(asset.file);
        await uploadAssetMutation.mutateAsync({
          changeEventId: eventId,
          assetType: asset.assetType as "drawing_old" | "drawing_new" | "photo_old" | "photo_new" | "sds" | "other",
          fileName: asset.file.name,
          mimeType: asset.file.type,
          fileDataBase64,
        });
      }

      // Add SKU changes
      const validSkuRows = skuRows.filter((r) => r.fieldName.trim());
      for (const row of validSkuRows) {
        await addSkuMutation.mutateAsync({
          changeEventId: eventId,
          fieldName: row.fieldName,
          oldValue: row.oldValue || undefined,
          newValue: row.newValue || undefined,
          unit: row.unit || undefined,
        });
      }

      await utils.changeEvents.list.invalidate();
      toast.success("Change event created successfully!");
      setLocation(`/changes/${eventId}`);
    } catch (err) {
      toast.error("Failed to create change event. Please try again.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const canProceedStep1 = title.trim() && changeType;
  const canProceedStep2 = true; // assets are optional

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => setLocation("/")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">New Change Event</h1>
          <p className="text-sm text-muted-foreground">Step {step} of 3</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      {/* Step 1 — Change Details */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Change Details</h2>
            <p className="text-sm text-muted-foreground">Describe the engineering change and select its type.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Change Event Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Motor replacement on Detergent Line 3 — 5.5kW to 7.5kW"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-card border-border"
            />
          </div>

          <div className="space-y-2">
            <Label>Change Type *</Label>
            <div className="grid grid-cols-2 gap-3">
              {CHANGE_TYPES.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => setChangeType(ct.id)}
                  className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                    changeType === ct.id
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border bg-card hover:border-primary/40 hover:bg-accent/20"
                  }`}
                >
                  <ct.icon className={`h-5 w-5 mt-0.5 shrink-0 ${changeType === ct.id ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className={`text-sm font-medium leading-tight ${changeType === ct.id ? "text-primary" : "text-foreground"}`}>{ct.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{ct.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Change Scope</Label>
            <div className="grid grid-cols-3 gap-3">
              {CHANGE_SCOPES.map((cs) => (
                <button
                  key={cs.id}
                  onClick={() => setChangeScope(cs.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    changeScope === cs.id
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <p className={`text-xs font-semibold ${changeScope === cs.id ? "text-primary" : "text-foreground"}`}>{cs.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{cs.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="equipment">Affected Equipment</Label>
              <Input
                id="equipment"
                placeholder="e.g., Detergent Line 3 — Filler Motor"
                value={affectedEquipment}
                onChange={(e) => setAffectedEquipment(e.target.value)}
                className="bg-card border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">Affected SKU</Label>
              <Input
                id="sku"
                placeholder="e.g., SURF-500G-BLUE"
                value={affectedSku}
                onChange={(e) => setAffectedSku(e.target.value)}
                className="bg-card border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              placeholder="Describe any procedural changes, e.g., lubrication frequency changed from weekly to fortnightly, new motor runs hotter so inspection interval reduced…"
              value={textNotes}
              onChange={(e) => setTextNotes(e.target.value)}
              rows={4}
              className="bg-card border-border resize-none"
            />
          </div>

          <Button onClick={() => setStep(2)} disabled={!canProceedStep1} className="w-full gap-2">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2 — Upload Assets */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Upload Change Assets</h2>
            <p className="text-sm text-muted-foreground">Upload drawings, photos, SDS documents, or other supporting files. All uploads are optional but improve AI accuracy.</p>
          </div>

          {/* Asset type selector + upload */}
          <div className="space-y-3">
            <Label>Select Asset Type & Upload</Label>
            <div className="flex gap-3">
              <select
                value={pendingAssetType}
                onChange={(e) => setPendingAssetType(e.target.value)}
                className="flex-1 bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {ASSET_TYPES.map((at) => (
                  <option key={at.id} value={at.id}>{at.label}</option>
                ))}
              </select>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 shrink-0"
              >
                <Upload className="h-4 w-4" />
                Choose File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls,.doc,.docx,.dwg,.dxf"
                onChange={handleFileSelect}
              />
            </div>
          </div>

          {/* Uploaded assets list */}
          {assets.length > 0 && (
            <div className="space-y-2">
              <Label>Uploaded Files ({assets.length})</Label>
              <div className="space-y-2">
                {assets.map((asset, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                    {asset.preview ? (
                      <img src={asset.preview} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{asset.file.name}</p>
                      <p className="text-xs text-muted-foreground">{ASSET_TYPES.find((a) => a.id === asset.assetType)?.label}</p>
                    </div>
                    <button onClick={() => removeAsset(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)} className="flex-1 gap-2">
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — Parameter / SKU Changes */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Parameter & Code Changes</h2>
            <p className="text-sm text-muted-foreground">Record specific old vs. new values — price, grammage, frequency, speed, temperature, or any other parameter that changed.</p>
          </div>

          <div className="space-y-3">
            {skuRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4 space-y-1">
                  {idx === 0 && <Label className="text-xs">Parameter Name</Label>}
                  <Input
                    placeholder="e.g., Motor Speed"
                    value={row.fieldName}
                    onChange={(e) => updateSkuRow(idx, "fieldName", e.target.value)}
                    className="bg-card border-border text-sm"
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  {idx === 0 && <Label className="text-xs">Old Value</Label>}
                  <Input
                    placeholder="e.g., 1450"
                    value={row.oldValue}
                    onChange={(e) => updateSkuRow(idx, "oldValue", e.target.value)}
                    className="bg-card border-border text-sm"
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  {idx === 0 && <Label className="text-xs">New Value</Label>}
                  <Input
                    placeholder="e.g., 1800"
                    value={row.newValue}
                    onChange={(e) => updateSkuRow(idx, "newValue", e.target.value)}
                    className="bg-card border-border text-sm"
                  />
                </div>
                <div className="col-span-1 space-y-1">
                  {idx === 0 && <Label className="text-xs">Unit</Label>}
                  <Input
                    placeholder="RPM"
                    value={row.unit}
                    onChange={(e) => updateSkuRow(idx, "unit", e.target.value)}
                    className="bg-card border-border text-sm"
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  {skuRows.length > 1 && (
                    <button onClick={() => removeSkuRow(idx)} className="text-muted-foreground hover:text-destructive transition-colors mb-1">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addSkuRow} className="gap-2 mt-2">
              <Plus className="h-3.5 w-3.5" /> Add Parameter
            </Button>
          </div>

          {/* Summary */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Ready to Submit
            </h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-2"><span className="text-muted-foreground w-28 shrink-0">Title:</span><span className="text-foreground">{title}</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground w-28 shrink-0">Change Type:</span><span className="text-foreground capitalize">{changeType.replace("_", " ")}</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground w-28 shrink-0">Assets:</span><span className="text-foreground">{assets.length} file(s)</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground w-28 shrink-0">Parameters:</span><span className="text-foreground">{skuRows.filter((r) => r.fieldName).length} row(s)</span></div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1 gap-2">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><CheckCircle2 className="h-4 w-4" /> Create Change Event</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
