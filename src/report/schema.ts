import { z } from "zod";

export const Evidence = z.object({
  file: z.string(),
  lines: z.string().optional(),
  snippet: z.string(),
});

export const TrustAssumption = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  whatYouAreTrusting: z.string(),
  evidence: z.array(Evidence),
  mitigations: z.string().optional(),
});
export type TrustAssumption = z.infer<typeof TrustAssumption>;

export const CategoryReport = z.object({
  summary: z.string(),
  trustAssumptions: z.array(TrustAssumption),
});
export type CategoryReport = z.infer<typeof CategoryReport>;

export const Categories = z.object({
  adminPrivileges: CategoryReport.optional(),
  upgradeMechanisms: CategoryReport.optional(),
  dataAccess: CategoryReport.optional(),
  fundControl: CategoryReport.optional(),
  killSwitches: CategoryReport.optional(),
  backdoors: CategoryReport.optional(),
  disclosureLevel: CategoryReport.optional(),
});

export const TrustLabel = z.enum([
  "SAFE TO USE",
  "GENERALLY SAFE",
  "USE WITH CAUTION",
  "UNSAFE",
]);
export type TrustLabel = z.infer<typeof TrustLabel>;

export const CodexAnalysis = z.object({
  trustLabel: TrustLabel,
  trustLabelReason: z.string(),
  executiveSummary: z.string(),
  categories: Categories,
  agrees: z.boolean(),
});
export type CodexAnalysis = z.infer<typeof CodexAnalysis>;

export const ReportSchema = z.object({
  version: z.literal("2.0.0"),
  generatedAt: z.string(),
  repoUrl: z.string(),
  repoCommit: z.string(),
  codeType: z.enum(["solidity", "backend", "mixed", "unknown"]),
  trustLabel: TrustLabel,
  trustLabelReason: z.string(),
  executiveSummary: z.string(),
  categories: Categories,
  codexAnalysis: CodexAnalysis,
  markdownSummary: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;

export const reportJsonSchema = z.toJSONSchema(ReportSchema);
export const categoryReportJsonSchema = z.toJSONSchema(CategoryReport);
