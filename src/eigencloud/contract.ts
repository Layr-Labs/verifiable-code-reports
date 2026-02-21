import { createPublicClient, http, parseAbiItem } from "viem";
import { mainnet } from "viem/chains";
import { config } from "../config.js";

const client = createPublicClient({
  chain: mainnet,
  transport: http(config.rpcUrl),
});

const APP_CONTROLLER = config.appControllerAddress;
export const CONTRACT_START_BLOCK = 23443466n;

const abi = [
  {
    name: "getAppLatestReleaseBlockNumber",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "app", type: "address" }],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    name: "getAppStatus",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "app", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "getAppCreator",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "app", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const appUpgradedEvent = parseAbiItem(
  "event AppUpgraded(address indexed app, uint256 rmsReleaseId, (((bytes32 digest, string registry)[] artifacts, uint32 upgradeByTime) rmsRelease, bytes publicEnv, bytes encryptedEnv) release)"
);

export async function isRegisteredApp(appAddress: `0x${string}`): Promise<boolean> {
  try {
    const status = await client.readContract({
      address: APP_CONTROLLER,
      abi,
      functionName: "getAppStatus",
      args: [appAddress],
    });
    return status > 0;
  } catch {
    return false;
  }
}

export async function getLatestReleaseBlock(appAddress: `0x${string}`): Promise<number> {
  const block = await client.readContract({
    address: APP_CONTROLLER,
    abi,
    functionName: "getAppLatestReleaseBlockNumber",
    args: [appAddress],
  });
  return block;
}

export async function getAppUpgradedEvents(
  appAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
) {
  return client.getLogs({
    address: APP_CONTROLLER,
    event: appUpgradedEvent,
    args: { app: appAddress },
    fromBlock,
    toBlock,
  });
}

export function bytes32ToImageDigest(digest: `0x${string}`): string {
  return `sha256:${digest.slice(2)}`;
}
