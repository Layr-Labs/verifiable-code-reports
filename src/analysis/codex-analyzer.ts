import { Codex } from "@openai/codex-sdk";
import { parseCategoryReport, type RawAnalysis } from "./report-builder.js";

const CODEX_PROMPT = (repoPath: string) => `You are a Creator Control Report analyst. Independently analyze this repository and produce a trust report about what the CODE actually does — specifically how it handles user funds, data, and system behavior.

The repository is located at: ${repoPath}

## CRITICAL CONTEXT: TEE Execution Model
This code runs inside a Trusted Execution Environment (TEE) on EigenCloud.
- The operator CANNOT access the mnemonic/private keys (TEE-injected)
- The operator CANNOT call arbitrary contract functions (TEE only runs this code)
- The operator CANNOT modify code at runtime (TEE seals at deployment)
- The operator CANNOT read memory/state (hardware isolation)

## Your Workflow
1. Read the Dockerfile to find the entrypoint (CMD/ENTRYPOINT)
2. Trace the entrypoint to understand what the code does
3. Map the architecture: code paths, smart contracts, data flows, fund flows
4. Analyze each relevant category below

## Trust Label Criteria
- **SAFE TO USE**: TEE protects keys, code does what it says, user funds protected with on-chain exit paths, no harmful code paths, mnemonic not leaked.
- **GENERALLY SAFE**: Strong TEE protection and user safeguards, but some design tradeoffs users should know about. Nothing puts funds at direct risk.
- **USE WITH CAUTION**: Notable trust assumptions — code paths that could disadvantage users, missing safety nets, significant transparency gaps.
- **UNSAFE**: Code actively harms users, leaks private keys, has exploitable vulnerabilities, or circumvents TEE protections.

## Output
Respond with ONLY a valid JSON object (no markdown, no explanation):
{
  "codeType": "solidity" | "backend" | "mixed" | "unknown",
  "trustLabel": "SAFE TO USE" | "GENERALLY SAFE" | "USE WITH CAUTION" | "UNSAFE",
  "trustLabelReason": "1-2 sentence justification",
  "executiveSummary": "3-5 sentence summary of what the project does and key trust assumptions",
  "adminPrivileges": { "summary": "...", "trustAssumptions": [...] },
  "upgradeMechanisms": { "summary": "...", "trustAssumptions": [...] },
  "dataAccess": { "summary": "...", "trustAssumptions": [...] },
  "fundControl": { "summary": "...", "trustAssumptions": [...] },
  "killSwitches": { "summary": "...", "trustAssumptions": [...] },
  "backdoors": { "summary": "...", "trustAssumptions": [...] },
  "disclosureLevel": { "summary": "...", "trustAssumptions": [...] }
}

Each trustAssumption: { id: "ADMIN-001", title: "...", description: "...", whatYouAreTrusting: "...", evidence: [{ file: "path", lines?: "1-10", snippet: "code" }], mitigations: "..." }

Only include categories relevant to this codebase. Be factual, not alarmist.`;

export interface CodexAnalysisResult {
  analysis: RawAnalysis;
  logs: string[];
}

export async function runCodexAnalysis(repoPath: string): Promise<CodexAnalysisResult> {
  const codex = new Codex();

  const thread = codex.startThread({
    sandboxMode: "read-only",
    workingDirectory: repoPath,
    skipGitRepoCheck: true,
  });

  const turn = await thread.run(CODEX_PROMPT(repoPath));

  const text = turn.finalResponse || "";
  const logs = [JSON.stringify({ prompt: CODEX_PROMPT(repoPath).slice(0, 200) + "...", response: text })];

  // Parse JSON from response (may be wrapped in markdown fences)
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (fenceMatch) {
      json = JSON.parse(fenceMatch[1]);
    } else {
      throw new Error(`Codex returned unparseable output: ${text.slice(0, 200)}`);
    }
  }

  return {
    analysis: {
      codeType: (json.codeType || "unknown") as RawAnalysis["codeType"],
      trustLabel: json.trustLabel || "USE WITH CAUTION",
      trustLabelReason: json.trustLabelReason || "",
      executiveSummary: json.executiveSummary || "",
      adminPrivileges: parseCategoryReport(json.adminPrivileges),
      upgradeMechanisms: parseCategoryReport(json.upgradeMechanisms),
      dataAccess: parseCategoryReport(json.dataAccess),
      fundControl: parseCategoryReport(json.fundControl),
      killSwitches: parseCategoryReport(json.killSwitches),
      backdoors: parseCategoryReport(json.backdoors),
      disclosureLevel: parseCategoryReport(json.disclosureLevel),
    },
    logs,
  };
}
