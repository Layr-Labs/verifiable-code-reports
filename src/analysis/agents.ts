import { adminPrivilegesPrompt } from "./prompts/admin-privileges.js";
import { upgradeMechanismsPrompt } from "./prompts/upgrade-mechanisms.js";
import { dataAccessPrompt } from "./prompts/data-access.js";
import { fundControlPrompt } from "./prompts/fund-control.js";
import { killSwitchesPrompt } from "./prompts/kill-switches.js";
import { backdoorsPrompt } from "./prompts/backdoors.js";
import { disclosureLevelPrompt } from "./prompts/disclosure-level.js";
import { TEE_CONTEXT } from "./prompts/tee-context.js";

export interface AgentDef {
  description: string;
  prompt: string;
  tools: string[];
  model: "sonnet" | "opus" | "haiku";
}

const analysisTools = ["Read", "Glob", "Grep"];

// Prepend TEE context to every agent prompt
function withTEE(prompt: string): string {
  return prompt + "\n\n" + TEE_CONTEXT;
}

export const agentDefinitions: Record<string, AgentDef> = {
  "admin-privileges": {
    description:
      "Analyzes admin and owner privileges in the context of TEE execution. Use this agent to trace how the code uses privileged functions — not what an operator could theoretically do, but what the code actually does.",
    prompt: withTEE(adminPrivilegesPrompt),
    tools: analysisTools,
    model: "opus",
  },

  "upgrade-mechanisms": {
    description:
      "Analyzes upgrade and mutability mechanisms. Use this agent to find proxy patterns, upgradeable contracts, and whether code can be changed post-deployment. In TEE context, focus on on-chain upgradeability and build-time mutability.",
    prompt: withTEE(upgradeMechanismsPrompt),
    tools: analysisTools,
    model: "opus",
  },

  "data-access": {
    description:
      "Analyzes data access and privacy. Use this agent to find what data leaves the TEE boundary via APIs, events, and logs. In TEE context, operator cannot read internal state — focus on what the code intentionally exposes.",
    prompt: withTEE(dataAccessPrompt),
    tools: analysisTools,
    model: "opus",
  },

  "fund-control": {
    description:
      "Analyzes fund and financial control. Use this agent to trace the actual code flow for fund movements. In TEE context, operator cannot call contract functions directly — trace how the code uses settle(), transfer(), etc.",
    prompt: withTEE(fundControlPrompt),
    tools: analysisTools,
    model: "opus",
  },

  "kill-switches": {
    description:
      "Analyzes kill switches and pause mechanisms. Use this agent to find what happens if the TEE instance goes down and whether users can still access funds on-chain.",
    prompt: withTEE(killSwitchesPrompt),
    tools: analysisTools,
    model: "opus",
  },

  backdoors: {
    description:
      "Analyzes backdoors and hidden functions. Use this agent to find code paths that could harm users in the actual execution flow, not theoretical operator abuse.",
    prompt: withTEE(backdoorsPrompt),
    tools: analysisTools,
    model: "opus",
  },

  "disclosure-level": {
    description:
      "Analyzes transparency and disclosure level. Use this agent to assess open source status, TEE attestation verifiability, and whether users can confirm the code matches what's running.",
    prompt: withTEE(disclosureLevelPrompt),
    tools: analysisTools,
    model: "opus",
  },
};
