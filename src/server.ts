import express from "express";
import { config } from "./config.js";
import { sql } from "./db/client.js";
import { isRegisteredApp } from "./eigencloud/contract.js";
import { pollApp } from "./eigencloud/poller.js";
import { queueStatus, manualRetryBuild, manualRetryApp } from "./eigencloud/pipeline.js";
import {
  sanitizeAddress,
  sanitizeImageDigest,
  sanitizeLimit,
  sanitizeOffset,
} from "./lib/sanitize.js";

export const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-client-id");
  if (_req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

// ── Health ──────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    signerAddress: config.signerAddress,
    queue: queueStatus(),
  });
});

// ── EigenCloud ──────────────────────────────────────────────────────

app.post("/api/eigencloud/register", async (req, res) => {
  try {
    let checksummed: `0x${string}`;
    try {
      checksummed = sanitizeAddress(req.body?.appAddress);
    } catch {
      res.status(400).json({ error: "Invalid or missing appAddress" });
      return;
    }

    const registered = await isRegisteredApp(checksummed);
    if (!registered) {
      res.status(404).json({ error: "App not found on EigenCloud AppController" });
      return;
    }

    await sql`
      INSERT INTO monitored_apps (app_address)
      VALUES (${checksummed})
      ON CONFLICT (app_address) DO NOTHING
    `;

    pollApp(checksummed, 0n).catch((err) => {
      console.error(`Initial poll for ${checksummed} failed:`, err);
    });

    res.json({ status: "registered", appAddress: checksummed });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

function parseJsonb(val: unknown) {
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}

function formatReportRow(row: any) {
  return {
    report: parseJsonb(row.report_json),
    attestation: parseJsonb(row.attestation_json),
    signature: row.signature,
    generatedAt: row.created_at,
  };
}

app.get("/api/eigencloud/report/:appAddress", async (req, res) => {
  try {
    let addr: string;
    try { addr = sanitizeAddress(req.params.appAddress); } catch {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    const [row] = await sql`
      SELECT r.report_json, r.attestation_json, r.signature, r.created_at
      FROM reports r
      JOIN builds b ON r.build_id = b.id
      WHERE r.app_address = ${addr}
      ORDER BY r.created_at DESC
      LIMIT 1
    `;

    if (!row) {
      res.status(404).json({ error: "No report found. Register this app first." });
      return;
    }

    res.json(formatReportRow(row));
  } catch (err) {
    console.error("Report error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/eigencloud/reports/:appAddress", async (req, res) => {
  try {
    let addr: string;
    try { addr = sanitizeAddress(req.params.appAddress); } catch {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    const limit = sanitizeLimit(req.query.limit);
    const offset = sanitizeOffset(req.query.offset);

    const rows = await sql`
      SELECT r.report_json, r.attestation_json, r.signature, r.created_at
      FROM reports r
      JOIN builds b ON r.build_id = b.id
      WHERE r.app_address = ${addr}
      ORDER BY r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    res.json({ reports: rows.map(formatReportRow), appAddress: addr });
  } catch (err) {
    console.error("Reports error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/eigencloud/report/:appAddress/:imageDigest", async (req, res) => {
  try {
    let addr: string;
    try { addr = sanitizeAddress(req.params.appAddress); } catch {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    let digest: string;
    try {
      digest = sanitizeImageDigest(decodeURIComponent(req.params.imageDigest));
    } catch {
      res.status(400).json({ error: "Invalid imageDigest format (expected sha256:<64 hex>)" });
      return;
    }

    const [row] = await sql`
      SELECT r.report_json, r.attestation_json, r.signature, r.created_at
      FROM reports r
      JOIN builds b ON r.build_id = b.id
      WHERE r.app_address = ${addr} AND b.image_digest = ${digest}
      LIMIT 1
    `;

    if (!row) {
      res.status(404).json({ error: "No report for this build" });
      return;
    }

    res.json(formatReportRow(row));
  } catch (err) {
    console.error("Report by digest error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── Logs (separate, on-demand) ──────────────────────────────────────

app.get("/api/eigencloud/report/:appAddress/logs", async (req, res) => {
  try {
    let addr: string;
    try { addr = sanitizeAddress(req.params.appAddress); } catch {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    const [row] = await sql`
      SELECT r.logs_json, r.attestation_json
      FROM reports r
      JOIN builds b ON r.build_id = b.id
      WHERE r.app_address = ${addr}
      ORDER BY r.created_at DESC
      LIMIT 1
    `;

    if (!row) {
      res.status(404).json({ error: "No report found" });
      return;
    }

    const attestation = parseJsonb(row.attestation_json);
    res.json({
      logs: parseJsonb(row.logs_json),
      logsHash: attestation?.logsHash,
    });
  } catch (err) {
    console.error("Logs error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/eigencloud/report/:appAddress/:imageDigest/logs", async (req, res) => {
  try {
    let addr: string;
    try { addr = sanitizeAddress(req.params.appAddress); } catch {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    let digest: string;
    try {
      digest = sanitizeImageDigest(decodeURIComponent(req.params.imageDigest));
    } catch {
      res.status(400).json({ error: "Invalid imageDigest format" });
      return;
    }

    const [row] = await sql`
      SELECT r.logs_json, r.attestation_json
      FROM reports r
      JOIN builds b ON r.build_id = b.id
      WHERE r.app_address = ${addr} AND b.image_digest = ${digest}
      LIMIT 1
    `;

    if (!row) {
      res.status(404).json({ error: "No report found" });
      return;
    }

    const attestation = parseJsonb(row.attestation_json);
    res.json({
      logs: parseJsonb(row.logs_json),
      logsHash: attestation?.logsHash,
    });
  } catch (err) {
    console.error("Logs by digest error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── Builds ──────────────────────────────────────────────────────────

app.get("/api/eigencloud/builds/:appAddress", async (req, res) => {
  try {
    let addr: string;
    try { addr = sanitizeAddress(req.params.appAddress); } catch {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    const builds = await sql`
      SELECT id, image_digest, block_number, registry, repo_url, git_ref,
             provenance_verified, status, retries, last_attempt_at, created_at
      FROM builds
      WHERE app_address = ${addr}
      ORDER BY created_at DESC
    `;

    res.json({ builds, appAddress: addr });
  } catch (err) {
    console.error("Builds error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── Retry ───────────────────────────────────────────────────────────

app.post("/api/eigencloud/retry/:appAddress", async (req, res) => {
  try {
    let addr: string;
    try { addr = sanitizeAddress(req.params.appAddress); } catch {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    const count = await manualRetryApp(addr);
    res.json({ retriggered: count, appAddress: addr });
  } catch (err) {
    console.error("Retry app error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/api/eigencloud/retry/:appAddress/:buildId", async (req, res) => {
  try {
    const buildId = parseInt(req.params.buildId, 10);
    if (!Number.isFinite(buildId) || buildId < 1) {
      res.status(400).json({ error: "Invalid buildId" });
      return;
    }

    const ok = await manualRetryBuild(buildId);
    if (!ok) {
      res.status(404).json({ error: "Build not found or not in failed state" });
      return;
    }

    res.json({ retriggered: true, buildId });
  } catch (err) {
    console.error("Retry build error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
