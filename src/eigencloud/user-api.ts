import { config } from "../config.js";

const BASE = config.eigencloudUserApiBase;
const HEADERS = { "x-client-id": "verifiable-code-reports" };

export interface BuildInfo {
  build_id: string;
  billing_address: string;
  repo_url: string;
  git_ref: string;
  status: "building" | "success" | "failed";
  build_type: "application" | "dependency";
  image_name: string;
  image_digest?: string | null;
  image_url?: string | null;
  provenance_json?: unknown;
  provenance_signature?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  dependencies?: Record<string, BuildInfo> | null;
}

export interface VerifyResult {
  status: "verified" | "failed";
  build_id?: string;
  repo_url?: string;
  git_ref?: string;
  image_digest?: string;
  provenance_json?: unknown;
  provenance_signature?: string;
  payload_type?: string;
  payload?: string;
  error?: string;
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 429) {
      const wait = Math.pow(2, i) * 2000;
      console.log(`Rate limited, retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  return fetch(url, { headers: HEADERS });
}

export async function getBuildByDigest(imageDigest: string): Promise<BuildInfo | null> {
  const res = await fetchWithRetry(`${BASE}/builds/image/${encodeURIComponent(imageDigest)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`User API /builds/image: ${res.status}`);
  return res.json();
}

export async function verifyBuild(imageDigest: string): Promise<VerifyResult | null> {
  const res = await fetchWithRetry(`${BASE}/builds/verify/${encodeURIComponent(imageDigest)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`User API /builds/verify: ${res.status}`);
  return res.json();
}

export async function getAppAttestations(appId: string): Promise<{ jwt: string }[]> {
  const res = await fetchWithRetry(`${BASE}/apps/${appId}/attestations`);
  if (!res.ok) return [];
  return res.json();
}
