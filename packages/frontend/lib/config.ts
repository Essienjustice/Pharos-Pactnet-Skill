import type { Address } from "viem";

export const ARBITER_URL = process.env.NEXT_PUBLIC_ARBITER_URL ?? "http://localhost:3001";
export const ENGINE_ADDRESS = (process.env.NEXT_PUBLIC_PACT_ENGINE_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;
export const NFT_ADDRESS = (process.env.NEXT_PUBLIC_REPUTATION_NFT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "1672");
export const PHAROS_RPC_URL = process.env.NEXT_PUBLIC_PHAROS_RPC_URL ?? "https://rpc.pharos.xyz";
export const NATIVE_TOKEN_SYMBOL = CHAIN_ID === 1672 ? "PROS" : "PHRS";
export const DEMO_PACT_IDS = (process.env.NEXT_PUBLIC_DEMO_PACT_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
