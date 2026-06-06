/**
 * These placeholder wallets are for local fallback wiring only.
 * Use funded demo wallets from .env for live Pharos demos.
 * Never use these keys for real funds.
 */
export const demoWallets = {
  agentA: {
    address: "0x1111111111111111111111111111111111111111",
    privateKey: "0x1111111111111111111111111111111111111111111111111111111111111111"
  },
  agentB: {
    address: "0x2222222222222222222222222222222222222222",
    privateKey: "0x2222222222222222222222222222222222222222222222222222222222222222"
  }
} as const;
