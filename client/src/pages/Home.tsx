/*
 * ChangeSync PRD — Home Page
 * Design: Swiss Grid Modernism + Technical Documentation Aesthetic
 * Typography: DM Serif Display (headings) + DM Sans (body)
 * Palette: White bg, Deep Charcoal text, Steel Blue (#2563EB) accent
 * Layout: Full-width sections, left-aligned content, section watermarks, sticky TOC
 */

import { useEffect, useRef, useState } from "react";
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
  { id: "objectives", label: "Objectives & KRs", number: "03" },
  { id: "features", label: "Core Features", number: "04" },
  { id: "user-flow", label: "User Flow", number: "05" },
  { id: "non-functional", label: "Non-Functional Req.", number: "06" },
  { id: "future", label: "Future Roadmap", number: "07" },
];

const DOCUMENTS = [
  { code: "CIL", name: "Clean, Inspect, Lubricate" },
  { code: "CPE", name: "Centerline Process Equipment" },
  { code: "Safety Map", name: "Safety Map" },
  { code: "SOC Map", name: "Standard Operating Conditions" },
  { code: "HTRA Map", name: "Hazard & Risk Assessment" },
  { code: "LUBE Map", name: "Lubrication Map" },
  { code: "Fastener Map", name: "Fastener Torque Map" },
  { code: "MTM", name: "Methods-Time Measurement" },
  { code: "WPA", name: "Workplace Analysis" },
  { code: "Manuals", name: "Equipment Manuals" },
  { code: "OPLs", name: "One-Point Lessons" },
  { code: "Troubleshooting", name: "Troubleshooting Guide" },
  { code: "AM Step 3/4/5", name: "Autonomous Maintenance Steps" },
  { code: "Spare List", name: "Spare Parts List" },
  { code: "PM Plan", name: "Preventative Maintenance Plan" },
];

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
    number: "3.1",
    title: "Input & Data Ingestion Module",
    icon: <Upload size={20} />,
    description:
      "A seamless interface for capturing the full context of an engineering change across three input modalities.",
    items: [
      {
        label: "Visual Uploads",
        detail:
          "Upload engineering drawings (CAD, PDF) of both old and new parts side-by-side.",
      },
      {
        label: "Photographic Evidence",
        detail:
          "Upload pictures of old and new components — wrappers, packets, motors, and assemblies.",
      },
      {
        label: "Parameter / Code Updates",
        detail:
          "Structured fields for SKU-level changes: old vs. new price, grammage, frequency, and other numeric parameters.",
      },
      {
        label: "Natural Language Prompt",
        detail:
          "A free-text field where engineers describe procedural changes in plain English (e.g., 'lubrication frequency changes from weekly to daily').",
      },
      {
        label: "Document Stack Upload",
        detail:
          "Bulk upload of the current versions of all 14+ manufacturing documents associated with the affected equipment.",
      },
    ],
  },
  {
    number: "3.2",
    title: "AI-Powered Impact Analysis Engine",
    icon: <Layers size={20} />,
    description:
      "The core intelligence layer that cross-references change inputs against the document stack to identify every affected section.",
    items: [
      {
        label: "Contextual Understanding",
        detail:
          "Processes visual inputs, structured data, and unstructured text to build a holistic model of the engineering change.",
      },
      {
        label: "Document Parsing",
        detail:
          "Parses PDFs, Word documents, and Excel sheets to understand current content, structure, and purpose.",
      },
      {
        label: "Impact Mapping",
        detail:
          "Cross-references the change context with parsed documents to identify exactly which documents and which specific sections require updates.",
      },
      {
        label: "Impact Report Dashboard",
        detail:
          "Generates a clear, actionable report listing all impacted documents with highlighted sections requiring change.",
      },
    ],
  },
  {
    number: "3.3",
    title: "Automated Document Update & Drafting",
    icon: <Settings size={20} />,
    description:
      "AI-generated draft updates that incorporate new parameters, images, and instructions while preserving document formatting.",
    items: [
      {
        label: "Draft Generation",
        detail:
          "Automatically generates updated content for impacted sections, incorporating new parameters and instructions.",
      },
      {
        label: "Version Control",
        detail:
          "Maintains strict versioning with side-by-side redline comparisons of original versus AI-generated drafts.",
      },
      {
        label: "Formatting Retention",
        detail:
          "Preserves original document formatting — CIL checklists remain tabular, PM plans retain their structure.",
      },
    ],
  },
  {
    number: "3.4",
    title: "Approval Workflow & Distribution",
    icon: <Users size={20} />,
    description:
      "A streamlined review and sign-off mechanism that routes updated documents to the right subject matter experts automatically.",
    items: [
      {
        label: "Automated Routing",
        detail:
          "Routes draft documents to the appropriate SME based on document type — PM plans to Maintenance Lead, Safety Maps to HSE Manager.",
      },
      {
        label: "Review Interface",
        detail:
          "Intuitive interface for approvers to review, edit, comment on, or approve AI-generated changes.",
      },
      {
        label: "Publishing",
        detail:
          "Once approved, documents are instantly published to the central repository accessible by operators on the shop floor.",
      },
    ],
  },
];

