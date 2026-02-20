import { query } from "@anthropic-ai/claude-agent-sdk";
import { agentDefinitions } from "./agents.js";
import { buildReport, parseCategoryReport } from "./report-builder.js";
import { runCodexReview } from "./codex-reviewer.js";
import type { Report, CodexReview } from "../report/schema.js";

const ORCHESTRATOR_PROMPT = (repoPath: string) => `You are a Creator Control Report orchestrator. Your job is to analyze a repository and produce a trust report about what the CODE actually does — specifically how it handles user funds, data, and system behavior.

The repository is located at: ${repoPath}

## CRITICAL CONTEXT: TEE Execution Model

This code is assumed to run inside a Trusted Execution Environment (TEE) on EigenCloud. This fundamentally changes the trust model:

1. **The operator CANNOT access the mnemonic/private keys.** TEE injects keys that are private to the enclave. The operator never sees them.
2. **The operator CANNOT call arbitrary contract functions.** The TEE only executes the code in this repository. If settle() is only called inside the normal auction flow in the code, the operator physically cannot call it outside that flow.
3. **The operator CANNOT modify code at runtime.** The TEE seals the code at deployment. What's in this repo is what runs.
4. **The operator CANNOT read memory/state.** TEE provides hardware isolation. Even the cloud host can't peek inside.

Therefore, your analysis must focus on:
- **What does the CODE actually do?** Trace the actual control flow. If settle() is called only inside a legitimate auction cycle, that's very different from "admin can call settle() anytime."
- **What does the code DISCLOSE?** What data leaves the TEE boundary (API responses, events, logs)?
- **What are the on-chain contract capabilities?** Even in a TEE, the smart contracts live on-chain. If the contract has an onlyAgent modifier, what does the CODE do with that authority? Trace the code paths.
- **Are there code paths that could harm users?** Not "could an admin abuse this function" but "does the actual coded logic ever use this function against user interests?"
- **What happens if the TEE goes down?** Can users still withdraw funds on-chain?

## What is NOT a risk in a TEE model:
- "Single mnemonic controls everything" — the mnemonic is TEE-private, operator can't access it
- "Admin could call X function" — operator can't, only the code can
- "Server could be modified" — TEE seals the code
- "Operator could read user data" — TEE isolates memory

## What IS still a risk in a TEE model:
- The code itself doing something harmful (e.g., settling funds before delivery is confirmed IN THE CODE FLOW)
- On-chain contracts having capabilities that the code exercises in ways that disadvantage users
- Data that the code intentionally exposes via APIs/events (what leaves the TEE boundary)
- Dependencies that could be compromised at build time (supply chain)
- What happens to user funds if the TEE instance terminates
- Whether users can independently verify the code matches what's running (attestation)

## Your Workflow: Reverse-Engineer from Dockerfile

You MUST follow this order. Start from what actually runs, then trace backwards.

### Step 1: Read the Dockerfile
Find and read the Dockerfile (or docker-compose.yml, etc.) in the repository. This tells you:
- What base image is used
- What gets installed / built
- What the ENTRYPOINT or CMD is — this is what the TEE actually runs
- What files are copied into the image

### Step 2: Trace the entrypoint
Read the file that the Dockerfile's CMD/ENTRYPOINT points to. Trace the execution:
- What does main() do?
- What servers/services are started?
- What environment variables are read?
- What on-chain contracts does it interact with?
- What external services does it call?

### Step 3: Map the architecture
From the entrypoint, build a mental model:
- What are the core code paths? (e.g., auction cycle, API endpoints, scheduled jobs)
- What smart contracts exist and how does the code interact with them?
- What data flows in and out of the TEE?
- What funds flow through the system?

### Step 4: Decide which analysis categories are relevant
Based on what you found, decide which sub-agents to invoke. You have these available:
- admin-privileges — use if the code has privileged roles, access control, admin functions
- upgrade-mechanisms — use if there are smart contracts, proxy patterns, or mutable config
- data-access — use if the code handles user data, has APIs, stores PII
- fund-control — use if the code handles money, tokens, payments
- kill-switches — use if the code has pause mechanisms, or if TEE death affects users
- backdoors — use if you want to verify there's no hidden functionality
- disclosure-level — use if you want to assess transparency and verifiability

Only invoke agents that are relevant to what this code actually does. Skip categories that don't apply.

### Step 5: Synthesize
After agents complete, combine their findings into the final report. Focus on what users are actually trusting when they interact with this system.

## CRITICAL: Output Format

This is NOT a bug-finding or risk-scoring report. This is a TRUST ASSUMPTIONS report. For each category, list the trust assumptions users are making when they use this system. Be factual, not alarmist. State what the code does, what users are trusting, and what mitigations exist.

## Trust Label Criteria

Assign one of these labels based on the OVERALL picture:

- **SAFE TO USE**: TEE protects keys, code does what it says, user funds are protected with on-chain exit paths, no code paths that harm users, mnemonic is not leaked.
- **GENERALLY SAFE**: Strong TEE protection and user safeguards, but some design tradeoffs users should know about (e.g., payment before delivery, AI non-determinism). Nothing that puts funds at direct risk.
- **USE WITH CAUTION**: Notable trust assumptions — e.g., code has paths that could disadvantage users, missing safety nets for edge cases, or significant transparency gaps.
- **UNSAFE**: Code has paths that actively harm users, leaks private keys, has exploitable vulnerabilities, or gives the operator ways to circumvent TEE protections.

You MUST respond with ONLY a valid JSON object (no markdown, no explanation) matching this structure.
Include only the categories that are relevant to this codebase. If a category doesn't apply, omit it entirely.

{
  "codeType": "solidity" | "backend" | "mixed" | "unknown",
  "trustLabel": "SAFE TO USE" | "GENERALLY SAFE" | "USE WITH CAUTION" | "UNSAFE",
  "trustLabelReason": "1-2 sentence justification for the label",
  "executiveSummary": "3-5 sentence summary. What does this project do? What are the key trust assumptions users make? What does the TEE protect and what doesn't it protect?",
  "adminPrivileges": { "summary": "...", "trustAssumptions": [...] },
  "upgradeMechanisms": { "summary": "...", "trustAssumptions": [...] },
  "dataAccess": { "summary": "...", "trustAssumptions": [...] },
  "fundControl": { "summary": "...", "trustAssumptions": [...] },
  "killSwitches": { "summary": "...", "trustAssumptions": [...] },
  "backdoors": { "summary": "...", "trustAssumptions": [...] },
  "disclosureLevel": { "summary": "...", "trustAssumptions": [...] }
}

Each category has:
- summary: 1-3 sentence factual summary
- trustAssumptions: array of {
    id: "FUND-001" etc,
    title: "Short descriptive title",
    description: "Factual description of what the code does",
    whatYouAreTrusting: "Plain language: what trust assumption the user is making",
    evidence: [{ file: "path", lines?: "1-10", snippet: "code" }],
    mitigations: "What mitigations exist (e.g., users can always withdrawBid() on-chain)"
  }

Do NOT assign risk scores or severity levels. Just describe the trust assumptions factually.
Do NOT include any text outside the JSON object. The response must be parseable by JSON.parse().`;

