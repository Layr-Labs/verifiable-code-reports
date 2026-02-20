import { Codex } from "@openai/codex-sdk";
import type { CodexReview, CategoryReport } from "../report/schema.js";
import { codexReviewJsonSchema } from "../report/schema.js";

interface AnalysisFindings {
  adminPrivileges?: CategoryReport;
  upgradeMechanisms?: CategoryReport;
  dataAccess?: CategoryReport;
  fundControl?: CategoryReport;
  killSwitches?: CategoryReport;
  backdoors?: CategoryReport;
  disclosureLevel?: CategoryReport;
  executiveSummary: string;
}

export async function runCodexReview(
  repoPath: string,
  findings: AnalysisFindings
): Promise<CodexReview> {
  const codex = new Codex();

  const thread = codex.startThread({
    sandboxMode: "read-only",
    workingDirectory: repoPath,
    skipGitRepoCheck: true,
  });

  const findingsSummary = Object.entries(findings)
    .filter(([key]) => key !== "executiveSummary")
    .map(([key, cat]) => {
      const c = cat as CategoryReport;
      return `### ${key}\n${c.summary}\nTrust assumptions: ${c.trustAssumptions.length}`;
    })
    .join("\n\n");

  const prompt = `You are reviewing a Creator Control Report for a code repository running in a TEE (Trusted Execution Environment).

This report describes TRUST ASSUMPTIONS — what users are trusting when they use this system. It is NOT a bug report or risk score.

Here are the trust assumptions from the first-pass analysis:

${findingsSummary}

Detailed assumptions:
${JSON.stringify(findings, null, 2)}

Your job:
1. Review the codebase yourself to verify these trust assumptions
2. Identify any MISSED trust assumptions
3. Flag any assumptions you DISAGREE with, explaining why
4. Provide your overall assessment

Focus on TRUST ASSUMPTIONS — what is the user trusting? What does the code actually do?

Respond with JSON matching the required schema.`;

  const turn = await thread.run(prompt, {
    outputSchema: codexReviewJsonSchema,
  });

  try {
    const parsed = JSON.parse(turn.finalResponse);
    return {
      missedAssumptions: parsed.missedAssumptions || [],
      disputedAssumptions: parsed.disputedAssumptions || [],
      overallAssessment:
        parsed.overallAssessment ||
        "Codex review completed without additional assessment.",
    };
  } catch {
    return {
      missedAssumptions: [],
      disputedAssumptions: [],
      overallAssessment:
        turn.finalResponse || "Codex review completed but output was not structured.",
    };
  }
}
