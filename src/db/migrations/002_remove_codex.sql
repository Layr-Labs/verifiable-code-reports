-- Codex (OpenAI) was used as an independent second-opinion analyzer alongside
-- Claude. It ran via the Codex SDK which spawns a sandboxed CLI process that
-- uses Landlock/seccomp on Linux to restrict tool execution. Inside our TEE
-- Docker container, the kernel-level sandbox consistently failed — Codex could
-- not read the cloned repo files, so it always returned a generic "unable to
-- access files" response with USE WITH CAUTION and agrees=false, polluting
-- every report with a meaningless disagreement. Rather than grant Codex
-- unrestricted shell access (danger-full-access) inside the container, we
-- removed it entirely. Claude's multi-agent analysis with read-only tooling
-- via the Agent SDK works reliably in the TEE and provides sufficient coverage.

-- Remove codexAnalysis from stored reports
UPDATE reports
SET report_json = report_json - 'codexAnalysis'
WHERE report_json ? 'codexAnalysis';

-- Remove codex logs from stored logs
UPDATE reports
SET logs_json = logs_json - 'codex'
WHERE logs_json ? 'codex';