export async function analyzeRepo(
  repoPath: string,
  repoUrl: string,
  commitSha: string
): Promise<Report> {
  // Accumulate ALL assistant text across the entire conversation
  const allAssistantText: string[] = [];

  for await (const message of query({
    prompt: ORCHESTRATOR_PROMPT(repoPath),
    options: {
      model: "claude-opus-4-6",
      allowedTools: ["Read", "Glob", "Grep", "Task"],
      disallowedTools: ["Write", "Edit", "NotebookEdit", "WebFetch", "WebSearch"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      cwd: repoPath,
      additionalDirectories: [repoPath],
      maxTurns: 200,
      agents: agentDefinitions,
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
        filesystem: {
          denyWrite: ["/**"],
        },
      },
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append:
          "You are analyzing a repository for creator control and trust issues. Focus on how the creator can affect users, NOT on bugs or code quality. You are running in a sandboxed read-only environment.",
      },
      env: {
        ...process.env as Record<string, string>,
        CLAUDECODE: "",
      },
      stderr: (data: string) => {
        if (data.includes("error") || data.includes("Error")) {
          console.error("[claude]", data.trim());
        }
      },
    },
  })) {
    const msg = message as any;

    // Capture every assistant text block across the full conversation
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) {
          allAssistantText.push(block.text);
        }
      }
    }

    if (msg.type === "result" && msg.subtype === "success") {
      if (msg.structured_output) {
        allAssistantText.push(JSON.stringify(msg.structured_output));
      } else if (msg.result) {
        allAssistantText.push(msg.result);
      }
    } else if (msg.type === "result" && msg.subtype?.startsWith("error")) {
      console.error("Orchestrator error:", msg.errors);
      throw new Error(
        `Analysis failed: ${msg.errors?.join(", ") || "Unknown error"}`
      );
    }
  }

  // Dump full output for debugging
  const fullOutput = allAssistantText.join("\n\n---TURN---\n\n");
  try {
    const { writeFileSync } = await import("fs");
    writeFileSync("orchestrator-raw-output.txt", fullOutput);
  } catch {}

  // Parse Claude's response — search through ALL turns for the JSON report
  const analysis = parseOrchestratorOutput(fullOutput);

  // Run Codex second opinion
  let codexReview: CodexReview;
  try {
    codexReview = await runCodexReview(repoPath, analysis);
  } catch (err) {
    console.error("Codex review failed, proceeding without:", err);
    codexReview = {
      missedAssumptions: [],
      disputedAssumptions: [],
      overallAssessment: "Codex review was not available for this analysis.",
    };
  }

  return buildReport(analysis, codexReview, repoUrl, commitSha);
}

