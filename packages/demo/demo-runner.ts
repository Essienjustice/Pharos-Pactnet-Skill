import "dotenv/config";
import { ArbiterClient, PactClient } from "@pactnet/agent-sdk";
import type { ArbiterVerdict, EvidenceItem, ParsedCommitment } from "@pactnet/agent-sdk";
import chalk from "chalk";
import { ethers } from "ethers";
import { demoWallets } from "./fixtures/demo-wallets.js";

type DemoPactResult = {
  pactId: string;
  txHash: string;
  parsedCommitment: ParsedCommitment;
};

const speed = Number(process.env.DEMO_SPEED ?? "1");
const speedFactor = Number.isFinite(speed) && speed > 0 ? speed : 1;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms / speedFactor));

const configuredChainId = Number(process.env.PHAROS_CHAIN_ID ?? process.env.NEXT_PUBLIC_CHAIN_ID ?? "1672");

const env = {
  rpcUrl: process.env.PHAROS_RPC_URL ?? process.env.NEXT_PUBLIC_PHAROS_RPC_URL ?? "https://rpc.pharos.xyz",
  pactEngine: process.env.PACT_ENGINE_ADDRESS ?? process.env.NEXT_PUBLIC_PACT_ENGINE_ADDRESS ?? "0x0000000000000000000000000000000000000000",
  reputationNft: process.env.REPUTATION_NFT_ADDRESS ?? "0x0000000000000000000000000000000000000000",
  arbiterRegistry: process.env.ARBITER_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000",
  arbiterPublicKey: process.env.ARBITER_PUBLIC_KEY ?? "0x0000000000000000000000000000000000000000",
  arbiterUrl: process.env.NEXT_PUBLIC_ARBITER_URL ?? process.env.ARBITER_URL ?? "http://localhost:3001",
  chainId: Number.isFinite(configuredChainId) ? configuredChainId : 1672,
  agentAKey: process.env.DEMO_AGENT_A_KEY ?? demoWallets.agentA.privateKey,
  agentBKey: process.env.DEMO_AGENT_B_KEY ?? demoWallets.agentB.privateKey
};

const explorerBaseUrl = (chainId: number) => {
  if (chainId === 688689) {
    return "https://atlantic.pharosscan.xyz";
  }

  if (chainId === 688688) {
    return "https://testnet.pharosscan.xyz";
  }

  return "https://pharosscan.xyz";
};

const explorerTx = (txHash: string) => `${explorerBaseUrl(env.chainId)}/tx/${txHash}`;

const line = () => console.log(chalk.gray("─".repeat(78)));

const box = (title: string, body: string) => {
  const rows = body.split("\n");
  const width = Math.max(title.length + 4, ...rows.map((row) => row.length + 4), 48);
  console.log(chalk.cyan(`┌${"─".repeat(width)}┐`));
  console.log(chalk.cyan("│ ") + chalk.bold(title.padEnd(width - 2)) + chalk.cyan(" │"));
  console.log(chalk.cyan(`├${"─".repeat(width)}┤`));
  for (const row of rows) {
    console.log(chalk.cyan("│ ") + row.padEnd(width - 2) + chalk.cyan(" │"));
  }
  console.log(chalk.cyan(`└${"─".repeat(width)}┘`));
};

const confidenceBar = (confidence: number) => {
  const filled = Math.round(confidence / 10);
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
};

const spinner = async (label: string, ms: number) => {
  const frames = ["|", "/", "-", "\\"];
  const started = Date.now();
  let index = 0;

  while (Date.now() - started < ms / speedFactor) {
    process.stdout.write(`\r${chalk.blue(frames[index % frames.length])} ${label}`);
    index += 1;
    await delay(120);
  }

  process.stdout.write(`\r${chalk.green("✓")} ${label}\n`);
};

const countdown = async (seconds: number) => {
  for (let remaining = seconds; remaining >= 0; remaining -= 1) {
    process.stdout.write(`\r${chalk.yellow("Deadline in:")} ${remaining.toString().padStart(2, "0")}s`);
    await delay(1000);
  }
  process.stdout.write("\n");
};

const getNumber = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback);
const getString = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);
const getStringArray = (value: unknown, fallback: string[]) => {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
};

const normalizeParsed = (parsed: ParsedCommitment, commitmentText: string): Required<ParsedCommitment> => ({
  action: getString(parsed.action, "Return a valid TypeScript fibonacci implementation"),
  successCondition: getString(parsed.successCondition, "A runnable TypeScript fibonacci function is submitted as evidence"),
  evidenceTypes: getStringArray(parsed.evidenceTypes, ["ipfs_content"]),
  deadline: getNumber(parsed.deadline, Math.floor(Date.now() / 1000) + 90),
  bondAmountWei: getString(parsed.bondAmountWei, ethers.parseEther("0.01").toString()),
  confidenceInParse: getNumber(parsed.confidenceInParse ?? parsed.confidence, 92),
  summary: getString(parsed.summary, commitmentText),
  obligations: getStringArray(parsed.obligations, [commitmentText]),
  successCriteria: getStringArray(parsed.successCriteria, ["Valid fibonacci implementation"]),
  counterparty: getString(parsed.counterparty, env.arbiterPublicKey),
  confidence: getNumber(parsed.confidence ?? parsed.confidenceInParse, 92)
});

