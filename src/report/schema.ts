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

export const CodexReview = z.object({
  missedAssumptions: z.array(TrustAssumption),
  disputedAssumptions: z.array(
    z.object({
      assumptionId: z.string(),
      reason: z.string(),
    })
  ),
  overallAssessment: z.string(),
});
export type CodexReview = z.infer<typeof CodexReview>;

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

export const ReportSchema = z.object({
  version: z.literal("1.0.0"),
  generatedAt: z.string(),
  repoUrl: z.string(),
  repoCommit: z.string(),
  codeType: z.enum(["solidity", "backend", "mixed", "unknown"]),
  trustLabel: TrustLabel,
  trustLabelReason: z.string(),
  executiveSummary: z.string(),
  categories: Categories,
  codexReview: CodexReview,
  markdownSummary: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;

// JSON Schemas using zod v4 built-in toJSONSchema
export const reportJsonSchema = z.toJSONSchema(ReportSchema);
export const codexReviewJsonSchema = z.toJSONSchema(CodexReview);
export const categoryReportJsonSchema = z.toJSONSchema(CategoryReport);
