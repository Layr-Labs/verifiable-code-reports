import { sql } from "../db/client.js";
import { cloneAtRef, cleanupRepo } from "../repo/clone.js";
import { analyzeRepo } from "../analysis/orchestrator.js";
import { signReport } from "../signing/signer.js";

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || "3", 10);
const MAX_RETRIES = 2;
const queue: { buildId: number; appAddress: string }[] = [];
let running = 0;
const activeGitRefs = new Set<string>(); // prevent duplicate analysis of same commit

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

async function processBuild(buildId: number, appAddress: string) {
  const [build] = await sql`SELECT * FROM builds WHERE id = ${buildId}`;
  if (!build?.repo_url || !build?.git_ref) {
    await sql`UPDATE builds SET status = 'failed' WHERE id = ${buildId}`;
    console.error(`Build ${buildId} missing repo_url or git_ref`);
    return;
  }

  const refKey = `${build.repo_url}@${build.git_ref}`;

  // Skip if another build with the same repo+ref is already analyzing
  if (activeGitRefs.has(refKey)) {
    console.log(`Build ${buildId} skipped — same ref already analyzing: ${refKey}`);
    setTimeout(() => enqueueBuild(buildId, appAddress), 60_000);
    return;
  }

  await sql`UPDATE builds SET status = 'analyzing', retries = retries + 1 WHERE id = ${buildId}`;
  activeGitRefs.add(refKey);
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
    if (repoPath) cleanupRepo(repoPath);
  }
}