const USER_FLOW_STEPS = [
  {
    step: "01",
    title: "Initiate Change Event",
    description:
      "An engineer logs into ChangeSync and creates a new Engineering Change Event, providing the equipment ID and a brief summary of the change.",
  },
  {
    step: "02",
    title: "Upload Change Assets",
    description:
      "The engineer uploads drawings, photographs, and parameter changes for the old and new components (e.g., old motor vs. new motor).",
  },
  {
    step: "03",
    title: "Describe Procedural Changes",
    description:
      "The engineer types a brief natural language description of any procedural changes — lubrication frequency, maintenance steps, target operating parameters.",
  },
  {
    step: "04",
    title: "Upload Document Stack",
    description:
      "The engineer uploads the current versions of the 14+ manuals and standard documents associated with the affected equipment or SKU.",
  },
  {
    step: "05",
    title: "AI Impact Analysis",
    description:
      "ChangeSync processes all inputs and within minutes highlights exactly which of the 14 documents are impacted and which specific sections require updates.",
  },
  {
    step: "06",
    title: "Review Impact Dashboard",
    description:
      "The engineer reviews the impact analysis dashboard, confirming the scope of changes before proceeding to the drafting phase.",
  },
  {
    step: "07",
    title: "AI Draft Generation",
    description:
      "The platform automatically generates updated drafts for all impacted documents, with redlines showing every proposed change.",
  },
  {
    step: "08",
    title: "SME Approval",
    description:
      "The system routes each updated document to the relevant subject matter expert for a focused, efficient digital review and sign-off.",
  },
  {
    step: "09",
    title: "Instant Deployment",
    description:
      "Approved documents are immediately published and available to operators and maintenance staff on the shop floor — no delays, no missed updates.",
  },
];

const NON_FUNCTIONAL = [
  {
    icon: <Shield size={20} />,
    title: "Security & Compliance",
    description:
      "ISO 27001-aligned data security. Proprietary manufacturing data, CAD drawings, and process parameters are encrypted at rest and in transit.",
  },
  {
    icon: <Zap size={20} />,
    title: "Performance",
    description:
      "AI impact analysis on a standard stack of 15–20 documents must complete in under 5 minutes.",
  },
  {
    icon: <Users size={20} />,
    title: "Usability",
    description:
      "Highly intuitive interface requiring minimal training for manufacturing engineers who may not be advanced software users.",
  },
  {
    icon: <Layers size={20} />,
    title: "Integration Readiness",
    description:
      "Designed for future integration with PLM, ERP, and CMMS systems via open APIs.",
  },
];

