import { sql } from "../db/client.js";
import { cloneAtRef, cleanupRepo } from "../repo/clone.js";
import { analyzeRepo } from "../analysis/orchestrator.js";
import { signReport } from "../signing/signer.js";

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || "3", 10);
const MAX_RETRIES = 5;
const RETRY_DELAY_MINUTES = 30;
const queue: { buildId: number; appAddress: string }[] = [];
let running = 0;
// Track active analysis by git ref to prevent duplicate work.
// Maps ref key → promise that resolves when analysis completes.
const activeGitRefs = new Map<string, Promise<void>>();

export function enqueueBuild(buildId: number, appAddress: string) {
  queue.push({ buildId, appAddress });
  drain();
}

export function queueStatus() {
  return { queued: queue.length, running };
}

function drain() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!;
    running++;
    processBuild(job.buildId, job.appAddress).finally(() => {
      running--;
      drain();
    });
  }
}

/** Process pending builds from DB on startup (crash recovery). */
export async function resumePendingBuilds() {
  const pending = await sql`
    SELECT id, app_address FROM builds
    WHERE status IN ('pending', 'analyzing') AND retries < ${MAX_RETRIES}
    ORDER BY created_at ASC
  `;
  for (const build of pending) {
    await sql`UPDATE builds SET status = 'pending' WHERE id = ${build.id}`;
    enqueueBuild(build.id, build.app_address);
  }
  if (pending.length > 0) {
    console.log(`Resumed ${pending.length} pending build(s)`);
  }
}

/** Manual retry: reset a failed build so it can be re-analyzed. Resets retry count. */
export async function manualRetryBuild(buildId: number): Promise<boolean> {
  const [build] = await sql`
    SELECT id, app_address FROM builds WHERE id = ${buildId} AND status = 'failed'
  `;
  if (!build) return false;

  await sql`UPDATE builds SET status = 'pending', retries = 0, last_attempt_at = NULL WHERE id = ${buildId}`;
  enqueueBuild(build.id, build.app_address);
  console.log(`Build ${buildId} manually re-queued for retry`);
  return true;
}

/** Manual retry: reset ALL failed builds for an app. */
export async function manualRetryApp(appAddress: string): Promise<number> {
  const failed = await sql`
    SELECT id, app_address FROM builds WHERE app_address = ${appAddress} AND status = 'failed'
  `;
  for (const build of failed) {
    await sql`UPDATE builds SET status = 'pending', retries = 0, last_attempt_at = NULL WHERE id = ${build.id}`;
    enqueueBuild(build.id, build.app_address);
  }
  if (failed.length > 0) {
    console.log(`${failed.length} failed build(s) for ${appAddress} manually re-queued`);
  }
  return failed.length;
}

async function processBuild(buildId: number, appAddress: string) {
  const [build] = await sql`SELECT * FROM builds WHERE id = ${buildId}`;
  if (!build?.repo_url || !build?.git_ref) {
    await sql`UPDATE builds SET status = 'failed' WHERE id = ${buildId}`;
    console.error(`Build ${buildId} missing repo_url or git_ref`);
    return;
  }

  const refKey = `${build.repo_url}@${build.git_ref}`;

  // If the same repo+ref is already being analyzed, wait for it and copy the report
  const activePromise = activeGitRefs.get(refKey);
  if (activePromise) {
    console.log(`Build ${buildId} waiting for duplicate ref to finish: ${refKey}`);
    await activePromise;

    // Copy report from the completed build with the same ref
    const [existing] = await sql`
      SELECT r.report_json, r.logs_json, r.attestation_json, r.signature
      FROM reports r
      JOIN builds b ON r.build_id = b.id
      WHERE b.repo_url = ${build.repo_url} AND b.git_ref = ${build.git_ref}
      ORDER BY r.created_at DESC LIMIT 1
    `;

    if (existing) {
      await sql`
        INSERT INTO reports (build_id, app_address, report_json, logs_json, attestation_json, signature)
        VALUES (${buildId}, ${appAddress}, ${existing.report_json}, ${existing.logs_json}, ${existing.attestation_json}, ${existing.signature})
      `;
      await sql`UPDATE builds SET status = 'complete' WHERE id = ${buildId}`;
      console.log(`Build ${buildId} completed (copied report from duplicate ref)`);
    } else {
      // The other build must have failed — re-enqueue this one to try fresh
      enqueueBuild(buildId, appAddress);
    }
    return;
  }

  await sql`UPDATE builds SET status = 'analyzing', retries = retries + 1, last_attempt_at = NOW() WHERE id = ${buildId}`;

  let resolve: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  activeGitRefs.set(refKey, promise);

  console.log(`Analyzing build ${buildId} (${appAddress}) — ${refKey} [attempt ${build.retries + 1}]`);

  let repoPath: string | undefined;

  try {
    const cloneResult = cloneAtRef(build.repo_url, build.git_ref);
    repoPath = cloneResult.repoPath;

    const { report, logs } = await analyzeRepo(repoPath, build.repo_url, cloneResult.commitSha);
    const signed = await signReport(report, logs, {
      appAddress,
      imageDigest: build.image_digest,
      blockNumber: build.block_number?.toString(),
      provenanceVerified: build.provenance_verified,
    });

    await sql`
      INSERT INTO reports (build_id, app_address, report_json, logs_json, attestation_json, signature)
      VALUES (
        ${buildId},
        ${appAddress},
        ${JSON.stringify(signed.report)},
        ${JSON.stringify(signed.logs)},
        ${JSON.stringify(signed.attestation)},
        ${signed.signature}
      )
    `;

    await sql`UPDATE builds SET status = 'complete' WHERE id = ${buildId}`;
    console.log(`Report generated for build ${buildId} (${appAddress})`);
  } catch (err) {
    // build.retries was already incremented before analysis started
    const retries = build.retries + 1;
    console.error(`Analysis failed for build ${buildId} (attempt ${retries}/${MAX_RETRIES}):`, err);

    if (retries < MAX_RETRIES) {
      await sql`UPDATE builds SET status = 'pending' WHERE id = ${buildId}`;
      console.log(`Build ${buildId} re-queued for retry`);
      enqueueBuild(buildId, appAddress);
    } else {
      await sql`UPDATE builds SET status = 'failed' WHERE id = ${buildId}`;
      console.log(`Build ${buildId} permanently failed after ${MAX_RETRIES} attempts`);
    }
  } finally {
    activeGitRefs.delete(refKey);
    resolve!();
    if (repoPath) cleanupRepo(repoPath);
  }
}
