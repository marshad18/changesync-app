/*
 * ChangeSync PRD — Home Page
 * Design: Swiss Grid Modernism + Technical Documentation Aesthetic
 * Typography: DM Serif Display (headings) + DM Sans (body)
 * Palette: White bg, Deep Charcoal (#1C2333) text, Steel Blue (#2563EB) accent
 * Layout: Full-width sections, left-aligned content, section watermarks, sticky TOC
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Layers,
  Settings,
  Shield,
  Upload,
  Users,
  Zap,
  BookOpen,
  GitBranch,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TocItem {
  id: string;
  label: string;
  number: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const HERO_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663512874708/TxojoL5tdf95T3EwoQPj7R/hero-banner-ZJ5Ajukqjfwxdy49AVFw4U.webp";
const PROBLEM_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663512874708/TxojoL5tdf95T3EwoQPj7R/problem-illustration-XVmtZehdbNxdYzpnysbeCv.webp";
const AI_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663512874708/TxojoL5tdf95T3EwoQPj7R/ai-analysis-kTccatBarD4xHbUjU9zu3M.webp";

const TOC_ITEMS: TocItem[] = [
  { id: "executive-summary", label: "Executive Summary", number: "01" },
  { id: "problem-statement", label: "Problem Statement", number: "02" },
  { id: "document-types", label: "Document Types", number: "03" },
  { id: "change-taxonomy", label: "Change Taxonomy", number: "04" },
  { id: "objectives", label: "Objectives & KRs", number: "05" },
  { id: "features", label: "Core Features", number: "06" },
  { id: "user-flow", label: "User Flow", number: "07" },
  { id: "non-functional", label: "Non-Functional Req.", number: "08" },
  { id: "future", label: "Future Roadmap", number: "09" },
];

// ─── Document Types Data ───────────────────────────────────────────────────────
const DOCUMENT_TYPES = [
  {
    code: "CIL",
    name: "Clean, Inspect, Lubricate",
    category: "Operator",
    owner: "Production / AM Team",
    description:
      "A structured checklist defining exactly how, when, and with what materials an operator must clean, inspect, and lubricate each piece of equipment. It specifies the cleaning method, inspection checkpoints, lubrication points, and the frequency of each activity. When a component changes, the CIL must be updated to reflect new cleaning access points, new inspection criteria, and any revised lubrication requirements.",
    updateTriggers: [
      "New component with different cleaning access or method",
      "Change in lubrication type or frequency",
      "New inspection checkpoints introduced by the new part",
    ],
  },
  {
    code: "CPE",
    name: "Centerline Process Equipment",
    category: "Engineering",
    owner: "Process Engineering",
    description:
      "Records the optimal (centerline) settings for all controllable parameters of a piece of equipment — speed, temperature, pressure, tension. These target values ensure consistent product quality. When a component is changed (e.g., a new motor), the centerline values must be re-established and documented to reflect the new operating envelope.",
    updateTriggers: [
      "Change in motor, drive, or actuator affecting speed or torque",
      "New component with different operating parameters",
      "Process re-optimisation after hardware change",
    ],
  },
  {
    code: "Safety Map",
    name: "Safety Map",
    category: "Safety",
    owner: "HSE Manager",
    description:
      "Maps all safety-critical points on a machine — lockout/tagout (LOTO) points, pinch points, burn hazards, electrical hazards, and required PPE for each task. When new components are installed, new hazard zones may be introduced (e.g., a higher-temperature motor creates a new burn risk), and the Safety Map must be updated accordingly.",
    updateTriggers: [
      "New component introducing a new hazard type (heat, pressure, electrical)",
      "Change in LOTO isolation points",
      "New PPE requirements for the changed component",
    ],
  },
  {
    code: "SOC Map",
    name: "Standard Operating Conditions Map",
    category: "Operations",
    owner: "Production Engineering",
    description:
      "Defines the standard operating conditions for a line or machine — normal ranges for all key process variables such as speed, temperature, pressure, and flow rate. Distinguishes between normal operating ranges, warning ranges, and out-of-spec conditions. A component change that alters the machine's operating envelope requires the SOC Map to be updated with new normal and alarm ranges.",
    updateTriggers: [
      "Change in operating speed, temperature, or pressure envelope",
      "New component with different normal operating ranges",
      "Revised alarm or shutdown thresholds",
    ],
  },
  {
    code: "HTRA Map",
    name: "Hazard & Task Risk Assessment Map",
    category: "Safety",
    owner: "HSE Manager",
    description:
      "A formal risk assessment identifying all hazards associated with performing maintenance and operational tasks on a machine, assessing the risk level of each, and specifying controls to mitigate them. When a component changes, the associated tasks change and new hazards may be introduced — requiring a full re-assessment of the affected task steps.",
    updateTriggers: [
      "New component introducing new maintenance tasks",
      "Change in energy sources (electrical, hydraulic, pneumatic)",
      "New hazards identified from the changed component",
    ],
  },
  {
    code: "LUBE Map",
    name: "Lubrication Map",
    category: "Maintenance",
    owner: "Maintenance Lead",
    description:
      "A detailed map of all lubrication points on a machine, specifying the lubricant type, quantity, application method, and frequency for each point. A critical maintenance document that prevents premature wear and equipment failure. When a new component is installed, its lubrication requirements must be added and the old entry updated or removed.",
    updateTriggers: [
      "New component with different lubrication points or requirements",
      "Change in lubricant type or grade specified by the new component's OEM",
      "Change in lubrication frequency",
    ],
  },
  {
    code: "Fastener Map",
    name: "Fastener Torque Map",
    category: "Maintenance",
    owner: "Maintenance Lead",
    description:
      "Specifies the correct torque values for every critical fastener on a machine. Correct torque is essential for both safety and equipment integrity — under-torqued fasteners can loosen and cause failures, while over-torqued fasteners can strip threads or crack components. When a new component is installed, its fastener specifications must be documented.",
    updateTriggers: [
      "New component with different fastener sizes or grades",
      "Change in torque specifications from the OEM",
      "New bolted joints introduced by the changed component",
    ],
  },
  {
    code: "MTM",
    name: "Methods-Time Measurement",
    category: "Engineering",
    owner: "Industrial Engineering",
    description:
      "A work measurement document that breaks down a task into its fundamental motions and assigns a standard time to each. Used to set time standards for operator tasks, calculate line capacity, and identify inefficiencies. When a component change alters the physical motions required to operate or maintain a machine, the MTM study must be revised.",
    updateTriggers: [
      "New component requiring different physical motions to operate or access",
      "Change in task sequence due to new component layout",
      "Significant change in task duration",
    ],
  },
  {
    code: "WPA",
    name: "Workplace Analysis",
    category: "Engineering",
    owner: "Industrial Engineering",
    description:
      "Analyses the ergonomics, layout, and efficiency of the operator's workplace around a machine — reach distances, sight lines, tool placement, and physical demands. A component change that alters the physical configuration of the machine may require a revised WPA to ensure the operator's workplace remains ergonomically sound.",
    updateTriggers: [
      "Component relocation changing operator reach or posture",
      "New component altering the physical layout of the machine",
      "Change in tool requirements for the new component",
    ],
  },
  {
    code: "Manuals",
    name: "Equipment Manuals",
    category: "Operations",
    owner: "Engineering / OEM",
    description:
      "The primary operational and technical reference documents for a machine, covering installation, operation, adjustment, and basic troubleshooting. They include target operating parameters that operators must adhere to. When a component is changed, the relevant sections — particularly operating parameters and adjustment procedures — must be updated to prevent operators running the new component outside its safe limits.",
    updateTriggers: [
      "New component with different operating parameters or limits",
      "Change in adjustment or setup procedures",
      "New component requiring different operational steps",
    ],
  },
  {
    code: "OPLs",
    name: "One-Point Lessons",
    category: "Operator",
    owner: "Production / AM Team",
    description:
      "Short, single-page visual training documents that teach operators one specific skill or piece of knowledge — how to identify a normal vs. abnormal condition, or how to perform a specific adjustment. OPLs are the primary tool for communicating changes to operators on the shop floor. When a component changes, new OPLs must be created to teach operators about the new component.",
    updateTriggers: [
      "New component requiring operators to learn new normal/abnormal conditions",
      "New adjustment or setup procedure introduced by the change",
      "New safety awareness required for the changed component",
    ],
  },
  {
    code: "Troubleshooting",
    name: "Troubleshooting Guide",
    category: "Maintenance",
    owner: "Maintenance Lead / Engineering",
    description:
      "A structured diagnostic guide that helps operators and technicians identify the root cause of equipment failures and resolve them systematically. Lists common failure modes, their symptoms, probable causes, and corrective actions. When a new component is installed, its specific failure modes and diagnostic steps must be added and old entries updated.",
    updateTriggers: [
      "New component with different failure modes or symptoms",
      "Change in diagnostic steps due to new component architecture",
      "New corrective actions required for the changed component",
    ],
  },
  {
    code: "AM Step 3/4/5",
    name: "Autonomous Maintenance Steps 3, 4 & 5",
    category: "Operator",
    owner: "AM Pillar Team",
    description:
      "Documents associated with the Autonomous Maintenance programme's advanced steps. Step 3 establishes CIL standards; Step 4 covers general inspection standards where operators learn to detect abnormalities; Step 5 empowers operators to perform autonomous inspections independently. When a component changes, inspection standards and abnormality criteria must be updated across all three steps.",
    updateTriggers: [
      "New component with different inspection points or abnormality criteria",
      "Change in CIL standards for the affected equipment",
      "New component requiring operators to learn new inspection skills",
    ],
  },
  {
    code: "Spare List",
    name: "Spare Parts List",
    category: "Maintenance",
    owner: "Maintenance / Procurement",
    description:
      "A master list of all spare parts held in inventory for a machine, including part numbers, descriptions, quantities, lead times, and reorder points. When a component is changed, old part entries must be reviewed (some may become obsolete), and the new component's spare parts must be added with correct part numbers and recommended stock levels.",
    updateTriggers: [
      "New component with different spare part requirements",
      "Old component spares becoming obsolete",
      "New sub-components requiring dedicated inventory",
    ],
  },
  {
    code: "PM Plan",
    name: "Preventative Maintenance Plan",
    category: "Maintenance",
    owner: "Maintenance Lead",
    description:
      "A scheduled plan defining all preventative maintenance tasks for a machine — what to do, how to do it, how often, and by whom. The backbone of equipment reliability. When a component changes, PM tasks associated with that component must be updated: old tasks removed, new tasks added, and frequencies revised based on the new component's OEM recommendations.",
    updateTriggers: [
      "New component with different PM task requirements or frequencies",
      "Change in OEM-recommended maintenance intervals",
      "New component introducing new PM task types (filter replacement, belt tension)",
    ],
  },
];

// ─── Change Taxonomy Data ──────────────────────────────────────────────────────
const CHANGE_CATEGORIES = [
  {
    id: "hardware",
    number: "C1",
    title: "Hardware / Component Change",
    tag: "Your Original Case",
    tagColor: "bg-blue-100 text-blue-700",
    description:
      "A physical part on the machine is replaced with a different part — same function, different specification. The motor swap in your detergent example is the classic instance. This is the most visible trigger, but it is only one of eight categories.",
    whatsMissing: [
      {
        label: "Sub-component changes",
        detail:
          "Sometimes only a bearing, seal, or coupling within a larger assembly changes. The parent component looks the same but its internals are different — this can affect the LUBE Map and Spare List without touching the Safety Map or SOC Map.",
      },
      {
        label: "Substitution vs. upgrade",
        detail:
          "A like-for-like replacement (same spec, different brand) has a narrower document impact than a performance upgrade. The platform should ask this upfront — the answer determines which documents are triggered.",
      },
      {
        label: "Temporary vs. permanent change",
        detail:
          "A temporary workaround part (used while the correct part is on order) should trigger a time-limited document update, not a permanent one. This workflow distinction is not currently addressed.",
      },
    ],
    impactedDocs: ["CIL", "CPE", "Safety Map", "SOC Map", "HTRA Map", "LUBE Map", "Fastener Map", "MTM", "WPA", "Manuals", "OPLs", "Troubleshooting", "AM Step 3/4/5", "Spare List", "PM Plan"],
    inputNeeded: "Drawings (old/new), photos (old/new), parameter codes, text prompt — already in your model.",
  },
  {
    id: "process",
    number: "C2",
    title: "Process / Method Change",
    tag: "Not in your model",
    tagColor: "bg-amber-100 text-amber-700",
    description:
      "The way something is done changes, even if no physical hardware changes. Examples: the sequence of assembly steps is reordered, a manual task is automated, the line speed is permanently increased, or a new quality check is inserted into the process.",
    whatsMissing: [
      {
        label: "No drawings or photos needed",
        detail:
          "The trigger is purely procedural. Your current input model handles this only through the free-text prompt, which is insufficient for structured process changes where old and new step sequences need to be compared.",
      },
      {
        label: "Line speed changes",
        detail:
          "A permanent increase in line speed affects MTM time standards, SOC Map operating conditions, and potentially the CIL frequency — but no hardware changes at all.",
      },
    ],
    impactedDocs: ["CIL", "CPE", "SOC Map", "HTRA Map", "MTM", "WPA", "Manuals", "OPLs", "AM Step 3/4/5"],
    inputNeeded: "Structured form: old step sequence vs. new step sequence, old line speed vs. new line speed, old batch size vs. new batch size.",
  },
  {
    id: "material",
    number: "C3",
    title: "Raw Material / Ingredient Change",
    tag: "Not in your model",
    tagColor: "bg-amber-100 text-amber-700",
    description:
      "The raw material or ingredient going into the product changes. In detergent manufacturing: a surfactant is swapped, a fragrance ingredient is replaced, or a preservative is changed. This is distinct from a packaging change — it affects what goes inside the pack, not the pack itself.",
    whatsMissing: [
      {
        label: "Safety Data Sheet (SDS) as a primary input",
        detail:
          "A new chemical ingredient has a different hazard profile. The SDS is the authoritative source for hazard information and directly drives Safety Map and HTRA Map updates. The platform should accept SDS uploads and parse them automatically.",
      },
      {
        label: "Processing parameter changes",
        detail:
          "A new ingredient may require different temperatures, pressures, or mixing speeds — affecting the SOC Map and CPE Centerlines even though no hardware changed.",
      },
    ],
    impactedDocs: ["CIL", "CPE", "Safety Map", "SOC Map", "HTRA Map", "Manuals", "OPLs", "Troubleshooting", "AM Step 3/4/5"],
    inputNeeded: "Old material name/code, new material name/code, SDS upload for the new material.",
  },
  {
    id: "packaging",
    number: "C4",
    title: "Packaging / SKU Change",
    tag: "Partially in your model",
    tagColor: "bg-green-100 text-green-700",
    description:
      "You described this partially (old/new wrapper, old/new grammage, old/new price code). But it is broader than considered. Sub-types include format changes (500g → 1kg), packaging material changes (plastic → paper film), label/artwork changes, pack count changes, and full new SKU introductions.",
    whatsMissing: [
      {
        label: "Packaging material changes",
        detail:
          "Switching from plastic film to paper film changes the sealing temperature, the cleaning method (paper dust vs. plastic residue), and machine settings — affecting CIL, CPE, and SOC Map.",
      },
      {
        label: "New SKU introduction",
        detail:
          "A completely new product variant introduced on an existing line is the highest-impact packaging change and can trigger updates to nearly all 14 documents. The platform should flag this as a high-scope change.",
      },
      {
        label: "Change Type classifier",
        detail:
          "A 'Change Type' selector at the start of each change event (format change, material change, label change, new SKU) helps the AI narrow down the document impact before running the full analysis.",
      },
    ],
    impactedDocs: ["CIL", "CPE", "SOC Map", "MTM", "WPA", "Manuals", "OPLs"],
    inputNeeded: "Already partially covered. Add a Change Type classifier (format / material / label / new SKU).",
  },
  {
    id: "supplier",
    number: "C5",
    title: "Supplier / Vendor Change",
    tag: "Not in your model",
    tagColor: "bg-amber-100 text-amber-700",
    description:
      "The same part or material is now sourced from a different supplier. The specification may be nominally identical, but the physical reality is often slightly different. This is the most common source of 'silent' document drift — the part looks the same, the drawing is the same, but the details differ.",
    whatsMissing: [
      {
        label: "Different OEM maintenance requirements",
        detail:
          "The new supplier's motor may have different bearing types inside, requiring different lubrication. The new supplier's packaging film may have different sealing parameters. These differences are only visible in the new supplier's technical data sheet.",
      },
      {
        label: "New part numbers",
        detail:
          "Even a like-for-like supplier change means all part numbers in the Spare List must be updated — a change that is easy to miss but critical for maintenance response time.",
      },
    ],
    impactedDocs: ["LUBE Map", "Fastener Map", "Manuals", "OPLs", "Troubleshooting", "Spare List", "PM Plan", "SOC Map"],
    inputNeeded: "Old supplier name/part number, new supplier name/part number, new supplier's technical data sheet or OEM manual upload.",
  },
  {
    id: "regulatory",
    number: "C6",
    title: "Regulatory / Compliance Change",
    tag: "Not in your model",
    tagColor: "bg-red-100 text-red-700",
    description:
      "An external regulation, standard, or legal requirement changes, forcing the plant to update its procedures even though nothing physical has changed on the machine or product. Missing a regulatory-driven document update is not just an operational risk — it is a legal and compliance risk.",
    whatsMissing: [
      {
        label: "Entirely absent from the current concept",
        detail:
          "New food safety regulations requiring additional cleaning validation steps, new chemical restrictions requiring Safety Map updates, or updated ISO standards requiring new documentation steps — none of these are captured by the current input model.",
      },
      {
        label: "Effective date tracking",
        detail:
          "Regulatory changes have mandatory effective dates. The platform must track when a regulatory-driven document update must be completed and approved, not just that it needs to happen.",
      },
    ],
    impactedDocs: ["CIL", "Safety Map", "HTRA Map", "Manuals", "OPLs", "PM Plan"],
    inputNeeded: "Regulation name/number, specific clause that changed, effective date, description of what the new requirement mandates.",
  },
  {
    id: "safety",
    number: "C7",
    title: "Safety Incident / Near-Miss",
    tag: "Not in your model",
    tagColor: "bg-red-100 text-red-700",
    description:
      "A safety incident, near-miss, or formal risk assessment reveals that existing documents are incorrect or insufficient — even without any physical change to the equipment or product. This is a document-only change driven by real-world evidence of a documentation gap.",
    whatsMissing: [
      {
        label: "Document-only correction path",
        detail:
          "No hardware, process, or material has changed. But the existing document is wrong. The platform currently has no input path for this — it assumes all changes are triggered by physical or process changes.",
      },
      {
        label: "CAPA linkage",
        detail:
          "Safety incidents typically generate a Corrective Action / Preventive Action (CAPA). The platform should link document updates to the originating CAPA for traceability and audit purposes.",
      },
    ],
    impactedDocs: ["CIL", "Safety Map", "HTRA Map", "OPLs", "AM Step 3/4/5"],
    inputNeeded: "Incident description, document(s) identified as incorrect, specific correction required. No drawings or photos needed.",
  },
  {
    id: "maintenance",
    number: "C8",
    title: "Maintenance Finding / Condition-Based Change",
    tag: "Not in your model",
    tagColor: "bg-amber-100 text-amber-700",
    description:
      "During a planned maintenance shutdown or inspection, the team discovers that the equipment's actual condition differs from what the documents describe. This is not a failure — it is a finding. It represents the plant learning from operational data and updating documents to reflect reality.",
    whatsMissing: [
      {
        label: "Continuous improvement trigger",
        detail:
          "The PM Plan says to replace a belt every 6 months, but inspections consistently show it is still good at 6 months and worn at 9 months. The PM Plan interval should be updated — but there is no input path for this finding.",
      },
      {
        label: "Lightweight approval path",
        detail:
          "Maintenance findings typically only need the Maintenance Lead's approval — not all 14 experts. The platform should support a lightweight, single-approver workflow for this change type.",
      },
    ],
    impactedDocs: ["CIL", "CPE", "SOC Map", "LUBE Map", "Fastener Map", "Troubleshooting", "AM Step 3/4/5", "Spare List", "PM Plan"],
    inputNeeded: "Document that needs updating, specific section, current (incorrect) value, proposed (correct) value. Lightweight approval workflow.",
  },
];

// ─── Impact Matrix Data ────────────────────────────────────────────────────────
const DOC_CODES = ["CIL", "CPE", "Safety", "SOC", "HTRA", "LUBE", "Fastener", "MTM", "WPA", "Manuals", "OPLs", "Trouble.", "AM 3/4/5", "Spare", "PM Plan"];
const CHANGE_CODES = ["C1\nHardware", "C2\nProcess", "C3\nMaterial", "C4\nPkg", "C5\nSupplier", "C6\nRegulatory", "C7\nSafety", "C8\nMaint."];

const IMPACT_MATRIX = [
  // CIL
  [true, true, true, true, true, true, true, true],
  // CPE
  [true, true, true, true, true, false, false, true],
  // Safety Map
  [true, false, true, false, false, true, true, false],
  // SOC Map
  [true, true, true, true, true, false, false, true],
  // HTRA Map
  [true, true, true, false, false, true, true, false],
  // LUBE Map
  [true, false, false, false, true, false, false, true],
  // Fastener Map
  [true, false, false, false, true, false, false, true],
  // MTM
  [true, true, false, true, false, false, false, false],
  // WPA
  [true, true, false, true, false, false, false, false],
  // Manuals
  [true, true, true, true, true, true, false, false],
  // OPLs
  [true, true, true, true, true, true, true, false],
  // Troubleshooting
  [true, true, true, false, true, false, false, true],
  // AM Step 3/4/5
  [true, true, true, false, false, false, true, true],
  // Spare List
  [true, false, false, false, true, false, false, false],
  // PM Plan
  [true, false, false, false, true, true, false, true],
];

// ─── Other Section Data ────────────────────────────────────────────────────────
const OBJECTIVES = [
  {
    number: "OBJ 1",
    title: "Automate Impact Analysis",
    krs: [
      "Reduce time to identify impacted documents by 90% — from days to minutes.",
      "Achieve 99% accuracy in identifying all affected documents from a given change input.",
    ],
    icon: <Zap size={22} />,
  },
  {
    number: "OBJ 2",
    title: "Streamline Document Updates",
    krs: [
      "Automate drafting of updates for at least 80% of standard manufacturing documents.",
      "Reduce end-to-end document update and approval cycle time by 75%.",
    ],
    icon: <FileText size={22} />,
  },
  {
    number: "OBJ 3",
    title: "Reduce Unplanned Downtime",
    krs: [
      "Decrease unplanned downtime incidents attributed to outdated documentation by 95% within the first year.",
    ],
    icon: <Clock size={22} />,
  },
];

const FEATURES = [
  {
    number: "6.1",
    title: "Input & Data Ingestion Module",
    icon: <Upload size={20} />,
    description:
      "A seamless interface for capturing the full context of an engineering change across multiple input modalities, adapting to all eight change categories.",
    items: [
      { label: "Change Type Selector", detail: "User selects the change category upfront (Hardware, Process, Material, Packaging, Supplier, Regulatory, Safety Incident, Maintenance Finding). The input form adapts to show only the relevant fields." },
      { label: "Visual Uploads", detail: "Upload engineering drawings (CAD, PDF) of both old and new parts side-by-side." },
      { label: "Photographic Evidence", detail: "Upload pictures of old and new components — wrappers, packets, motors, and assemblies." },
      { label: "Parameter / Code Updates", detail: "Structured fields for SKU-level changes: old vs. new price, grammage, frequency, and other numeric parameters." },
      { label: "SDS Upload", detail: "For material and supplier changes, upload the Safety Data Sheet for the new material. The AI parses it to populate hazard information into Safety Map and HTRA Map updates." },
      { label: "Natural Language Prompt", detail: "A free-text field where engineers describe procedural changes in plain English." },
      { label: "Document Stack Upload", detail: "Bulk upload of the current versions of all 14+ manufacturing documents associated with the affected equipment." },
    ],
  },
  {
    number: "6.2",
    title: "AI-Powered Impact Analysis Engine",
    icon: <Layers size={20} />,
    description:
      "The core intelligence layer that cross-references change inputs against the document stack to identify every affected section.",
    items: [
      { label: "Contextual Understanding", detail: "Processes visual inputs, structured data, SDS documents, and unstructured text to build a holistic model of the engineering change." },
      { label: "Document Parsing", detail: "Parses PDFs, Word documents, and Excel sheets to understand current content, structure, and purpose." },
      { label: "Impact Mapping", detail: "Cross-references the change context with parsed documents to identify exactly which documents and which specific sections require updates." },
      { label: "Impact Report Dashboard", detail: "Generates a clear, actionable report listing all impacted documents with highlighted sections requiring change." },
    ],
  },
  {
    number: "6.3",
    title: "Automated Document Update & Drafting",
    icon: <Settings size={20} />,
    description:
      "AI-generated draft updates that incorporate new parameters, images, and instructions while preserving document formatting.",
    items: [
      { label: "Draft Generation", detail: "Automatically generates updated content for impacted sections, incorporating new parameters and instructions." },
      { label: "Version Control", detail: "Maintains strict versioning with side-by-side redline comparisons of original versus AI-generated drafts." },
      { label: "Formatting Retention", detail: "Preserves original document formatting — CIL checklists remain tabular, PM plans retain their structure." },
    ],
  },
  {
    number: "6.4",
    title: "Approval Workflow & Distribution",
    icon: <Users size={20} />,
    description:
      "A streamlined review and sign-off mechanism that routes updated documents to the right subject matter experts — with lightweight paths for low-scope changes.",
    items: [
      { label: "Automated Routing", detail: "Routes draft documents to the appropriate SME based on document type — PM plans to Maintenance Lead, Safety Maps to HSE Manager." },
      { label: "Lightweight Approval Path", detail: "For maintenance findings and safety corrections, only the relevant document owner needs to approve — not all 14 experts." },
      { label: "Review Interface", detail: "Intuitive interface for approvers to review, edit, comment on, or approve AI-generated changes." },
      { label: "Publishing", detail: "Once approved, documents are instantly published to the central repository accessible by operators on the shop floor." },
    ],
  },
];

const USER_FLOW_STEPS = [
  { step: "01", title: "Select Change Type", description: "Engineer selects the change category: Hardware, Process, Material, Packaging, Supplier, Regulatory, Safety Incident, or Maintenance Finding. The input form adapts accordingly." },
  { step: "02", title: "Upload Change Assets", description: "Engineer uploads drawings, photographs, SDS documents, or parameter changes relevant to the selected change type." },
  { step: "03", title: "Describe Procedural Changes", description: "Engineer types a brief natural language description of any procedural changes — lubrication frequency, maintenance steps, target operating parameters." },
  { step: "04", title: "Upload Document Stack", description: "Engineer uploads the current versions of the 14+ manuals and standard documents associated with the affected equipment or SKU." },
  { step: "05", title: "AI Impact Analysis", description: "ChangeSync processes all inputs and within minutes highlights exactly which documents are impacted and which specific sections require updates." },
  { step: "06", title: "Review Impact Dashboard", description: "Engineer reviews the impact analysis dashboard, confirming the scope of changes before proceeding to the drafting phase." },
  { step: "07", title: "AI Draft Generation", description: "The platform automatically generates updated drafts for all impacted documents, with redlines showing every proposed change." },
  { step: "08", title: "SME Approval", description: "The system routes each updated document to the relevant subject matter expert. Low-scope changes (maintenance findings) follow a lightweight single-approver path." },
  { step: "09", title: "Instant Deployment", description: "Approved documents are immediately published and available to operators and maintenance staff on the shop floor — no delays, no missed updates." },
];

const NON_FUNCTIONAL = [
  { icon: <Shield size={20} />, title: "Security & Compliance", description: "ISO 27001-aligned data security. Proprietary manufacturing data, CAD drawings, and process parameters are encrypted at rest and in transit." },
  { icon: <Zap size={20} />, title: "Performance", description: "AI impact analysis on a standard stack of 15–20 documents must complete in under 5 minutes." },
  { icon: <Users size={20} />, title: "Usability", description: "Highly intuitive interface requiring minimal training for manufacturing engineers who may not be advanced software users." },
  { icon: <Layers size={20} />, title: "Integration Readiness", description: "Designed for future integration with PLM, ERP, and CMMS systems via open APIs." },
];

const FUTURE_ITEMS = [
  { tag: "Phase 2", title: "Direct ERP / PLM Integration", description: "Automatically pull the document stack from the company's existing PLM or ERP repository based on equipment ID, eliminating manual upload entirely." },
  { tag: "Phase 2", title: "Mobile Shop Floor Access", description: "A mobile application allowing operators to scan a QR code on any machine and instantly access the most recently approved CIL, OPL, or Troubleshooting Guide." },
  { tag: "Phase 3", title: "Predictive Change Analytics", description: "AI-driven recommendations for preventative maintenance schedules based on the frequency and nature of engineering changes occurring across the plant." },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("visible");
        });
      },
      { threshold: 0.08 }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/95 backdrop-blur-sm shadow-sm border-b border-border" : "bg-transparent"}`}>
      <div className="container flex items-center justify-between h-16">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Layers size={16} className="text-white" />
          </div>
          <span className="font-semibold text-foreground tracking-tight" style={{ fontFamily: "var(--font-body)" }}>
            ChangeSync
          </span>
          <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5 ml-1">PRD v1.0</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          {TOC_ITEMS.slice(0, 5).map((item) => (
            <a key={item.id} href={`#${item.id}`} className="hover:text-foreground transition-colors">{item.label}</a>
          ))}
        </nav>
        <div className="text-xs text-muted-foreground hidden lg:block">April 2026</div>
      </div>
    </header>
  );
}

function TableOfContents({ activeId }: { activeId: string }) {
  return (
    <aside className="hidden xl:block sticky top-24 h-fit w-56 shrink-0">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Contents</p>
      <nav className="flex flex-col gap-1">
        {TOC_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`flex items-center gap-2.5 text-sm py-1.5 px-2 rounded transition-all ${activeId === item.id ? "text-primary font-medium bg-accent" : "text-muted-foreground hover:text-foreground"}`}
          >
            <span className={`text-xs font-mono w-6 shrink-0 ${activeId === item.id ? "text-primary" : "text-muted-foreground/50"}`}>{item.number}</span>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="mt-8 pt-6 border-t border-border">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Prepared by the ChangeSync Product Team<br />
          <span className="font-medium text-foreground/60">April 2026</span>
        </p>
      </div>
    </aside>
  );
}

function SectionHeader({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="relative mb-12">
      <div className="section-watermark absolute -top-8 -left-4 select-none" aria-hidden="true">{number}</div>
      <div className="relative z-10 pt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Section {number}</p>
        <h2 className="text-4xl md:text-5xl text-foreground" style={{ fontFamily: "var(--font-display)" }}>{title}</h2>
        {subtitle && <p className="mt-4 text-lg text-muted-foreground max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Document Types Section ───────────────────────────────────────────────────
function DocumentTypesSection() {
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const categories = ["All", "Operator", "Engineering", "Safety", "Operations", "Maintenance"];
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered = activeCategory === "All"
    ? DOCUMENT_TYPES
    : DOCUMENT_TYPES.filter((d) => d.category === activeCategory);

  const categoryColors: Record<string, string> = {
    Operator: "bg-blue-50 text-blue-700 border-blue-200",
    Engineering: "bg-violet-50 text-violet-700 border-violet-200",
    Safety: "bg-red-50 text-red-700 border-red-200",
    Operations: "bg-amber-50 text-amber-700 border-amber-200",
    Maintenance: "bg-green-50 text-green-700 border-green-200",
  };

  return (
    <section id="document-types" className="mb-24 scroll-mt-24">
      <SectionHeader
        number="03"
        title="The 14 Document Types"
        subtitle="Every document that must be reviewed and potentially updated whenever an engineering change occurs. Each has a distinct owner, purpose, and set of change triggers."
      />

      {/* Category filter */}
      <div className="reveal flex flex-wrap gap-2 mb-8">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              activeCategory === cat
                ? "bg-primary text-white border-primary"
                : "bg-white text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            {cat}
            {cat !== "All" && (
              <span className="ml-1.5 text-xs opacity-60">
                {DOCUMENT_TYPES.filter((d) => d.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Summary count */}
      <p className="text-sm text-muted-foreground mb-6 reveal">
        Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {DOCUMENT_TYPES.length} document types
      </p>

      {/* Document cards */}
      <div className="space-y-3">
        {filtered.map((doc, i) => (
          <div
            key={doc.code}
            className="reveal border border-border rounded-xl overflow-hidden transition-all hover:border-primary/30"
            style={{ transitionDelay: `${i * 40}ms` }}
          >
            {/* Card header — always visible */}
            <button
              onClick={() => setActiveDoc(activeDoc === doc.code ? null : doc.code)}
              className="w-full flex items-center gap-4 p-5 text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="shrink-0 w-20">
                <span className="doc-badge">{doc.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-foreground text-sm">{doc.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${categoryColors[doc.category]}`}>
                    {doc.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Owner: {doc.owner}</p>
              </div>
              <ChevronRight
                size={16}
                className={`text-muted-foreground shrink-0 transition-transform ${activeDoc === doc.code ? "rotate-90" : ""}`}
              />
            </button>

            {/* Expanded detail */}
            {activeDoc === doc.code && (
              <div className="px-5 pb-6 border-t border-border bg-secondary/20">
                <div className="grid md:grid-cols-2 gap-6 mt-5">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">What It Is</h4>
                    <p className="text-sm text-foreground/80 leading-relaxed">{doc.description}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">What Triggers an Update</h4>
                    <div className="space-y-2">
                      {doc.updateTriggers.map((trigger, j) => (
                        <div key={j} className="flex items-start gap-2 text-sm">
                          <ChevronRight size={13} className="text-primary mt-0.5 shrink-0" />
                          <span className="text-muted-foreground leading-relaxed">{trigger}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Owner summary table */}
      <div className="reveal mt-10 overflow-x-auto">
        <h3 className="text-xl mb-4 text-foreground" style={{ fontFamily: "var(--font-display)" }}>
          Document Ownership Summary
        </h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-foreground/10">
              <th className="text-left py-3 pr-4 font-semibold text-foreground/70">Document</th>
              <th className="text-left py-3 pr-4 font-semibold text-foreground/70">Category</th>
              <th className="text-left py-3 font-semibold text-foreground/70">Approving Owner</th>
            </tr>
          </thead>
          <tbody>
            {DOCUMENT_TYPES.map((doc) => (
              <tr key={doc.code} className="border-b border-border hover:bg-secondary/40 transition-colors">
                <td className="py-2.5 pr-4 font-medium">
                  <span className="doc-badge mr-2">{doc.code}</span>
                </td>
                <td className="py-2.5 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${categoryColors[doc.category]}`}>
                    {doc.category}
                  </span>
                </td>
                <td className="py-2.5 text-muted-foreground">{doc.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Change Taxonomy Section ──────────────────────────────────────────────────
function ChangeTaxonomySection() {
  const [activeChange, setActiveChange] = useState<string | null>("hardware");

  const tagBg: Record<string, string> = {
    "Your Original Case": "bg-blue-100 text-blue-700",
    "Not in your model": "bg-amber-100 text-amber-700",
    "Partially in your model": "bg-green-100 text-green-700",
  };

  // Red = not in model, green = in model, amber = partial
  const cardBorder: Record<string, string> = {
    "Your Original Case": "border-blue-200",
    "Not in your model": "border-amber-200",
    "Partially in your model": "border-green-200",
  };

  return (
    <section id="change-taxonomy" className="mb-24 scroll-mt-24">
      <SectionHeader
        number="04"
        title="Change Taxonomy"
        subtitle="Eight distinct categories of change that can occur in a manufacturing plant — each capable of triggering document updates. Your original concept covers one."
      />

      {/* Coverage legend */}
      <div className="reveal flex flex-wrap gap-3 mb-8">
        {[
          { label: "Covered in current model", color: "bg-blue-100 text-blue-700" },
          { label: "Partially covered", color: "bg-green-100 text-green-700" },
          { label: "Not yet in model", color: "bg-amber-100 text-amber-700" },
        ].map((item) => (
          <div key={item.label} className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full ${item.color}`}>
            <div className="w-2 h-2 rounded-full bg-current opacity-60" />
            {item.label}
          </div>
        ))}
      </div>

      {/* Change category cards */}
      <div className="grid md:grid-cols-2 gap-4 mb-10">
        {CHANGE_CATEGORIES.map((cat, i) => (
          <div
            key={cat.id}
            className={`reveal border rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-md ${
              activeChange === cat.id ? "shadow-md ring-2 ring-primary/20" : ""
            } ${cardBorder[cat.tag]}`}
            style={{ transitionDelay: `${i * 50}ms` }}
            onClick={() => setActiveChange(activeChange === cat.id ? null : cat.id)}
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-muted-foreground">{cat.number}</span>
                  <h4 className="font-semibold text-foreground text-sm leading-tight">{cat.title}</h4>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${tagBg[cat.tag]}`}>
                  {cat.tag}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{cat.description}</p>

              {/* Impacted doc badges */}
              <div className="flex flex-wrap gap-1 mt-3">
                {cat.impactedDocs.slice(0, 6).map((d) => (
                  <span key={d} className="doc-badge">{d}</span>
                ))}
                {cat.impactedDocs.length > 6 && (
                  <span className="doc-badge">+{cat.impactedDocs.length - 6} more</span>
                )}
              </div>
            </div>

            {/* Expanded detail */}
            {activeChange === cat.id && (
              <div className="border-t border-border bg-secondary/20 p-5">
                <h5 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  What You Are Missing / What to Add
                </h5>
                <div className="space-y-3">
                  {cat.whatsMissing.map((item, j) => (
                    <div key={j} className="flex gap-3">
                      <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-0.5">{item.label}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Input Needed</p>
                  <p className="text-xs text-foreground/70 leading-relaxed">{cat.inputNeeded}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Impact Matrix */}
      <div className="reveal">
        <h3 className="text-xl mb-2 text-foreground" style={{ fontFamily: "var(--font-display)" }}>
          Cross-Reference Impact Matrix
        </h3>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          Which change categories impact which documents. This is the core logic the AI Impact Analysis Engine must implement.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-foreground text-white">
                <th className="text-left py-3 px-4 font-semibold w-28 sticky left-0 bg-foreground z-10">Document</th>
                {CHANGE_CODES.map((c) => (
                  <th key={c} className="py-3 px-2 font-semibold text-center whitespace-pre-line leading-tight min-w-[56px]">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {IMPACT_MATRIX.map((row, ri) => (
                <tr key={DOC_CODES[ri]} className={ri % 2 === 0 ? "bg-white" : "bg-secondary/30"}>
                  <td className={`py-2.5 px-4 font-semibold sticky left-0 z-10 ${ri % 2 === 0 ? "bg-white" : "bg-secondary/30"}`}>
                    {DOC_CODES[ri]}
                  </td>
                  {row.map((hit, ci) => (
                    <td key={ci} className="py-2.5 px-2 text-center">
                      {hit ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary">
                          <CheckCircle2 size={13} />
                        </span>
                      ) : (
                        <span className="inline-block w-5 h-5 rounded-full bg-border/40" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          C1 = Hardware &nbsp;·&nbsp; C2 = Process &nbsp;·&nbsp; C3 = Material &nbsp;·&nbsp; C4 = Packaging &nbsp;·&nbsp; C5 = Supplier &nbsp;·&nbsp; C6 = Regulatory &nbsp;·&nbsp; C7 = Safety Incident &nbsp;·&nbsp; C8 = Maintenance Finding
        </p>
      </div>

      {/* Key additions callout */}
      <div className="reveal mt-10 bg-foreground text-white rounded-xl p-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0 mt-1">
            <GitBranch size={18} className="text-white" />
          </div>
          <div>
            <h3 className="text-xl mb-3 text-white" style={{ fontFamily: "var(--font-display)" }}>
              Five Additions Needed in the Platform
            </h3>
            <div className="space-y-3">
              {[
                { n: "1", text: "A Change Type selector at the start of every change event. The input form adapts to show only the relevant fields for that category." },
                { n: "2", text: "An SDS (Safety Data Sheet) upload field for material and supplier changes. The AI parses it to automatically populate hazard information into Safety Map and HTRA Map updates." },
                { n: "3", text: "A Regulatory Reference field for compliance-driven changes, citing the specific regulation or standard clause and its mandatory effective date." },
                { n: "4", text: "A Lightweight Approval Path for maintenance findings and safety corrections, where only the relevant document owner approves — not all 14 experts." },
                { n: "5", text: "A Change Scope classifier (substitution vs. upgrade vs. new introduction) that helps the AI narrow down document impact before running the full analysis." },
              ].map((item) => (
                <div key={item.n} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">{item.n}</span>
                  <p className="text-sm text-white/70 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Home() {
  useScrollReveal();
  const activeSection = useActiveSection(TOC_ITEMS.map((t) => t.id));
  const [expandedFeature, setExpandedFeature] = useState<string | null>("6.1");

  const categoryColors: Record<string, string> = {
    Operator: "bg-blue-50 text-blue-700 border-blue-200",
    Engineering: "bg-violet-50 text-violet-700 border-violet-200",
    Safety: "bg-red-50 text-red-700 border-red-200",
    Operations: "bg-amber-50 text-amber-700 border-amber-200",
    Maintenance: "bg-green-50 text-green-700 border-green-200",
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-end pb-0 overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO_IMAGE} alt="Manufacturing control room with document network" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1C2333]/90 via-[#1C2333]/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1C2333]/80 via-transparent to-transparent" />
        </div>
        <div className="relative z-10 container pb-20 pt-32">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-300 border border-blue-300/40 rounded px-3 py-1">
                Product Requirements Document
              </span>
            </div>
            <h1 className="text-5xl md:text-7xl text-white leading-tight mb-6" style={{ fontFamily: "var(--font-display)" }}>
              ChangeSync
            </h1>
            <p className="text-xl md:text-2xl text-white/80 leading-relaxed mb-4">AI-Powered Engineering Change Management</p>
            <p className="text-base text-white/60 leading-relaxed max-w-xl mb-10">
              A platform that eliminates unplanned manufacturing downtime by automatically identifying and updating every document impacted by an engineering change — in minutes, not weeks.
            </p>
            <div className="flex flex-wrap gap-4">
              <a href="#executive-summary" className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                Read the PRD <ArrowRight size={16} />
              </a>
              <a href="#change-taxonomy" className="inline-flex items-center gap-2 text-white/80 border border-white/30 px-6 py-3 rounded-md text-sm font-medium hover:bg-white/10 transition-colors">
                Change Taxonomy
              </a>
            </div>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/40 text-xs">
          <div className="w-px h-12 bg-white/20 animate-pulse" />
          <span>Scroll</span>
        </div>
      </section>

      {/* ── Stats Bar ─────────────────────────────────────────────────────── */}
      <div className="bg-foreground text-white">
        <div className="container py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "15", label: "Document Types Managed" },
              { value: "8", label: "Change Categories Covered" },
              { value: "90%", label: "Reduction in Analysis Time" },
              { value: "95%", label: "Fewer Documentation Incidents" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl text-blue-400 mb-1" style={{ fontFamily: "var(--font-display)" }}>{stat.value}</div>
                <div className="text-xs text-white/50 uppercase tracking-wide">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content Layout ───────────────────────────────────────────── */}
      <div className="container py-20">
        <div className="flex gap-16">
          <TableOfContents activeId={activeSection} />
          <main className="flex-1 min-w-0">

            {/* ── Section 01: Executive Summary ──────────────────────────── */}
            <section id="executive-summary" className="mb-24 scroll-mt-24">
              <SectionHeader number="01" title="Executive Summary" subtitle="A single engineering change can silently invalidate a dozen critical documents. ChangeSync ensures none are missed." />
              <div className="reveal grid md:grid-cols-3 gap-6 mb-10">
                {[
                  { label: "Product Vision", icon: <Zap size={18} className="text-primary" />, text: "Leverage AI to automate the impact analysis and updating of all standard operating procedures, maintenance manuals, and critical production documents triggered by any engineering change." },
                  { label: "Core Problem", icon: <AlertTriangle size={18} className="text-amber-500" />, text: "A single hardware change (e.g., a motor swap) can impact 14+ documents. Manual updating is slow, error-prone, and frequently missed — leading to safety incidents and unplanned downtime." },
                  { label: "Solution", icon: <CheckCircle2 size={18} className="text-green-600" />, text: "An intelligent platform that ingests change inputs (drawings, photos, parameters, text), identifies all impacted documents, generates updated drafts, and routes them for approval — automatically." },
                ].map((card) => (
                  <div key={card.label} className="bg-secondary rounded-lg p-6 border border-border">
                    <div className="flex items-center gap-2 mb-3">
                      {card.icon}
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{card.label}</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">{card.text}</p>
                  </div>
                ))}
              </div>
              <div className="reveal">
                <h3 className="text-xl mb-4 text-foreground" style={{ fontFamily: "var(--font-display)" }}>Target Audience</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-foreground/10">
                        <th className="text-left py-3 pr-6 font-semibold text-foreground/70 w-56">Role</th>
                        <th className="text-left py-3 font-semibold text-foreground/70">Primary Use</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { role: "Manufacturing Engineer / Change Manager", use: "Initiates change events, uploads assets, reviews impact analysis, and oversees the approval workflow." },
                        { role: "Plant Operator", use: "Relies on accurate CILs, OPLs, and manuals to operate equipment safely and at the correct parameters." },
                        { role: "Maintenance Technician", use: "Depends on updated PM plans, troubleshooting guides, and spare parts lists to maintain equipment correctly." },
                        { role: "Subject Matter Expert (SME) / Approver", use: "Reviews and digitally approves AI-generated document updates within their domain of expertise." },
                      ].map((row, i) => (
                        <tr key={i} className="border-b border-border hover:bg-secondary/50 transition-colors">
                          <td className="py-3 pr-6 font-medium text-foreground">{row.role}</td>
                          <td className="py-3 text-muted-foreground">{row.use}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* ── Section 02: Problem Statement ──────────────────────────── */}
            <section id="problem-statement" className="mb-24 scroll-mt-24">
              <SectionHeader number="02" title="Problem Statement" subtitle="A real scenario from the manufacturing floor — and why it keeps happening." />
              <div className="reveal mb-10">
                <div className="prd-callout mb-8">
                  <p className="text-base leading-relaxed">
                    To increase the speed at which detergent was produced, the motor in the production machines had to be changed. When that happened, a whole stream of documents had to be updated. Due to the complexity and volume of changes, updates were frequently missed or delayed — with severe consequences.
                  </p>
                </div>
                <div className="grid md:grid-cols-2 gap-8 items-start">
                  <div>
                    <h3 className="text-xl mb-5 text-foreground" style={{ fontFamily: "var(--font-display)" }}>The Cascade of Consequences</h3>
                    <div className="space-y-4">
                      {[
                        { icon: "🧹", title: "Incorrect Cleaning", text: "Operator performs scheduled cleaning without updated CIL. Doesn't know how to clean the new motor. Cleaning takes longer or is missed entirely." },
                        { icon: "🔥", title: "Safety Hazard", text: "Operator runs the motor at the old target frequency. The new motor heats up. His hand gets burned because the manual with the correct target frequency was not updated." },
                        { icon: "🔧", title: "Maintenance Failure", text: "Maintenance cannot be performed properly because the PM plan and LUBE map were not updated. Planned maintenance is skipped or done incorrectly." },
                        { icon: "⏱️", title: "Unplanned Downtime", text: "The motor breaks down. Production stops. The troubleshooting guide is not updated either, so the team cannot resolve the issue efficiently." },
                      ].map((item) => (
                        <div key={item.title} className="flex gap-4 p-4 rounded-lg border border-border bg-secondary/40">
                          <span className="text-2xl shrink-0 mt-0.5">{item.icon}</span>
                          <div>
                            <p className="font-semibold text-sm text-foreground mb-1">{item.title}</p>
                            <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <img src={PROBLEM_IMAGE} alt="Document cascade illustration" className="w-full rounded-lg shadow-md mb-6" />
                    <h3 className="text-xl mb-4 text-foreground" style={{ fontFamily: "var(--font-display)" }}>The 15 Documents at Risk</h3>
                    <div className="flex flex-wrap gap-2">
                      {DOCUMENT_TYPES.map((doc) => (
                        <span key={doc.code} className="doc-badge">{doc.code}</span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                      Each document requires a separate update and approval from a dedicated subject matter expert. With high-frequency changes, this process is long and often missed.
                    </p>
                  </div>
                </div>
              </div>
              <div className="reveal bg-foreground text-white rounded-xl p-8">
                <h3 className="text-2xl mb-3 text-white" style={{ fontFamily: "var(--font-display)" }}>Root Cause</h3>
                <p className="text-white/70 leading-relaxed max-w-3xl">
                  The current procedure requires one person to manually update all 15 documents — a process that takes days — and then seek approval from 14 separate experts. With engineering changes occurring every other day, this manual, sequential process creates a systemic documentation debt that directly translates into safety incidents and production losses.
                </p>
              </div>
            </section>

            {/* ── Section 03: Document Types ──────────────────────────────── */}
            <DocumentTypesSection />

            {/* ── Section 04: Change Taxonomy ─────────────────────────────── */}
            <ChangeTaxonomySection />

            {/* ── Section 05: Objectives ─────────────────────────────────── */}
            <section id="objectives" className="mb-24 scroll-mt-24">
              <SectionHeader number="05" title="Objectives & Key Results" subtitle="Three measurable goals that define success for ChangeSync." />
              <div className="space-y-6">
                {OBJECTIVES.map((obj, i) => (
                  <div key={obj.number} className="reveal border border-border rounded-xl overflow-hidden" style={{ transitionDelay: `${i * 100}ms` }}>
                    <div className="flex items-start gap-5 p-6 bg-secondary/30">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">{obj.icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs font-mono font-semibold text-primary">{obj.number}</span>
                          <h3 className="text-xl text-foreground" style={{ fontFamily: "var(--font-display)" }}>{obj.title}</h3>
                        </div>
                        <div className="mt-4 space-y-3">
                          {obj.krs.map((kr, j) => (
                            <div key={j} className="flex items-start gap-3 text-sm">
                              <ChevronRight size={14} className="text-primary mt-0.5 shrink-0" />
                              <span className="text-muted-foreground leading-relaxed">{kr}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Section 06: Core Features ──────────────────────────────── */}
            <section id="features" className="mb-24 scroll-mt-24">
              <SectionHeader number="06" title="Core Features & Requirements" />
              <div className="reveal mb-8">
                <img src={AI_IMAGE} alt="AI document analysis visualization" className="w-full max-w-lg mx-auto rounded-xl shadow-lg" />
              </div>
              <div className="space-y-4">
                {FEATURES.map((feature) => (
                  <div key={feature.number} className="reveal border border-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedFeature(expandedFeature === feature.number ? null : feature.number)}
                      className="w-full flex items-center justify-between p-6 text-left hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">{feature.icon}</div>
                        <div>
                          <span className="text-xs font-mono text-primary mr-2">{feature.number}</span>
                          <span className="text-lg text-foreground" style={{ fontFamily: "var(--font-display)" }}>{feature.title}</span>
                        </div>
                      </div>
                      <ChevronRight size={18} className={`text-muted-foreground transition-transform ${expandedFeature === feature.number ? "rotate-90" : ""}`} />
                    </button>
                    {expandedFeature === feature.number && (
                      <div className="px-6 pb-6 border-t border-border bg-secondary/20">
                        <p className="text-sm text-muted-foreground leading-relaxed mt-4 mb-5">{feature.description}</p>
                        <div className="space-y-3">
                          {feature.items.map((item) => (
                            <div key={item.label} className="flex gap-4 p-4 bg-white rounded-lg border border-border">
                              <CheckCircle2 size={16} className="text-primary mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-foreground mb-0.5">{item.label}</p>
                                <p className="text-sm text-muted-foreground leading-relaxed">{item.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ── Section 07: User Flow ──────────────────────────────────── */}
            <section id="user-flow" className="mb-24 scroll-mt-24">
              <SectionHeader number="07" title="User Flow" subtitle="Nine steps from engineering change event to approved, deployed documents — fully automated." />
              <div className="relative">
                <div className="absolute left-6 top-0 bottom-0 w-px bg-border hidden md:block" />
                <div className="space-y-6">
                  {USER_FLOW_STEPS.map((step, i) => (
                    <div key={step.step} className="reveal flex gap-6 items-start" style={{ transitionDelay: `${i * 60}ms` }}>
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold z-10 relative shadow-sm">{step.step}</div>
                      </div>
                      <div className="flex-1 pb-6">
                        <h4 className="font-semibold text-foreground mb-1">{step.title}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Section 08: Non-Functional Requirements ────────────────── */}
            <section id="non-functional" className="mb-24 scroll-mt-24">
              <SectionHeader number="08" title="Non-Functional Requirements" subtitle="The platform must meet these standards to be viable in a production manufacturing environment." />
              <div className="reveal grid md:grid-cols-2 gap-6">
                {NON_FUNCTIONAL.map((item) => (
                  <div key={item.title} className="p-6 rounded-xl border border-border bg-secondary/30 hover:border-primary/30 hover:bg-accent/30 transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary">{item.icon}</div>
                      <h4 className="font-semibold text-foreground">{item.title}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Section 09: Future Roadmap ─────────────────────────────── */}
            <section id="future" className="mb-24 scroll-mt-24">
              <SectionHeader number="09" title="Future Roadmap" subtitle="Planned enhancements that extend ChangeSync from a document management tool to a full plant intelligence platform." />
              <div className="space-y-6">
                {FUTURE_ITEMS.map((item, i) => (
                  <div key={item.title} className="reveal flex gap-6 items-start p-6 rounded-xl border border-border hover:border-primary/30 transition-all" style={{ transitionDelay: `${i * 100}ms` }}>
                    <div className="shrink-0"><span className="doc-badge">{item.tag}</span></div>
                    <div>
                      <h4 className="text-lg text-foreground mb-2" style={{ fontFamily: "var(--font-display)" }}>{item.title}</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </main>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-foreground text-white">
        <div className="container py-12">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                  <Layers size={16} className="text-white" />
                </div>
                <span className="font-semibold text-white" style={{ fontFamily: "var(--font-body)" }}>ChangeSync</span>
              </div>
              <p className="text-white/50 text-sm max-w-xs leading-relaxed">AI-Powered Engineering Change Management for Manufacturing Plants.</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Document Information</p>
              <p className="text-sm text-white/60">Product Requirements Document v1.0</p>
              <p className="text-sm text-white/40">April 2026</p>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-white/30">
            <p>© 2026 ChangeSync. All rights reserved.</p>
            <p>Confidential — Internal Use Only</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
