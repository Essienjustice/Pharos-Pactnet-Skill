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

export async function runDemo(scenario: DemoScenario = "happy"): Promise<void> {
  const provider = new ethers.JsonRpcProvider(requireEnv("PHAROS_RPC_URL"));
  const agentAWallet = new ethers.Wallet(requireEnv("DEMO_AGENT_A_KEY"), provider);
  const agentBWallet = new ethers.Wallet(requireEnv("DEMO_AGENT_B_KEY"), provider);
  const engineAddress = requireEnv("PACT_ENGINE_ADDRESS");
  const arbiterUrl = process.env.NEXT_PUBLIC_ARBITER_URL ?? process.env.ARBITER_URL ?? "http://localhost:3001";

  const agentAClient = new PactClient(provider, agentAWallet, engineAddress, arbiterUrl);
  const agentBClient = new PactClient(provider, agentBWallet, engineAddress, arbiterUrl);
  const agentB = new AgentB(agentBClient);
  let cleanup: () => void = () => undefined;
  const agentA = new AgentA(agentAClient, agentBWallet.address, (pactId) => {
    cleanup();
    cleanup = agentB.watchAndLog(pactId);
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

  await new Promise((resolve) => setTimeout(resolve, 3500));
  const finalStatus = await agentAClient.getPact(pactId);
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
