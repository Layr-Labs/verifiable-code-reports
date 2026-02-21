import { sql } from "../db/client.js";
import { config } from "../config.js";
import {
  getLatestReleaseBlock,
  getAppUpgradedEvents,
  bytes32ToImageDigest,
  CONTRACT_START_BLOCK,
} from "./contract.js";
import { getBuildByDigest, verifyBuild } from "./user-api.js";
import { enqueueBuild } from "./pipeline.js";
import { sanitizeTrustedRepoUrl, sanitizeGitRef } from "../lib/sanitize.js";

export function startPoller() {
  console.log(`Poller started (interval: ${config.pollIntervalSeconds}s)`);
  pollAllApps().catch((err) => console.error("Initial poll failed:", err));
  setInterval(() => {
    pollAllApps().catch((err) => console.error("Poll cycle failed:", err));
  }, config.pollIntervalSeconds * 1000);
}

async function pollAllApps() {
  const apps = await sql`SELECT * FROM monitored_apps`;
  for (const app of apps) {
    try {
      await pollApp(app.app_address, BigInt(app.last_seen_block));
    } catch (err) {
      console.error(`Poll failed for ${app.app_address}:`, err);
    }
  }
}

export async function pollApp(appAddress: string, lastSeenBlock: bigint) {
  const latestBlock = await getLatestReleaseBlock(appAddress as `0x${string}`);

  if (BigInt(latestBlock) <= lastSeenBlock) return;

  console.log(`New release detected for ${appAddress} at block ${latestBlock}`);

  // First scan: full history from contract deploy. Subsequent: incremental.
  const from = lastSeenBlock > 0n ? lastSeenBlock + 1n : CONTRACT_START_BLOCK;
  const to = BigInt(latestBlock) + 10n;

  console.log(`Scanning AppUpgraded events ${from}..${to}`);
  const events = await getAppUpgradedEvents(appAddress as `0x${string}`, from, to);

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const event of events) {
    const artifacts = event.args.release?.rmsRelease?.artifacts;
    if (!artifacts || artifacts.length === 0) continue;

    const digest = bytes32ToImageDigest(artifacts[0].digest);
    const registry = artifacts[0].registry;

    const [existing] = await sql`
      SELECT id FROM builds WHERE app_address = ${appAddress} AND image_digest = ${digest}
    `;
    if (existing) continue;

    // Rate limit: 1.5s between User API calls to avoid 429s
    await delay(1500);

    let repoUrl: string | null = null;
    let gitRef: string | null = null;
    let verified = false;

    try {
      const buildInfo = await getBuildByDigest(digest);
      if (buildInfo) {
        repoUrl = sanitizeTrustedRepoUrl(buildInfo.repo_url);
        gitRef = sanitizeGitRef(buildInfo.git_ref);
      }

      await delay(1500);
      const verification = await verifyBuild(digest);
      verified = verification?.status === "verified";
    } catch (err) {
      console.error(`Failed to fetch/validate build info for ${digest}:`, err);
    }

    const eventBlock = event.blockNumber?.toString() ?? latestBlock.toString();

    if (!repoUrl || !gitRef) {
      // No build info from User API — record as unverifiable so we don't re-check
      await sql`
        INSERT INTO builds (app_address, block_number, image_digest, registry, repo_url, git_ref, provenance_verified, status)
        VALUES (${appAddress}, ${eventBlock}, ${digest}, ${registry}, ${null}, ${null}, ${false}, 'unverifiable')
        ON CONFLICT (app_address, image_digest) DO NOTHING
      `;
      console.log(`Build ${digest.slice(0, 20)}... marked unverifiable (no build info)`);
      continue;
    }

    const [build] = await sql`
      INSERT INTO builds (app_address, block_number, image_digest, registry, repo_url, git_ref, provenance_verified, status)
      VALUES (${appAddress}, ${eventBlock}, ${digest}, ${registry}, ${repoUrl}, ${gitRef}, ${verified}, 'pending')
      RETURNING id
    `;

    enqueueBuild(build.id, appAddress);
  }

  await sql`
    UPDATE monitored_apps
    SET last_seen_block = ${latestBlock.toString()}, updated_at = NOW()
    WHERE app_address = ${appAddress}
  `;
}
