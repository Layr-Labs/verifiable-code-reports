import type { Report, CategoryReport, CodexReview } from "../report/schema.js";
import { ReportSchema, CategoryReport as CategoryReportSchema } from "../report/schema.js";
import { generateMarkdown } from "../report/markdown.js";

interface RawAnalysis {
  adminPrivileges?: CategoryReport;
  upgradeMechanisms?: CategoryReport;
  dataAccess?: CategoryReport;
  fundControl?: CategoryReport;
  killSwitches?: CategoryReport;
  backdoors?: CategoryReport;
  disclosureLevel?: CategoryReport;
  executiveSummary: string;
  trustLabel: string;
  trustLabelReason: string;
  codeType: "solidity" | "backend" | "mixed" | "unknown";
}

export function buildReport(
  analysis: RawAnalysis,
  codexReview: CodexReview,
  repoUrl: string,
  commitSha: string
): Report {
  // Only include categories that have content
  const categories: Record<string, CategoryReport> = {};
  const keys = [
    "adminPrivileges", "upgradeMechanisms", "dataAccess",
    "fundControl", "killSwitches", "backdoors", "disclosureLevel",
  ] as const;

  for (const key of keys) {
    const cat = analysis[key];
    if (cat && cat.trustAssumptions.length > 0) {
      categories[key] = cat;
    }
  }

  const reportWithoutMarkdown = {
    version: "1.0.0" as const,
    generatedAt: new Date().toISOString(),
    repoUrl,
    repoCommit: commitSha,
    codeType: analysis.codeType,
    trustLabel: analysis.trustLabel as any,
    trustLabelReason: analysis.trustLabelReason,
    executiveSummary: analysis.executiveSummary,
    categories,
    codexReview,
  };

  const markdownSummary = generateMarkdown(reportWithoutMarkdown);

  const report: Report = {
    ...reportWithoutMarkdown,
    markdownSummary,
  };

  const parsed = ReportSchema.safeParse(report);
  if (!parsed.success) {
    console.error("Report validation failed:", parsed.error.issues);
  }

  return report;
}

export function parseCategoryReport(raw: unknown): CategoryReport | undefined {
  if (raw === undefined || raw === null) return undefined;

  const parsed = CategoryReportSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  if (typeof raw === "string") {
    try {
      const json = JSON.parse(raw);
      const reParsed = CategoryReportSchema.safeParse(json);
      if (reParsed.success) return reParsed.data;
    } catch {}
  }

  // Migrate from old schema (findings → trustAssumptions)
  if (raw && typeof raw === "object" && "findings" in raw) {
    const old = raw as any;
    return {
      summary: old.summary || "Analysis completed.",
      trustAssumptions: (old.findings || []).map((f: any) => ({
        id: f.id || "UNKNOWN",
        title: f.title || "Untitled",
        description: f.description || "",
        whatYouAreTrusting: f.impact || "",
        evidence: f.evidence || [],
        mitigations: undefined,
      })),
    };
  }

  if (raw && typeof raw === "object" && "trustAssumptions" in raw) {
    const obj = raw as any;
    return {
      summary: obj.summary || "",
      trustAssumptions: obj.trustAssumptions || [],
    };
  }

  return undefined;
}
