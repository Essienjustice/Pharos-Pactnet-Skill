import { PactClient } from "@pactnet/agent-sdk";
import { describe, expect, it } from "vitest";
import { ethers } from "ethers";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for e2e tests`);
  }

  return value;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const provider = new ethers.JsonRpcProvider(requireEnv("PHAROS_RPC_URL"));
const agentA = new ethers.Wallet(requireEnv("DEMO_AGENT_A_KEY"), provider);
const agentB = new ethers.Wallet(requireEnv("DEMO_AGENT_B_KEY"), provider);
const client = new PactClient(
  provider,
  agentA,
  requireEnv("PACT_ENGINE_ADDRESS"),
  process.env.NEXT_PUBLIC_ARBITER_URL ?? process.env.ARBITER_URL ?? "http://localhost:3001"
);

describe.sequential("PactNet e2e", () => {
  it("full happy path creates and fulfills a pact", async () => {
    const result = await client.createPact({
      agentB: agentB.address,
      commitmentText: "I commit to returning a valid TypeScript fibonacci implementation within 90 seconds.",
      bondWei: ethers.parseEther("0.01").toString(),
      deadlineSeconds: 90
    });
    const verdict = await client.submitEvidence(result.pactId, [
      {
        type: "ipfs_content",
        content: "export function fibonacci(n: number): number { return n <= 1 ? n : fibonacci(n - 1) + fibonacci(n - 2); }"
      }
    ]);
    const status = await client.getPact(result.pactId);

    expect(verdict.fulfilled).to.equal(true);
    expect(status.pact.state).to.equal("Fulfilled");
  }, 30_000);

  it("breach path fails after deadline", async () => {
    const result = await client.createPact({
      agentB: agentB.address,
      commitmentText: "I commit to returning a valid TypeScript fibonacci implementation within 10 seconds.",
      bondWei: ethers.parseEther("0.01").toString(),
      deadlineSeconds: 10
    });
    await delay(12_000);
    const verdict = await client.submitEvidence(result.pactId, [
      {
        type: "ipfs_content",
        content: "TIMEOUT"
      }
    ]);

    expect(verdict.fulfilled).to.equal(false);
  }, 30_000);

  it("parse quality stays above confidence threshold", async () => {
    const commitments = [
      "I commit to posting a valid JSON API response within 60 seconds.",
      "I commit to publishing a CID containing a runnable TypeScript fibonacci function.",
      "I commit to sending an onchain transaction proving delivery before the deadline.",
      "I commit to producing a zk proof that the model output passed validation.",
      "I commit to returning oracle data showing the job completed successfully."
    ];

    for (const commitment of commitments) {
      const parsed = await client.previewCommitment(commitment);
      expect(parsed.confidenceInParse ?? parsed.confidence ?? 0).to.be.greaterThanOrEqual(60);
    }
  }, 30_000);
});
