import { keccak256, toBytes } from "viem";
import { config } from "../config.js";
import type { Report } from "../report/schema.js";

export function getSignerAddress(): `0x${string}` {
  return config.account.address;
}

export async function signReport(report: Report) {
  const reportJson = JSON.stringify(report);
  const reportHash = keccak256(toBytes(reportJson));

  const signature = await config.account.signMessage({
    message: { raw: toBytes(reportHash) },
  });

  return {
    report,
    reportHash,
    signature,
    signerAddress: config.account.address,
  };
}
