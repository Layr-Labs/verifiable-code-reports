import { mnemonicToAccount } from "viem/accounts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Validate at startup but don't export raw secrets
requireEnv("MNEMONIC");
const account = mnemonicToAccount(requireEnv("MNEMONIC") as `${string}`);

const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === "1";
if (!useBedrock) requireEnv("ANTHROPIC_API_KEY");
export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  account,
  signerAddress: account.address,
  useBedrock,
  awsRegion: process.env.AWS_REGION || "us-east-1",
  rpcUrl: process.env.ETH_RPC_URL || "https://eth.llamarpc.com",
  appControllerAddress: "0xc38d35Fc995e75342A21CBd6D770305b142Fbe67" as `0x${string}`,
  eigencloudUserApiBase: process.env.EIGENCLOUD_USER_API || "https://userapi-compute.eigencloud.xyz",
  pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL || "300", 10),
} as const;