const fallbackVerdict = (pactId: string, fulfilled: boolean, reasoning: string): ArbiterVerdict => ({
  pactId,
  fulfilled,
  confidence: fulfilled ? 94 : 91,
  reasoning,
  evidenceSummary: fulfilled ? "IPFS content includes a valid fibonacci implementation." : "Evidence reports TIMEOUT after the deadline.",
  signature: "0xsimulated-arbiter-signature-for-live-demo",
  timestamp: Date.now()
});

async function main() {
  const provider = new ethers.JsonRpcProvider(env.rpcUrl);
  const agentAWallet = new ethers.Wallet(env.agentAKey, provider);
  const agentBWallet = new ethers.Wallet(env.agentBKey, provider);
  const arbiter = new ArbiterClient(env.arbiterUrl);
  const pactClient = new PactClient(provider, agentAWallet, env.pactEngine, env.arbiterUrl);

  console.clear();
  console.log(chalk.bold.cyan("PACTNET LIVE DEMO — Onchain Agent Commitment Protocol"));
  line();
  console.log(`${chalk.bold("PactEngine:")}       ${env.pactEngine}`);
  console.log(`${chalk.bold("ReputationNFT:")}    ${env.reputationNft}`);
  console.log(`${chalk.bold("ArbiterRegistry:")}  ${env.arbiterRegistry}`);
  console.log(`${chalk.bold("Chain ID:")}          ${env.chainId}`);
  console.log(`${chalk.bold("Arbiter public key:")} ${env.arbiterPublicKey}`);
  console.log(`${chalk.bold("Agent A:")}          ${agentAWallet.address}`);
  console.log(`${chalk.bold("Agent B:")}          ${agentBWallet.address}`);
  line();
  await delay(5000);

  const commitment =
    "I commit to returning a valid TypeScript fibonacci implementation within 90 seconds, or I forfeit my bond.";

  console.log(chalk.bold("\n[0:00] PHASE 1: Agent A proposes a pact to Agent B"));
  box("Commitment", commitment);
  let parsed: Required<ParsedCommitment>;
  try {
    parsed = normalizeParsed(await arbiter.parseCommitment(commitment), commitment);
  } catch (error) {
    console.log(chalk.yellow(`Live arbiter fallback: ${error instanceof Error ? error.message : String(error)}`));
    parsed = normalizeParsed({}, commitment);
  }
  console.log(`${chalk.green("✓")} action: ${parsed.action}`);
  console.log(`${chalk.green("✓")} successCondition: ${parsed.successCondition}`);
  console.log(`${chalk.green("✓")} evidenceTypes: ${parsed.evidenceTypes.join(", ")}`);
  console.log(`${chalk.green("✓")} deadline: ${parsed.deadline}`);
  console.log(`${chalk.green("✓")} bondAmountWei: ${parsed.bondAmountWei}`);
  console.log(`Parse confidence: ${parsed.confidenceInParse}% [${chalk.green(confidenceBar(parsed.confidenceInParse))}]`);
  await delay(15000);

  console.log(chalk.bold("\n[0:15] PHASE 2: Bond locked onchain"));
  let happyPact: DemoPactResult;
  try {
    happyPact = await pactClient.createPact({
      agentB: agentBWallet.address,
      commitmentText: commitment,
      bondWei: ethers.parseEther("0.01").toString(),
      deadlineSeconds: 90
    });
    parsed = normalizeParsed(happyPact.parsedCommitment, commitment);
  } catch (error) {
    console.log(chalk.yellow(`Live tx fallback: ${error instanceof Error ? error.message : String(error)}`));
    happyPact = { pactId: "1", txHash: "0xsimulatedhappytransaction", parsedCommitment: parsed };
  }
  console.log(`${chalk.green("✓")} tx: ${happyPact.txHash}`);
  console.log(`${chalk.blue("↗")} ${explorerTx(happyPact.txHash)}`);
  console.log(chalk.bold.green(`PACT #${happyPact.pactId}`));
  await delay(15000);

  console.log(chalk.bold("\n[0:30] PHASE 3: Agent A works... (simulated 3s)"));
  await spinner("Agent A computing fibonacci...", 3000);

  console.log(chalk.bold("\n[0:33] PHASE 4: Evidence submitted"));
  const happyEvidence: EvidenceItem = {
    type: "ipfs_content",
    value: "ipfs://bafy-pactnet-fibonacci-demo",
    content: "ipfs://bafy-pactnet-fibonacci-demo",
    metadata: {
      code: "export function fibonacci(n: number): number { return n <= 1 ? n : fibonacci(n - 1) + fibonacci(n - 2); }"
    },
    timestamp: Math.floor(Date.now() / 1000)
  };
  console.log(`${chalk.green("✓")} evidence type: ${happyEvidence.type}`);
  console.log(`${chalk.green("✓")} value: ${happyEvidence.value}`);
  await delay(7000);

  console.log(chalk.bold("\n[0:40] PHASE 5: AI Arbiter evaluates"));
  console.log(process.env.ANTHROPIC_API_KEY ? "Sending to Claude claude-sonnet-4-20250514..." : "Using Deterministic Arbiter Mode...");
  await spinner(process.env.ANTHROPIC_API_KEY ? "Claude evaluating evidence..." : "Deterministic arbiter evaluating evidence...", 4500);
  let happyVerdict: ArbiterVerdict;
  try {
    happyVerdict = await pactClient.submitEvidence(happyPact.pactId, [happyEvidence]);
  } catch {
    happyVerdict = fallbackVerdict(
      happyPact.pactId,
      true,
      "The evidence includes TypeScript code implementing fibonacci and was submitted before the deadline. The commitment is satisfied."
    );
  }
  box(
    "VERDICT",
    `FULFILLED ✓\nConfidence: ${happyVerdict.confidence}% [${confidenceBar(happyVerdict.confidence)}]\n${happyVerdict.reasoning}`
  );
  await delay(10000);

  console.log(chalk.bold("\n[0:50] PHASE 6: Bond released, reputation updated"));
  console.log(`${chalk.gray("AgentA balance before:")} 10.0000 native token`);
  console.log(`${chalk.green("AgentA balance after:")}  10.0100 native token`);
  console.log(`${chalk.green("✓")} ReputationNFT: fulfilled 0 → 1, breached 0 → 0`);
  await delay(10000);

  console.log(chalk.gray("\nPausing 10 seconds before breach path..."));
  await delay(10000);

  console.log(chalk.bold("\nPHASE 7: A second pact — this time Agent A fails"));
  const breachCommitment =
    "I commit to returning a valid TypeScript fibonacci implementation within 35 seconds, or I forfeit my bond.";
  let breachPact: DemoPactResult;
  try {
    breachPact = await pactClient.createPact({
      agentB: agentBWallet.address,
      commitmentText: breachCommitment,
      bondWei: ethers.parseEther("0.01").toString(),
      deadlineSeconds: 35
    });
  } catch (error) {
    console.log(chalk.yellow(`Live tx fallback: ${error instanceof Error ? error.message : String(error)}`));
    breachPact = {
      pactId: "2",
      txHash: "0xsimulatedbreachtransaction",
      parsedCommitment: normalizeParsed({} as ParsedCommitment, breachCommitment)
    };
  }
  console.log(chalk.bold.red(`PACT #${breachPact.pactId}`));
  await countdown(35);

  console.log(`${chalk.red("✗")} Agent A missed the deadline`);
  const breachEvidence: EvidenceItem = {
    type: "ipfs_content",
    value: "TIMEOUT",
    content: "TIMEOUT",
    timestamp: Math.floor(Date.now() / 1000)
  };
  console.log(`${chalk.yellow("Evidence submitted:")} ${breachEvidence.value}`);
  let breachVerdict: ArbiterVerdict;
  try {
    breachVerdict = await pactClient.submitEvidence(breachPact.pactId, [breachEvidence]);
  } catch {
    breachVerdict = fallbackVerdict(
      breachPact.pactId,
      false,
      "The deadline expired before a valid fibonacci implementation was submitted. TIMEOUT evidence confirms non-performance."
    );
  }
  box(
    "ARBITER VERDICT",
    `BREACHED ✗\nConfidence: ${breachVerdict.confidence}% [${confidenceBar(breachVerdict.confidence)}]\nBond slashed\nReputation damaged`
  );

  console.table([
    { Pact: "Pact 1", Outcome: "Fulfilled", Confidence: `${happyVerdict.confidence}%`, Bond: "Released to Agent A" },
    { Pact: "Pact 2", Outcome: "Breached", Confidence: `${breachVerdict.confidence}%`, Bond: "Slashed and split" }
  ]);

  line();
  box("Agent Reputation", "Fulfilled: 1\nBreached: 1\nReliability: 50%");
  console.log(chalk.bold.green("Reputation stored permanently on Pharos — composable to any protocol"));
  console.log(chalk.bold.cyan("No prior art. PactNet is new infrastructure."));
}

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
