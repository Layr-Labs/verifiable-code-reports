import { execFileSync } from "child_process";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { sanitizeTrustedRepoUrl, sanitizeGitRef } from "../lib/sanitize.js";

const CLONE_TIMEOUT_MS = 120_000;
const MAX_REPO_SIZE_MB = 500;

function checkSize(repoPath: string): void {
  const sizeOutput = execFileSync("du", ["-sm", repoPath], { encoding: "utf-8" });
  const sizeMb = parseInt(sizeOutput.split("\t")[0], 10);
  if (sizeMb > MAX_REPO_SIZE_MB) {
    cleanupRepo(repoPath);
    throw new Error(`Repository is ${sizeMb}MB, exceeds ${MAX_REPO_SIZE_MB}MB limit`);
  }
}

function getHead(repoPath: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoPath,
    encoding: "utf-8",
    timeout: 10_000,
  }).trim();
}

export function cloneAtRef(repoUrl: string, gitRef: string): { repoPath: string; commitSha: string } {
  const url = sanitizeTrustedRepoUrl(repoUrl);
  const ref = sanitizeGitRef(gitRef);
  const repoPath = join(tmpdir(), "vcr-repos", randomUUID());

  execFileSync("git", ["clone", url, repoPath], {
    timeout: CLONE_TIMEOUT_MS,
    stdio: "pipe",
  });

  execFileSync("git", ["checkout", ref], {
    cwd: repoPath,
    timeout: 30_000,
    stdio: "pipe",
  });

  checkSize(repoPath);
  return { repoPath, commitSha: getHead(repoPath) };
}

export function cleanupRepo(repoPath: string): void {
  try {
    rmSync(repoPath, { recursive: true, force: true });
  } catch {
    // best effort
  }
}
