import path from "node:path";
import { fileURLToPath } from "node:url";
import { PactClient } from "@pactnet/agent-sdk";
import dotenv from "dotenv";
import { ethers } from "ethers";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.PHAROS_RPC_URL!);
  const signer = new ethers.Wallet(process.env.TRADING_AGENT_PRIVATE_KEY!, provider);
  const pactnet = new PactClient(
    provider,
    signer,
    process.env.PACT_ENGINE_ADDRESS!,
    process.env.NEXT_PUBLIC_ARBITER_URL ?? "http://localhost:3001",
    process.env.REPUTATION_NFT_ADDRESS!
  );

  const counterparty = process.env.COUNTERPARTY_AGENT_ADDRESS!;

  const created = await pactnet.createPact({
    agentB: counterparty,
    commitmentText: "I commit to publishing a signed rebalance transaction hash within 30 minutes, or I forfeit my bond.",
    bondWei: ethers.parseEther("0.01").toString(),
    deadlineSeconds: 30 * 60
  });

  await pactnet.submitEvidence(created.pactId, [
    {
      type: "onchain_tx",
      value: "0xexample_rebalance_transaction_hash",
      timestamp: Math.floor(Date.now() / 1000)
    }
  ]);

  const trust = await pactnet.getAgentTrustScore(await signer.getAddress());
  console.log({ pactId: created.pactId, reliabilityPct: trust.reliabilityPct, riskTier: trust.riskTier });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
