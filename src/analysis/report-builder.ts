import type { Report, CategoryReport } from "../report/schema.js";
import { ReportSchema, CategoryReport as CategoryReportSchema } from "../report/schema.js";
import { generateMarkdown } from "../report/markdown.js";

export interface RawAnalysis {
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

function buildCategories(analysis: RawAnalysis): Record<string, CategoryReport> {
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

  return categories;
}

export function buildReport(
  claudeAnalysis: RawAnalysis,
  repoUrl: string,
  commitSha: string,
): Report {
  const categories = buildCategories(claudeAnalysis);

  const reportWithoutMarkdown = {
    version: "2.0.0" as const,
    generatedAt: new Date().toISOString(),
    repoUrl,
    repoCommit: commitSha,
    codeType: claudeAnalysis.codeType,
    trustLabel: claudeAnalysis.trustLabel as any,
    trustLabelReason: claudeAnalysis.trustLabelReason,
    executiveSummary: claudeAnalysis.executiveSummary,
    categories,
  };

  const markdownSummary = generateMarkdown(reportWithoutMarkdown);

  const report: Report = {
    ...reportWithoutMarkdown,
    markdownSummary,
  };

  const parsed = ReportSchema.safeParse(report);
  if (!parsed.success) {
    console.error("Report validation failed:", parsed.error.issues);
    throw new Error(`Report validation failed: ${parsed.error.issues.map(i => i.message).join(", ")}`);
  }

  return parsed.data;
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