function isReportJson(obj: any): boolean {
  return obj && typeof obj === "object" && (
    "adminPrivileges" in obj || "categories" in obj || "executiveSummary" in obj || "fundControl" in obj
  );
}

function parseOrchestratorOutput(text: string) {
  let json: any;

  // Strategy: split by turn separators and try each chunk
  const chunks = text.split(/---TURN---/);

  // Try each chunk in reverse order (most recent first)
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i].trim();
    if (!chunk) continue;

    // 1. Direct parse of full chunk
    try {
      const parsed = JSON.parse(chunk);
      if (isReportJson(parsed)) { json = parsed; break; }
    } catch {}

    // 2. Extract from markdown code fence
    const fenceMatches = [...chunk.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/g)];
    for (const m of fenceMatches) {
      try {
        const parsed = JSON.parse(m[1]);
        if (isReportJson(parsed)) { json = parsed; break; }
      } catch {}
    }
    if (json) break;

    // 3. Find JSON objects that start with {"codeType" or {"executiveSummary"
    const reportPattern = /\{[^{}]*"(?:codeType|executiveSummary|adminPrivileges)"[\s\S]*\}/g;
    const matches = chunk.match(reportPattern);
    if (matches) {
      for (const match of matches) {
        // Try from each opening brace to find valid JSON
        for (let start = 0; start < match.length; start++) {
          if (match[start] !== "{") continue;
          let depth = 0;
          for (let end = start; end < match.length; end++) {
            if (match[end] === "{") depth++;
            if (match[end] === "}") depth--;
            if (depth === 0) {
              try {
                const parsed = JSON.parse(match.substring(start, end + 1));
                if (isReportJson(parsed)) { json = parsed; break; }
              } catch {}
              break;
            }
          }
          if (json) break;
        }
        if (json) break;
      }
    }
    if (json) break;
  }

  // 4. Last resort: find the largest { ... } in the entire text
  if (!json) {
    const allText = chunks.join("\n");
    const bracePositions: number[] = [];
    for (let i = 0; i < allText.length; i++) {
      if (allText[i] === "{") bracePositions.push(i);
    }
    for (const start of bracePositions) {
      let depth = 0;
      for (let end = start; end < allText.length; end++) {
        if (allText[end] === "{") depth++;
        if (allText[end] === "}") depth--;
        if (depth === 0) {
          if (end - start > 500) { // Skip tiny objects
            try {
              const parsed = JSON.parse(allText.substring(start, end + 1));
              if (isReportJson(parsed)) { json = parsed; break; }
            } catch {}
          }
          break;
        }
      }
      if (json) break;
    }
  }

  if (!json) {
    const last500 = text.substring(Math.max(0, text.length - 500));
    throw new Error(
      `Could not find report JSON in orchestrator output. Last 500 chars: ${last500}`
    );
  }

  return {
    codeType: json.codeType || "unknown",
    trustLabel: json.trustLabel || "USE WITH CAUTION",
    trustLabelReason: json.trustLabelReason || "",
    executiveSummary:
      json.executiveSummary || "Analysis completed but no summary was provided.",
    adminPrivileges: parseCategoryReport(json.adminPrivileges),
    upgradeMechanisms: parseCategoryReport(json.upgradeMechanisms),
    dataAccess: parseCategoryReport(json.dataAccess),
    fundControl: parseCategoryReport(json.fundControl),
    killSwitches: parseCategoryReport(json.killSwitches),
    backdoors: parseCategoryReport(json.backdoors),
    disclosureLevel: parseCategoryReport(json.disclosureLevel),
  };
}
