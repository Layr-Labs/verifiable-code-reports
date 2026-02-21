import { keccak256, toBytes, encodePacked } from "viem";
import { config } from "../config.js";
import type { Report } from "../report/schema.js";

export function getSignerAddress(): `0x${string}` {
  return config.account.address;
}

export interface SignedReport {
  report: Report;
  logs: { claude: string[]; codex: string[] };
  attestation: {
    reportHash: `0x${string}`;
    contentHash: `0x${string}`;
    logsHash: `0x${string}`;
    timestamp: number;
    signerAddress: `0x${string}`;
    appAddress?: string;
    imageDigest?: string;
    blockNumber?: string;
    provenanceVerified?: boolean;
  };
  signature: `0x${string}`;
}

/**
 * Signs a report + logs with the mnemonic-derived ECDSA key.
 *
 * The signed payload is a keccak256 hash of tightly packed:
 *   contentHash | logsHash | timestamp | signerAddress | appAddress? | imageDigest?
 *
 * This ensures the signature covers the report content, the agent logs,
 * and the provenance metadata.
 *
 * Anyone can verify by:
 *   1. JSON.stringify(report) → keccak256 → must match contentHash
 *   2. JSON.stringify(logs) → keccak256 → must match logsHash
 *   3. encodePacked(contentHash, logsHash, timestamp, ...) → keccak256 → must match reportHash
 *   4. ecrecover(reportHash, signature) → must match signerAddress
 */
export async function signReport(
  report: Report,
  logs: { claude: string[]; codex: string[] },
  provenance?: {
    appAddress?: string;
    imageDigest?: string;
    blockNumber?: string;
    provenanceVerified?: boolean;
  },
): Promise<SignedReport> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signerAddress = config.account.address;

  const contentHash = keccak256(toBytes(JSON.stringify(report)));
  const logsHash = keccak256(toBytes(JSON.stringify(logs)));

  const packTypes: string[] = ["bytes32", "bytes32", "uint256", "address"];
  const packValues: any[] = [contentHash, logsHash, BigInt(timestamp), signerAddress];

  if (provenance?.appAddress) {
    packTypes.push("address");
    packValues.push(provenance.appAddress as `0x${string}`);
  }
  if (provenance?.imageDigest) {
    packTypes.push("bytes32");
    packValues.push(keccak256(toBytes(provenance.imageDigest)));
  }

  const reportHash = keccak256(
    encodePacked(packTypes as any, packValues),
  );

  const signature = await config.account.signMessage({
    message: { raw: toBytes(reportHash) },
  });

  return {
    report,
    logs,
    attestation: {
      reportHash,
      contentHash,
      logsHash,
      timestamp,
      signerAddress,
      appAddress: provenance?.appAddress,
      imageDigest: provenance?.imageDigest,
      blockNumber: provenance?.blockNumber,
      provenanceVerified: provenance?.provenanceVerified,
    },
    signature,
  };
}
