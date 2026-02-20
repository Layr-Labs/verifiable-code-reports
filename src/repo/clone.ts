import { execSync } from "child_process";
import { rmSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const CLONE_TIMEOUT_MS = 120_000;
const MAX_REPO_SIZE_MB = 500;

const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/;

export function cloneRepo(repoUrl: string): { repoPath: string; commitSha: string } {
  if (!GITHUB_URL_PATTERN.test(repoUrl)) {
    throw new Error(
      "Only public GitHub repository URLs are accepted (https://github.com/owner/repo)"
    );
  }

  const repoPath = join(tmpdir(), "vcr-repos", randomUUID());

  execSync(`git clone --depth 1 "${repoUrl}" "${repoPath}"`, {
    timeout: CLONE_TIMEOUT_MS,
    stdio: "pipe",
  });

  // Check repo size
  const sizeOutput = execSync(`du -sm "${repoPath}"`, { encoding: "utf-8" });
  const sizeMb = parseInt(sizeOutput.split("\t")[0], 10);
  if (sizeMb > MAX_REPO_SIZE_MB) {
    cleanupRepo(repoPath);
    throw new Error(
      `Repository is ${sizeMb}MB, exceeds ${MAX_REPO_SIZE_MB}MB limit`
    );
  }

  const commitSha = execSync("git rev-parse HEAD", {
    cwd: repoPath,
    encoding: "utf-8",
  }).trim();

  return { repoPath, commitSha };
}

export function cleanupRepo(repoPath: string): void {
  try {
    rmSync(repoPath, { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
}