const FUTURE_ITEMS = [
  {
    tag: "Phase 2",
    title: "Direct ERP / PLM Integration",
    description:
      "Automatically pull the document stack from the company's existing PLM or ERP repository based on equipment ID, eliminating manual upload entirely.",
  },
  {
    tag: "Phase 2",
    title: "Mobile Shop Floor Access",
    description:
      "A mobile application allowing operators to scan a QR code on any machine and instantly access the most recently approved CIL, OPL, or Troubleshooting Guide.",
  },
  {
    tag: "Phase 3",
    title: "Predictive Change Analytics",
    description:
      "AI-driven recommendations for preventative maintenance schedules based on the frequency and nature of engineering changes occurring across the plant.",
  },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
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
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
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
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-sm shadow-sm border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="container flex items-center justify-between h-16">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Layers size={16} className="text-white" />
          </div>
          <span
            className="font-semibold text-foreground tracking-tight"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ChangeSync
          </span>
          <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5 ml-1">
            PRD v1.0
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          {TOC_ITEMS.slice(0, 5).map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="text-xs text-muted-foreground hidden lg:block">
          April 2026
        </div>
      </div>
    </header>
  );
}

function TableOfContents({ activeId }: { activeId: string }) {
  return (
    <aside className="hidden xl:block sticky top-24 h-fit w-56 shrink-0">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
        Contents
      </p>
      <nav className="flex flex-col gap-1">
        {TOC_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`flex items-center gap-2.5 text-sm py-1.5 px-2 rounded transition-all ${
              activeId === item.id
                ? "text-primary font-medium bg-accent"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className={`text-xs font-mono w-6 shrink-0 ${
                activeId === item.id ? "text-primary" : "text-muted-foreground/50"
              }`}
            >
              {item.number}
            </span>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="mt-8 pt-6 border-t border-border">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Prepared by the ChangeSync Product Team
          <br />
          <span className="font-medium text-foreground/60">April 2026</span>
        </p>
      </div>
    </aside>
  );
}

function SectionHeader({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="relative mb-12">
      <div
        className="section-watermark absolute -top-8 -left-4 select-none"
        aria-hidden="true"
      >
        {number}
      </div>
      <div className="relative z-10 pt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">
          Section {number}
        </p>
        <h2
          className="text-4xl md:text-5xl text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Home() {
  useScrollReveal();
  const activeSection = useActiveSection(TOC_ITEMS.map((t) => t.id));
  const [expandedFeature, setExpandedFeature] = useState<string | null>("3.1");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-end pb-0 overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src={HERO_IMAGE}
            alt="Manufacturing control room with document network"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1C2333]/90 via-[#1C2333]/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1C2333]/80 via-transparent to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 container pb-20 pt-32">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-300 border border-blue-300/40 rounded px-3 py-1">
                Product Requirements Document
              </span>
            </div>
            <h1
              className="text-5xl md:text-7xl text-white leading-tight mb-6"
              style={{ fontFamily: "var(--font-display)" }}
            >
              ChangeSync
            </h1>
            <p className="text-xl md:text-2xl text-white/80 leading-relaxed mb-4">
              AI-Powered Engineering Change Management
            </p>
            <p className="text-base text-white/60 leading-relaxed max-w-xl mb-10">
              A platform that eliminates unplanned manufacturing downtime by
              automatically identifying and updating every document impacted by
              an engineering change — in minutes, not weeks.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="#executive-summary"
                className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Read the PRD <ArrowRight size={16} />
              </a>
              <a
                href="#problem-statement"
                className="inline-flex items-center gap-2 text-white/80 border border-white/30 px-6 py-3 rounded-md text-sm font-medium hover:bg-white/10 transition-colors"
              >
                The Problem
              </a>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
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
              { value: "14+", label: "Document Types Impacted" },
              { value: "90%", label: "Reduction in Analysis Time" },
              { value: "75%", label: "Faster Approval Cycles" },
              { value: "95%", label: "Fewer Documentation-Related Incidents" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div
                  className="text-3xl md:text-4xl text-blue-400 mb-1"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {stat.value}
                </div>
                <div className="text-xs text-white/50 uppercase tracking-wide">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content Layout ───────────────────────────────────────────── */}
      <div className="container py-20">
        <div className="flex gap-16">
          {/* TOC Sidebar */}
          <TableOfContents activeId={activeSection} />

          {/* Content */}
          <main className="flex-1 min-w-0">

            {/* ── Section 01: Executive Summary ──────────────────────────── */}
            <section id="executive-summary" className="mb-24 scroll-mt-24">
              <SectionHeader
                number="01"
                title="Executive Summary"
                subtitle="A single engineering change can silently invalidate a dozen critical documents. ChangeSync ensures none are missed."
              />

              <div className="reveal grid md:grid-cols-3 gap-6 mb-10">
                {[
                  {
                    label: "Product Vision",
                    icon: <Zap size={18} className="text-primary" />,
                    text: "Leverage AI to automate the impact analysis and updating of all standard operating procedures, maintenance manuals, and critical production documents triggered by any engineering change.",
                  },
                  {
                    label: "Core Problem",
                    icon: <AlertTriangle size={18} className="text-amber-500" />,
                    text: "A single hardware change (e.g., a motor swap) can impact 14+ documents. Manual updating is slow, error-prone, and frequently missed — leading to safety incidents and unplanned downtime.",
                  },
                  {
                    label: "Solution",
                    icon: <CheckCircle2 size={18} className="text-green-600" />,
                    text: "An intelligent platform that ingests change inputs (drawings, photos, parameters, text), identifies all impacted documents, generates updated drafts, and routes them for approval — automatically.",
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="bg-secondary rounded-lg p-6 border border-border"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {card.icon}
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {card.label}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {card.text}
                    </p>
                  </div>
                ))}
              </div>

              <div className="reveal">
                <h3
                  className="text-xl mb-4 text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Target Audience
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b-2 border-foreground/10">
                        <th className="text-left py-3 pr-6 font-semibold text-foreground/70 w-48">
                          Role
                        </th>
                        <th className="text-left py-3 font-semibold text-foreground/70">
                          Primary Use
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          role: "Manufacturing Engineer / Change Manager",
                          use: "Initiates change events, uploads assets, reviews impact analysis, and oversees the approval workflow.",
                        },
                        {
                          role: "Plant Operator",
                          use: "Relies on accurate CILs, OPLs, and manuals to operate equipment safely and at the correct parameters.",
                        },
                        {
                          role: "Maintenance Technician",
                          use: "Depends on updated PM plans, troubleshooting guides, and spare parts lists to maintain equipment correctly.",
                        },
                        {
                          role: "Subject Matter Expert (SME) / Approver",
                          use: "Reviews and digitally approves AI-generated document updates within their domain of expertise.",
                        },
                      ].map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border hover:bg-secondary/50 transition-colors"
                        >
                          <td className="py-3 pr-6 font-medium text-foreground">
                            {row.role}
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {row.use}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* ── Section 02: Problem Statement ──────────────────────────── */}
            <section id="problem-statement" className="mb-24 scroll-mt-24">
              <SectionHeader
                number="02"
                title="Problem Statement"
                subtitle="A real scenario from the manufacturing floor — and why it keeps happening."
              />

              <div className="reveal mb-10">
                <div className="prd-callout mb-8">
                  <p className="text-base leading-relaxed">
                    To increase the speed at which detergent was produced, the
                    motor in the production machines had to be changed. When that
                    happened, a whole stream of documents had to be updated. Due
                    to the complexity and volume of changes, updates were
                    frequently missed or delayed — with severe consequences.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 items-start">
                  <div>
                    <h3
                      className="text-xl mb-5 text-foreground"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      The Cascade of Consequences
                    </h3>
                    <div className="space-y-4">
                      {[
                        {
                          icon: "🧹",
                          title: "Incorrect Cleaning",
                          text: "Operator performs scheduled cleaning without updated CIL. Doesn't know how to clean the new motor. Cleaning takes longer or is missed entirely.",
                        },
                        {
                          icon: "🔥",
                          title: "Safety Hazard",
                          text: "Operator runs the motor at the old target frequency. The new motor heats up. His hand gets burned because the manual with the correct target frequency was not updated.",
                        },
                        {
                          icon: "🔧",
                          title: "Maintenance Failure",
                          text: "Maintenance cannot be performed properly because the PM plan and LUBE map were not updated. Planned maintenance is skipped or done incorrectly.",
                        },
                        {
                          icon: "⏱️",
                          title: "Unplanned Downtime",
                          text: "The motor breaks down. Production stops. The troubleshooting guide is not updated either, so the team cannot resolve the issue efficiently.",
                        },
                      ].map((item) => (
                        <div
                          key={item.title}
                          className="flex gap-4 p-4 rounded-lg border border-border bg-secondary/40"
                        >
                          <span className="text-2xl shrink-0 mt-0.5">
                            {item.icon}
                          </span>
                          <div>
                            <p className="font-semibold text-sm text-foreground mb-1">
                              {item.title}
                            </p>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {item.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <img
                      src={PROBLEM_IMAGE}
                      alt="Document cascade illustration"
                      className="w-full rounded-lg shadow-md mb-6"
                    />
                    <h3
                      className="text-xl mb-4 text-foreground"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      The 14 Documents at Risk
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {DOCUMENTS.map((doc) => (
                        <span key={doc.code} className="doc-badge">
                          {doc.code}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                      Each of these documents requires a separate update and
                      approval from a dedicated subject matter expert. With high
                      frequency changes, this process is long and often missed.
                    </p>
                  </div>
                </div>
              </div>

              <div className="reveal bg-foreground text-white rounded-xl p-8">
                <h3
                  className="text-2xl mb-3 text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Root Cause
                </h3>
                <p className="text-white/70 leading-relaxed max-w-3xl">
                  The current procedure requires one person to manually update
                  all 14 documents — a process that takes days — and then seek
                  approval from 14 separate experts. With engineering changes
                  occurring every other day, this manual, sequential process
                  creates a systemic documentation debt that directly translates
                  into safety incidents and production losses.
                </p>
              </div>
            </section>

            {/* ── Section 03: Objectives ─────────────────────────────────── */}
            <section id="objectives" className="mb-24 scroll-mt-24">
              <SectionHeader
                number="03"
                title="Objectives & Key Results"
                subtitle="Three measurable goals that define success for ChangeSync."
              />

              <div className="space-y-6">
                {OBJECTIVES.map((obj, i) => (
                  <div
                    key={obj.number}
                    className="reveal border border-border rounded-xl overflow-hidden"
                    style={{ transitionDelay: `${i * 100}ms` }}
                  >
                    <div className="flex items-start gap-5 p-6 bg-secondary/30">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        {obj.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs font-mono font-semibold text-primary">
                            {obj.number}
                          </span>
                          <h3
                            className="text-xl text-foreground"
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            {obj.title}
                          </h3>
                        </div>
                        <div className="mt-4 space-y-3">
                          {obj.krs.map((kr, j) => (
                            <div
                              key={j}
                              className="flex items-start gap-3 text-sm"
                            >
                              <ChevronRight
                                size={14}
                                className="text-primary mt-0.5 shrink-0"
                              />
                              <span className="text-muted-foreground leading-relaxed">
                                {kr}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Section 04: Core Features ──────────────────────────────── */}
            <section id="features" className="mb-24 scroll-mt-24">
              <SectionHeader
                number="04"
                title="Core Features & Requirements"
              />

              <div className="reveal mb-8">
                <img
                  src={AI_IMAGE}
                  alt="AI document analysis visualization"
                  className="w-full max-w-lg mx-auto rounded-xl shadow-lg"
                />
              </div>

              <div className="space-y-4">
                {FEATURES.map((feature) => (
                  <div
                    key={feature.number}
                    className="reveal border border-border rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedFeature(
                          expandedFeature === feature.number
                            ? null
                            : feature.number
                        )
                      }
                      className="w-full flex items-center justify-between p-6 text-left hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          {feature.icon}
                        </div>
                        <div>
                          <span className="text-xs font-mono text-primary mr-2">
                            {feature.number}
                          </span>
                          <span
                            className="text-lg text-foreground"
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            {feature.title}
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        size={18}
                        className={`text-muted-foreground transition-transform ${
                          expandedFeature === feature.number ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {expandedFeature === feature.number && (
                      <div className="px-6 pb-6 border-t border-border bg-secondary/20">
                        <p className="text-sm text-muted-foreground leading-relaxed mt-4 mb-5">
                          {feature.description}
                        </p>
                        <div className="space-y-3">
                          {feature.items.map((item) => (
                            <div
                              key={item.label}
                              className="flex gap-4 p-4 bg-white rounded-lg border border-border"
                            >
                              <CheckCircle2
                                size={16}
                                className="text-primary mt-0.5 shrink-0"
                              />
                              <div>
                                <p className="text-sm font-semibold text-foreground mb-0.5">
                                  {item.label}
                                </p>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  {item.detail}
                                </p>
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

            {/* ── Section 05: User Flow ──────────────────────────────────── */}
            <section id="user-flow" className="mb-24 scroll-mt-24">
              <SectionHeader
                number="05"
                title="User Flow"
                subtitle="Nine steps from engineering change event to approved, deployed documents — fully automated."
              />

              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-6 top-0 bottom-0 w-px bg-border hidden md:block" />

                <div className="space-y-6">
                  {USER_FLOW_STEPS.map((step, i) => (
                    <div
                      key={step.step}
                      className="reveal flex gap-6 items-start"
                      style={{ transitionDelay: `${i * 60}ms` }}
                    >
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold z-10 relative shadow-sm">
                          {step.step}
                        </div>
                      </div>
                      <div className="flex-1 pb-6">
                        <h4 className="font-semibold text-foreground mb-1">
                          {step.title}
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Section 06: Non-Functional Requirements ────────────────── */}
            <section id="non-functional" className="mb-24 scroll-mt-24">
              <SectionHeader
                number="06"
                title="Non-Functional Requirements"
                subtitle="The platform must meet these standards to be viable in a production manufacturing environment."
              />

              <div className="reveal grid md:grid-cols-2 gap-6">
                {NON_FUNCTIONAL.map((item) => (
                  <div
                    key={item.title}
                    className="p-6 rounded-xl border border-border bg-secondary/30 hover:border-primary/30 hover:bg-accent/30 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                        {item.icon}
                      </div>
                      <h4 className="font-semibold text-foreground">
                        {item.title}
                      </h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Section 07: Future Roadmap ─────────────────────────────── */}
            <section id="future" className="mb-24 scroll-mt-24">
              <SectionHeader
                number="07"
                title="Future Roadmap"
                subtitle="Planned enhancements that extend ChangeSync from a document management tool to a full plant intelligence platform."
              />

              <div className="space-y-6">
                {FUTURE_ITEMS.map((item, i) => (
                  <div
                    key={item.title}
                    className="reveal flex gap-6 items-start p-6 rounded-xl border border-border hover:border-primary/30 transition-all"
                    style={{ transitionDelay: `${i * 100}ms` }}
                  >
                    <div className="shrink-0">
                      <span className="doc-badge">{item.tag}</span>
                    </div>
                    <div>
                      <h4
                        className="text-lg text-foreground mb-2"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {item.title}
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
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
                <span
                  className="font-semibold text-white"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  ChangeSync
                </span>
              </div>
              <p className="text-white/50 text-sm max-w-xs leading-relaxed">
                AI-Powered Engineering Change Management for Manufacturing Plants.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/30 uppercase tracking-widest mb-2">
                Document Information
              </p>
              <p className="text-sm text-white/60">
                Product Requirements Document v1.0
              </p>
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
