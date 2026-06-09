import dotenv from "dotenv";
import { PactClient } from "@pactnet/agent-sdk";
import type { ArbiterVerdict, Pact } from "@pactnet/agent-sdk";
import { ethers } from "ethers";
import { AgentA } from "./agents/AgentA.js";
import { AgentB } from "./agents/AgentB.js";

dotenv.config({ path: "../../.env" });

export type DemoScenario = "happy" | "breach";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const bondOutcome = (pact: Pact, verdict: ArbiterVerdict | null) => {
  if (!verdict) {
    return "pending";
  }

  return verdict.fulfilled ? "bond returned to AgentA" : "bond split to AgentB and treasury";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type HealthResponse = {
  ok?: boolean;
  chainConnected?: boolean;
  latestBlock?: number;
  arbiterMode?: string;
};

const readOptionalEnv = (...names: string[]): string | null => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
};

const getArbiterUrl = (): string => {
  return readOptionalEnv("NEXT_PUBLIC_ARBITER_URL", "ARBITER_URL") ?? "http://127.0.0.1:3001";
};

const checkArbiterHealth = async (arbiterUrl: string): Promise<void> => {
  const endpoint = `${arbiterUrl.replace(/\/$/, "")}/health`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`health check returned ${response.status} ${response.statusText}`);
    }

    const health = (await response.json()) as HealthResponse;
    if (!health.ok || !health.chainConnected) {
      throw new Error(`health check was not ready: ${JSON.stringify(health)}`);
    }

    console.log(`[Demo] Arbiter ready at ${arbiterUrl} (latest block ${health.latestBlock ?? "unknown"})`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Arbiter is not reachable at ${endpoint}: ${detail}`,
        "Start the arbiter in another terminal before running the demo:",
        "  corepack pnpm --filter @pactnet/arbiter run build",
        "  corepack pnpm --filter @pactnet/arbiter run start",
        "If localhost resolves incorrectly on Node 24, set NEXT_PUBLIC_ARBITER_URL=http://127.0.0.1:3001."
      ].join("\n")
    );
  } finally {
    clearTimeout(timeout);
  }
};

const getFinalStatus = async (
  client: PactClient,
  pactId: string,
  fallback: { pact: Pact; verdict: ArbiterVerdict | null } | null
): Promise<{ pact: Pact; verdict: ArbiterVerdict | null }> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await client.getPact(pactId);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(1000 * attempt);
    }
  }

  if (fallback) {
    console.log(`[Demo] Final status fetch was slow; using last observed watcher state for pact ${pactId}`);
    return fallback;
  }

  throw lastError ?? new Error(`Unable to fetch final status for pact ${pactId}`);
};

export async function runDemo(scenario: DemoScenario = "happy"): Promise<void> {
  const provider = new ethers.JsonRpcProvider(requireEnv("PHAROS_RPC_URL"));
  const agentAWallet = new ethers.Wallet(requireEnv("DEMO_AGENT_A_KEY"), provider);
  const agentBWallet = new ethers.Wallet(requireEnv("DEMO_AGENT_B_KEY"), provider);
  const engineAddress = requireEnv("PACT_ENGINE_ADDRESS");
  const arbiterUrl = getArbiterUrl();

  await checkArbiterHealth(arbiterUrl);

  const agentAClient = new PactClient(provider, agentAWallet, engineAddress, arbiterUrl);
  const agentBClient = new PactClient(provider, agentBWallet, engineAddress, arbiterUrl);
  const agentB = new AgentB(agentBClient);
  let cleanup: () => void = () => undefined;
  let latestObservedStatus: { pact: Pact; verdict: ArbiterVerdict | null } | null = null;
  const agentA = new AgentA(agentAClient, agentBWallet.address, (pactId) => {
    cleanup();
    latestObservedStatus = null;
    cleanup = agentB.watchAndLog(pactId, (status) => {
      latestObservedStatus = status;
    });
  });

  const stop = () => {
    console.log("[Demo] Received SIGINT, stopping watcher");
    cleanup();
    process.exit(0);
  };
  process.once("SIGINT", stop);

  console.log(`[Demo] Running ${scenario} scenario`);
  const runPromise = scenario === "breach" ? agentA.runBreachPath() : agentA.runHappyPath();
  const pactId = await runPromise;

  await sleep(3500);
  const finalStatus = await getFinalStatus(agentAClient, pactId, latestObservedStatus);
  cleanup();
  process.removeListener("SIGINT", stop);

  console.table([
    {
      "Pact ID": pactId,
      "Final state": finalStatus.pact.state,
      "Verdict confidence": finalStatus.verdict?.confidence ?? "n/a",
      "Bond outcome": bondOutcome(finalStatus.pact, finalStatus.verdict)
    }
  ]);
}

const arg = process.argv[2] === "breach" ? "breach" : "happy";

if (process.argv[1]?.endsWith("run-demo.ts") || process.argv[1]?.endsWith("run-demo.js")) {
  runDemo(arg).catch((error) => {
    console.error(`[Demo] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
