import { getAddress, isAddress } from "viem";

/**
 * Validates and returns a checksummed Ethereum address.
 * Throws on invalid input.
 */
export function sanitizeAddress(input: unknown): `0x${string}` {
  if (typeof input !== "string") throw new Error("Address must be a string");
  if (!isAddress(input)) throw new Error("Invalid Ethereum address");
  return getAddress(input);
}

/**
 * Validates a git repository URL from the EigenCloud User API.
 * Allows any https:// git host (GitHub, GitLab, Bitbucket, etc.)
 * since these come from a trusted build system, not user input.
 * Still blocks SSH, file://, and shell metacharacters.
 */
const HTTPS_GIT_URL_PATTERN = /^https:\/\/[\w.-]+(:\d+)?\/[\w.@:/-]+(\.git)?$/;

export function sanitizeTrustedRepoUrl(input: unknown): string {
  if (typeof input !== "string") throw new Error("repoUrl must be a string");
  const trimmed = input.trim();
  if (trimmed.length > 2048) throw new Error("repoUrl too long");
  if (!HTTPS_GIT_URL_PATTERN.test(trimmed)) {
    throw new Error(`repoUrl must be an HTTPS git URL, got: ${trimmed.slice(0, 100)}`);
  }
  return trimmed;
}

/**
 * Validates a git ref (commit SHA, branch, or tag).
 * Only allows alphanumeric, hyphens, underscores, dots, slashes.
 * Blocks shell metacharacters entirely.
 */
const GIT_REF_PATTERN = /^[a-zA-Z0-9._\-/]+$/;

export function sanitizeGitRef(input: unknown): string {
  if (typeof input !== "string") throw new Error("gitRef must be a string");
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 256) {
    throw new Error("gitRef must be 1-256 characters");
  }
  if (!GIT_REF_PATTERN.test(trimmed)) {
    throw new Error("gitRef contains invalid characters");
  }
  if (trimmed.includes("..")) {
    throw new Error("gitRef cannot contain '..'");
  }
  return trimmed;
}

/**
 * Validates an image digest string.
 * Must be sha256:<64 hex chars>.
 */
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function sanitizeImageDigest(input: unknown): string {
  if (typeof input !== "string") throw new Error("imageDigest must be a string");
  const trimmed = input.trim().toLowerCase();
  if (!DIGEST_PATTERN.test(trimmed)) {
    throw new Error("imageDigest must be sha256:<64 hex chars>");
  }
  return trimmed;
}

/**
 * Clamps a pagination offset to a non-negative integer.
 */
export function sanitizeOffset(input: unknown): number {
  const n = parseInt(String(input), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Clamps a pagination limit to 1–max range.
 */
export function sanitizeLimit(input: unknown, max = 100, defaultVal = 20): number {
  const n = parseInt(String(input), 10);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}
