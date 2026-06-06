import { PactEngine__factory } from "@pactnet/contracts/typechain-types";
import type { ArbiterVerdict, Pact, PactState } from "@pactnet/shared";
import { ethers } from "ethers";

type PactEngineContract = ReturnType<typeof PactEngine__factory.connect>;
type ContractRunner = Parameters<typeof PactEngine__factory.connect>[1];

const PACT_STATES: readonly PactState[] = ["Pending", "Active", "Fulfilled", "Breached", "Disputed"];

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parsePactId = (pactId: string): bigint => {
  try {
    return BigInt(pactId);
  } catch {
    throw new Error(`Invalid pact id "${pactId}"; expected a base-10 integer string`);
  }
};

const isConnectionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /network|timeout|connection|ECONN|SERVER_ERROR|could not detect network/i.test(message);
};

export class ChainService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private engine: PactEngineContract;
  private readonly primaryRpcUrl: string;
  private readonly fallbackRpcUrl: string | null;
  private readonly engineAddress: string;

  constructor() {
    try {
      this.primaryRpcUrl = requireEnv("PHAROS_RPC_URL");
      this.fallbackRpcUrl = process.env.PHAROS_RPC_URL_FALLBACK ?? null;
      this.engineAddress = requireEnv("PACT_ENGINE_ADDRESS");
      this.provider = new ethers.JsonRpcProvider(this.primaryRpcUrl);
      this.wallet = new ethers.Wallet(requireEnv("ARBITER_PRIVATE_KEY"), this.provider);
      this.engine = PactEngine__factory.connect(this.engineAddress, this.wallet as unknown as ContractRunner);
    } catch (error) {
      throw new Error(`Failed to initialize ChainService: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getArbiterAddress(): string {
    return this.wallet.address;
  }

  async getLatestBlock(): Promise<number> {
    return this.retryWithBackoff(() => this.provider.getBlockNumber());
  }

  async getPact(pactId: string): Promise<Pact | null> {
    try {
      const rawPact = await this.retryWithBackoff(() => this.engine.getPact(parsePactId(pactId)));

      if (rawPact.agentA === ethers.ZeroAddress) {
        return null;
      }

      const stateIndex = Number(rawPact.state);
      const state = PACT_STATES[stateIndex];

      if (!state) {
        throw new Error(`Unknown pact state enum value ${stateIndex}`);
      }

      return {
        id: pactId,
        agentA: rawPact.agentA,
        agentB: rawPact.agentB,
        commitmentHash: rawPact.commitmentHash,
        commitmentURI: ethers.toUtf8String(rawPact.commitmentURI),
        bond: rawPact.bond.toString(),
        deadline: Number(rawPact.deadline),
        state
      };
    } catch (error) {
      throw new Error(`Failed to fetch pact ${pactId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async settleWithVerdict(pact: Pact, verdict: ArbiterVerdict): Promise<void> {
    try {
      const tx = await this.retryWithBackoff(() =>
        this.engine.settleWithVerdict(
          parsePactId(pact.id),
          verdict.fulfilled,
          verdict.confidence,
          verdict.reasoning,
          verdict.signature
        )
      );

      await this.retryWithBackoff(() => tx.wait());
    } catch (error) {
      throw new Error(`Failed to settle pact ${pact.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAgentPacts(address: string): Promise<string[]> {
    try {
      const pactIds = await this.retryWithBackoff(() => this.engine.getAgentPacts(address));
      return pactIds.map((pactId) => pactId.toString());
    } catch (error) {
      throw new Error(`Failed to fetch pacts for agent ${address}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    baseDelayMs = 1000
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (isConnectionError(error)) {
          this.failoverProvider();
        }

        if (attempt < maxAttempts) {
          await delay(baseDelayMs * 2 ** (attempt - 1));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private failoverProvider(): void {
    if (!this.fallbackRpcUrl || this.provider._getConnection().url === this.fallbackRpcUrl) {
      return;
    }

    this.provider = new ethers.JsonRpcProvider(this.fallbackRpcUrl);
    this.wallet = new ethers.Wallet(this.wallet.privateKey, this.provider);
    this.engine = PactEngine__factory.connect(this.engineAddress, this.wallet as unknown as ContractRunner);
  }
}
