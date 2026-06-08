import { PactEngine__factory, ReputationNFT__factory } from "@pactnet/contracts/typechain-types";
import type { AgentTrustScore, ArbiterVerdict, CreatePactInput, EvidenceItem, Pact, ParsedCommitment } from "@pactnet/shared";
import { ethers } from "ethers";
import { ArbiterClient } from "./ArbiterClient.js";

type PactEngine = ReturnType<typeof PactEngine__factory.connect>;
type ReputationNFT = ReturnType<typeof ReputationNFT__factory.connect>;
type ContractRunner = Parameters<typeof PactEngine__factory.connect>[1];

const terminalPactStates = new Set<string>(["Fulfilled", "Breached", "Disputed"]);

const getRiskTier = (reliabilityPct: number): AgentTrustScore["riskTier"] => {
  if (reliabilityPct >= 90) {
    return "LOW";
  }

  if (reliabilityPct >= 70) {
    return "MEDIUM";
  }

  return "HIGH";
};

export class PactClient {
  private readonly arbiterClient: ArbiterClient;
  private readonly engine: PactEngine;
  private readonly reputationNFT: ReputationNFT | null;

  constructor(
    private readonly provider: ethers.Provider,
    private readonly signer: ethers.Signer,
    engineAddress: string,
    arbiterUrl: string,
    reputationNftAddress?: string
  ) {
    this.arbiterClient = new ArbiterClient(arbiterUrl);
    this.engine = PactEngine__factory.connect(engineAddress, signer as unknown as ContractRunner);
    this.reputationNFT = reputationNftAddress
      ? ReputationNFT__factory.connect(reputationNftAddress, provider as unknown as ContractRunner)
      : null;
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
    let timer: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const poll = async () => {
      if (stopped) {
        return;
      }

      try {
        const status = await this.getPact(pactId);
        if (stopped) {
          return;
        }

        const snapshot = JSON.stringify(status);
        if (snapshot !== lastSnapshot) {
          lastSnapshot = snapshot;
          callback(status.pact, status.verdict);
        }

        if (terminalPactStates.has(status.pact.state)) {
          stop();
        }
      } catch (error) {
        if (stopped) {
          return;
        }

        console.error(`Failed to poll pact ${pactId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    void poll();
    timer = setInterval(() => {
      void poll();
    }, intervalMs);

    return stop;
  }

  async getPact(pactId: string): Promise<{ pact: Pact; verdict: ArbiterVerdict | null }> {
    return this.arbiterClient.getPactStatus(pactId);
  }

  async getAgentTrustScore(address: string): Promise<AgentTrustScore> {
    if (!this.reputationNFT) {
      throw new Error("getAgentTrustScore requires a ReputationNFT address in the PactClient constructor");
    }

    const score = await this.reputationNFT.getScore(address);
    const fulfilled = Number(score.fulfilled);
    const breached = Number(score.breached);
    const disputed = Number(score.disputed);
    const total = fulfilled + breached;
    const reliabilityPct = total === 0 ? 0 : Math.round((fulfilled / total) * 100);

    return {
      address,
      fulfilled,
      breached,
      disputed,
      reliabilityPct,
      totalBondHonored: score.totalBondHonored.toString(),
      totalBondSlashed: score.totalBondSlashed.toString(),
      riskTier: getRiskTier(reliabilityPct)
    };
  }
}
