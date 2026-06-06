import { PactEngine__factory } from "@pactnet/contracts/typechain-types";
import type { ArbiterVerdict, CreatePactInput, EvidenceItem, Pact, ParsedCommitment } from "@pactnet/shared";
import { ethers } from "ethers";
import { ArbiterClient } from "./ArbiterClient.js";

type PactEngine = ReturnType<typeof PactEngine__factory.connect>;
type ContractRunner = Parameters<typeof PactEngine__factory.connect>[1];

export class PactClient {
  private readonly arbiterClient: ArbiterClient;
  private readonly engine: PactEngine;

  constructor(
    private readonly provider: ethers.Provider,
    private readonly signer: ethers.Signer,
    engineAddress: string,
    arbiterUrl: string
  ) {
    this.arbiterClient = new ArbiterClient(arbiterUrl);
    this.engine = PactEngine__factory.connect(engineAddress, signer as unknown as ContractRunner);
  }

  async previewCommitment(text: string): Promise<ParsedCommitment> {
    return this.arbiterClient.parseCommitment(text);
  }

  async createPact(input: CreatePactInput): Promise<{ pactId: string; txHash: string; parsedCommitment: ParsedCommitment }> {
    const commitmentText = input.commitmentText;
    if (!commitmentText) {
      throw new Error("createPact requires commitmentText");
    }

    const agentB = input.agentB ?? input.counterparty;
    if (!agentB) {
      throw new Error("createPact requires agentB or counterparty");
    }

    const bondWei = input.bondWei ?? input.stakeWei;
    if (!bondWei) {
      throw new Error("createPact requires bondWei or stakeWei");
    }

    const parsedCommitment = await this.previewCommitment(commitmentText);
    const deadline = BigInt(input.deadline ?? Math.floor(Date.now() / 1000) + (input.deadlineSeconds ?? 90));
    const commitmentURI = ethers.toUtf8Bytes(input.commitmentURI ?? `pactnet://commitments/${Date.now()}`);
    const tx = await this.engine.createPact(agentB, commitmentText, commitmentURI, deadline, { value: BigInt(bondWei) });
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error(`createPact transaction ${tx.hash} did not produce a receipt`);
    }

    const pactId = receipt.logs.reduce<string | null>((found, log) => {
      if (found) {
        return found;
      }

      try {
        const pactCreatedTopic = ethers.id("PactCreated(uint256,address,address,uint256,uint256)");
        if (log.topics[0] === pactCreatedTopic && log.topics[1]) {
          return BigInt(log.topics[1]).toString();
        }
      } catch (error) {
        if (error instanceof Error) {
          return null;
        }
        throw error;
      }

      return null;
    }, null);

    if (!pactId) {
      throw new Error(`PactCreated event not found in transaction ${tx.hash}`);
    }

    await this.provider.getBlockNumber();

    return { pactId, txHash: tx.hash, parsedCommitment };
  }

  async submitEvidence(pactId: string, items: EvidenceItem[]): Promise<ArbiterVerdict> {
    return this.arbiterClient.submitEvidence({ pactId, evidence: items });
  }

  watchPact(
    pactId: string,
    callback: (pact: Pact, verdict: ArbiterVerdict | null) => void,
    intervalMs = 3000
  ): () => void {
    let lastSnapshot = "";
    let stopped = false;

    const poll = async () => {
      if (stopped) {
        return;
      }

      try {
        const status = await this.getPact(pactId);
        const snapshot = JSON.stringify(status);
        if (snapshot !== lastSnapshot) {
          lastSnapshot = snapshot;
          callback(status.pact, status.verdict);
        }
      } catch (error) {
        console.error(`Failed to poll pact ${pactId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, intervalMs);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  async getPact(pactId: string): Promise<{ pact: Pact; verdict: ArbiterVerdict | null }> {
    return this.arbiterClient.getPactStatus(pactId);
  }
}
