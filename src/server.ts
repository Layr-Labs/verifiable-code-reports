import express from "express";
import { config } from "./config.js";
import { createX402Middleware } from "./payment/x402.js";
import { cloneRepo, cleanupRepo } from "./repo/clone.js";
import { analyzeRepo } from "./analysis/orchestrator.js";
import { signReport } from "./signing/signer.js";

export const app = express();
app.use(express.json());

// Health check (not paywalled)
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    signerAddress: config.signerAddress,
    network: config.network,
  });
});

// Apply x402 payment middleware
app.use(createX402Middleware());

// Main report endpoint (paywalled)
app.post("/api/report", async (req, res) => {
  const { repoUrl } = req.body;
  if (!repoUrl || typeof repoUrl !== "string") {
    res.status(400).json({ error: "repoUrl is required" });
    return;
  }

  let repoPath: string | undefined;

  try {
    const cloneResult = cloneRepo(repoUrl);
    repoPath = cloneResult.repoPath;

    const report = await analyzeRepo(repoPath, repoUrl, cloneResult.commitSha);
    const signed = await signReport(report);

    res.json(signed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Analysis failed:", message);
    res.status(500).json({ error: "Analysis failed", message });
  } finally {
    if (repoPath) cleanupRepo(repoPath);
  }
});
