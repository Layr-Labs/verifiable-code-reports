import type { Report, CategoryReport, TrustAssumption } from "./schema.js";

const CATEGORY_LABELS: Record<string, string> = {
  adminPrivileges: "Admin & Owner Privileges",
  upgradeMechanisms: "Upgrade Mechanisms",
  dataAccess: "Data Access & Privacy",
  fundControl: "Fund Control",
  killSwitches: "Kill Switches & Pause",
  backdoors: "Backdoors & Hidden Functions",
  disclosureLevel: "Disclosure Level",
};

function renderAssumption(a: TrustAssumption): string {
  const lines = [
    `### ${a.title}`,
    "",
    a.description,
    "",
    `**What you are trusting:** ${a.whatYouAreTrusting}`,
    "",
  ];

  if (a.mitigations) {
    lines.push(`**Mitigations:** ${a.mitigations}`, "");
  }

  if (a.evidence.length > 0) {
    lines.push("**Evidence:**");
    for (const e of a.evidence) {
      const loc = e.lines ? `${e.file}:${e.lines}` : e.file;
      lines.push("", `\`${loc}\``, "```", e.snippet, "```");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderCategory(key: string, cat: CategoryReport): string {
  const label = CATEGORY_LABELS[key] || key;
  const lines = [
    `## ${label}`,
    "",
    cat.summary,
    "",
  ];

  if (cat.trustAssumptions.length === 0) {
    lines.push("*No trust assumptions identified in this category.*", "");
  } else {
    for (const assumption of cat.trustAssumptions) {
      lines.push(renderAssumption(assumption));
    }
  }

  return lines.join("\n");
}

export function generateMarkdown(report: Omit<Report, "markdownSummary">): string {
  const lines = [
    `# Creator Control Report`,
    "",
    `> **${report.trustLabel}**${report.trustLabelReason ? ` — ${report.trustLabelReason}` : ""}`,
    "",
    `**Repository:** ${report.repoUrl}`,
    `**Commit:** \`${report.repoCommit}\``,
    `**Generated:** ${report.generatedAt}`,
    `**Code Type:** ${report.codeType}`,
    "",
    "## Executive Summary",
    "",
    report.executiveSummary,
    "",
  ];

  for (const [key, cat] of Object.entries(report.categories)) {
    lines.push(renderCategory(key, cat));
  }

  // Codex second opinion
  if (report.codexReview.overallAssessment && !report.codexReview.overallAssessment.includes("not available")) {
    lines.push("## Second Opinion (Codex)", "");
    lines.push(report.codexReview.overallAssessment, "");

    if (report.codexReview.missedAssumptions.length > 0) {
      lines.push("### Additional Trust Assumptions", "");
      for (const a of report.codexReview.missedAssumptions) {
        lines.push(renderAssumption(a));
      }
    }

    if (report.codexReview.disputedAssumptions.length > 0) {
      lines.push("### Disputed Assumptions", "");
      for (const d of report.codexReview.disputedAssumptions) {
        lines.push(`- **${d.assumptionId}:** ${d.reason}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
