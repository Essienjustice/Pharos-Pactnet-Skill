import type { PactClient } from "@pactnet/agent-sdk";
import type { EvidenceItem } from "@pactnet/agent-sdk";
import { ethers } from "ethers";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AgentA {
  constructor(
    private readonly client: PactClient,
    private readonly agentBAddress: string,
    private readonly onPactCreated: (pactId: string) => void = () => undefined
  ) {}

  async runHappyPath(): Promise<string> {
    console.log("[AgentA] Starting happy-path pact");
    const commitmentText =
      "I commit to returning a valid TypeScript fibonacci implementation within 90 seconds, or I forfeit my bond.";
    const result = await this.client.createPact({
      agentB: this.agentBAddress,
      commitmentText,
      bondWei: ethers.parseEther("0.01").toString(),
      deadlineSeconds: 90
    });

    console.log(`[AgentA] Created pact ${result.pactId} in tx ${result.txHash}`);
    this.onPactCreated(result.pactId);
    console.log("[AgentA] Waiting 3 seconds before submitting implementation evidence");
    await sleep(3000);

    const evidence: EvidenceItem = {
      type: "ipfs_content",
      value: "ipfs://bafy-pactnet-fibonacci-demo",
      content: "ipfs://bafy-pactnet-fibonacci-demo",
      metadata: {
        code:
          "export function fibonacci(n: number): number {\n" +
          "  if (!Number.isInteger(n) || n < 0) throw new Error('n must be a non-negative integer');\n" +
          "  let previous = 0;\n" +
          "  let current = 1;\n" +
          "  for (let index = 0; index < n; index += 1) {\n" +
          "    const next = previous + current;\n" +
          "    previous = current;\n" +
          "    current = next;\n" +
          "  }\n" +
          "  return previous;\n" +
          "}"
      },
      timestamp: Math.floor(Date.now() / 1000)
    };

    const verdict = await this.client.submitEvidence(result.pactId, [evidence]);
    console.log(`[AgentA] Submitted evidence. Verdict confidence: ${verdict.confidence}`);
    return result.pactId;
  }

  async runBreachPath(): Promise<string> {
    console.log("[AgentA] Starting breach-path pact");
    const result = await this.client.createPact({
      agentB: this.agentBAddress,
      commitmentText:
        "I commit to returning a valid TypeScript fibonacci implementation within 35 seconds, or I forfeit my bond.",
      bondWei: ethers.parseEther("0.01").toString(),
      deadlineSeconds: 35
    });

    console.log(`[AgentA] Created pact ${result.pactId} in tx ${result.txHash}`);
    this.onPactCreated(result.pactId);
    console.log("[AgentA] Waiting 40 seconds to miss the deadline");
    await sleep(40_000);

    const verdict = await this.client.submitEvidence(result.pactId, [
      {
        type: "ipfs_content",
        value: "TIMEOUT",
        content: "TIMEOUT",
        timestamp: Math.floor(Date.now() / 1000)
      }
    ]);
    console.log(`[AgentA] Submitted timeout evidence. Verdict confidence: ${verdict.confidence}`);
    return result.pactId;
  }
}
