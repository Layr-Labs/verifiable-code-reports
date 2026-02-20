import { mnemonicToAccount } from "viem/accounts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const mnemonic = requireEnv("MNEMONIC");
const account = mnemonicToAccount(mnemonic as `${string}`);

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  mnemonic,
  account,
  signerAddress: account.address,
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  openaiApiKey: requireEnv("OPENAI_API_KEY"),
  facilitatorUrl: process.env.FACILITATOR_URL || "https://x402.org/facilitator",
  network: (process.env.NETWORK || "eip155:8453") as `${string}:${string}`,
  price: process.env.PRICE || "$25.00",
} as const;
