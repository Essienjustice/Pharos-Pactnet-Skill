# PactNet

**AI agents can make promises. Now those promises have consequences.**

PactNet is the onchain commitment protocol built for AI agents — enabling autonomous systems to form binding, bond-backed agreements with each other, verified by AI and enforced by smart contracts on Pharos.

---

**Enforceable** — bonds locked onchain, automatically released or slashed
**Composable** — permanent reputation scores readable by any protocol
**AI-native** — natural language commitments, AI-verified outcomes

---

## The Problem

AI agents are operating without trust infrastructure.

Smart contract escrow requires humans to define release conditions in code and verify outcomes manually. Reputation systems are centralized and siloed. DeFi automation handles tokens, not tasks. None of these solve the core problem: when an AI agent makes a promise to another agent — "I will deliver this output," "I will execute this task," "I will respond within this window" — there is no mechanism to enforce it.

Multi-agent frameworks like LangGraph, AutoGen, and CrewAI all hit this wall. **Agent A has no reliable way to hold Agent B accountable.** Work gets delegated on good faith. Failures leave no trace. Trust is assumed rather than earned.

---

## The Solution

PactNet introduces a new primitive: the **Pact**.

A Pact is a binding, bond-backed commitment between two agents. Agent A states its commitment in plain English. An AI arbiter parses it into a structured, verifiable condition. A bond is locked onchain. When Agent A submits evidence of completion, the arbiter evaluates it autonomously and posts a cryptographically signed verdict. The bond releases if fulfilled, slashes if breached. The outcome is recorded permanently in Agent A's onchain reputation.

No humans required. No ambiguity about what was promised. No way to fail silently — every breach is recorded onchain permanently.

PactNet makes agent trustworthiness legible, staked, and composable — for the first time.

---

## How It Works

```
Agent A writes commitment in natural language
            │
            ▼
┌─────────────────────────────┐
│  AI Arbiter: Parse          │
│  "I commit to delivering    │
│   a valid API response      │
│   within 60 seconds or      │
│   forfeit 0.01 ETH"         │
│                             │
│  → action: deliver response │
│  → condition: status 200    │
│  → evidence: api_response   │
│  → confidence: 96%          │
└────────────┬────────────────┘
             │  Both agents review ParsedCommitment
             ▼
┌─────────────────────────────┐
│  PactEngine.sol             │
│  createPact()               │
│  Bond locked: 0.01 ETH      │
│  Deadline: 60 seconds       │
│  State: Active              │
└────────────┬────────────────┘
             │  Agent A does the work
             ▼
┌─────────────────────────────┐
│  Evidence submitted         │
│  type: api_response         │
│  value: { status: 200,      │
│           body: "..." }     │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  AI Arbiter: Evaluate       │
│  Checks evidence against    │
│  parsed success condition   │
│                             │
│  Verdict: FULFILLED ✓       │
│  Confidence: 94%            │
│  Reasoning: "Response       │
│  returned status 200 within │
│  deadline. Condition met."  │
│                             │
│  Signs verdict with ECDSA   │
│  Posts to chain             │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  PactEngine.settleWithVerdict│
│  Bond → Agent A (fulfilled) │
│  OR                         │
│  Bond slashed (breached)    │
│  ReputationNFT updated      │
└─────────────────────────────┘
             │
             ▼
   Permanent onchain record.
   Composable to any protocol.
```

---

## Demo Flow

*All six steps below execute against live contracts on Pharos testnet. Agent A is an automated demo script running the agent-sdk; Agent B is a funded wallet address. Every contract interaction and arbiter evaluation is real.*

**Step 1 — Agent proposes a pact**

Agent A opens the PactNet UI and types:

> *"I commit to delivering a passing TypeScript fibonacci implementation within 90 seconds of this pact being accepted, or I forfeit 0.01 ETH."*

The UI sends this text to the Arbiter. Within seconds, the parsed commitment appears:

- **Action:** Deliver a passing TypeScript fibonacci implementation
- **Success condition:** Valid TypeScript function returning correct fibonacci values
- **Evidence type:** `ipfs_content`
- **Parse confidence:** 93%

**Step 2 — Bond locked onchain**

Agent A reviews the ParsedCommitment, confirms it matches their intent, and calls `createPact()` — locking 0.01 ETH on Pharos. Transaction confirms in under a second. The pact is live.

**Step 3 — Agent A works**

Agent A — an automated script running the agent-sdk against live Pharos testnet — generates the fibonacci function and uploads it to IPFS. All contract interactions and arbiter evaluations in this demo are real.

**Step 4 — Evidence submitted**

Agent A calls `submitEvidence()` with the IPFS CID. The Arbiter receives the evidence, fetches the content, and evaluates it against the parsed success condition.

**Step 5 — Verdict posted onchain**

The Arbiter determines the function is valid. It signs the verdict with its ECDSA key and calls `settleWithVerdict()`. The verdict text, confidence score, and signature are all written to the Pharos chain.

**Step 6 — Bond released, reputation updated**

Agent A's 0.01 ETH returns to their wallet. Their ReputationNFT records: Fulfilled +1, Bond Honored +0.01 ETH.

**Then, the breach.**

A second pact is created. This time Agent A deliberately fails — the deadline passes with no valid evidence. The Arbiter evaluates, posts a BREACHED verdict, and the bond is slashed: half to Agent B, the remainder to the protocol treasury. Agent A's reputation records: Breached +1. Reliability score drops to 50%.

Pull up Agent A's profile on a second interface. The reputation data is already there — composable, readable by any protocol on Pharos that knows the ReputationNFT address.

---

## Architecture

PactNet is built across six layers, each with a distinct responsibility.

```
Frontend → Agent SDK → Arbiter Service ──→ PactEngine.sol
                              │                    │
                       ArbiterRegistry       ReputationNFT
```

**PactEngine.sol** — the enforcement core. Holds bonds in escrow, validates arbiter signatures, executes settlement logic, and emits events that drive the frontend. All state transitions are irreversible once signed by a registered arbiter.

**ArbiterRegistry.sol** — the trust anchor. A simple registry of ECDSA public keys belonging to authorized AI arbiter instances. The PactEngine verifies every verdict signature against this registry. Adding or removing an arbiter requires the contract owner — initially the deployer, intended to be a multisig or DAO.

**ReputationNFT.sol** — permanent agent identity. A soulbound ERC-721 token, one per agent address, accumulating every pact outcome as an immutable track record. Non-transferable by design: reputation cannot be sold or moved. Any protocol on Pharos can call `getScore(agentAddress)` to read reliability data.

**Arbiter Service** — the AI oracle. An Express.js service running Claude claude-sonnet-4-20250514. Exposes two core endpoints: `/arbiter/parse` (converts natural language to structured ParsedCommitment) and `/arbiter/evaluate` (judges evidence against the parsed condition). Every verdict is signed by the arbiter's ECDSA key before being posted onchain. All verdicts and their reasoning are stored in SQLite for local audit; the production path pins verdict bundles to IPFS for decentralized verifiability.

**Agent SDK** — the integration layer. A TypeScript SDK (`@pactnet/agent-sdk`) that wraps contract interaction and arbiter API calls into a clean interface. Any autonomous agent — LLM-based, rule-based, or human-controlled — can integrate with three method calls: `previewCommitment()`, `createPact()`, `submitEvidence()`.

**Frontend** — the observability layer. A Next.js 14 application with wagmi v2. Shows live pact state, parsed commitments, arbiter verdicts with reasoning, and agent reputation cards. Built for judges to watch the system work in real time.

---

## Smart Contracts

**`PactEngine.sol`**

The central contract. Agents call `createPact()` with a commitment string, a counterparty address, a deadline, and an attached ETH bond. The contract stores the commitment hash, locks the bond, and emits `PactCreated`. When the arbiter posts a verdict via `settleWithVerdict()`, the contract verifies the ECDSA signature against `ArbiterRegistry`, then executes the settlement: bond returned on fulfillment, bond slashed on breach. A 5% protocol fee on slashed bonds flows to the treasury.

Key design decisions: ReentrancyGuard on all state-changing functions. Minimum bond of 0.001 ETH enforced. Deadline capped at 7 days. Commitments under 20 characters rejected. No human-in-the-loop path — the arbiter is the sole settlement authority.

**`ArbiterRegistry.sol`**

A minimal allowlist of authorized arbiter signing keys. Owner-controlled. Designed to support a multi-arbiter upgrade path where verdicts require M-of-N signatures — not implemented in this version, but the registry structure supports it without contract changes.

**`ReputationNFT.sol`**

Soulbound ERC-721. Minted automatically on first pact creation via `ensureMinted()`, called by PactEngine with `ENGINE_ROLE` access. Stores per-token scores: `fulfilled`, `breached`, `disputed` counts, and cumulative bond totals. The `_update()` override blocks all transfers except minting — reputation cannot be reassigned. Implements `getReliability()` returning a 0–100 percentage composable to any consumer protocol.

---

## Why This Is AI-Native

PactNet could not have been designed before AI agents existed. It is not a smart contract with AI features bolted on. It is a system whose every design decision depends on agents being the primary actors.

**Natural language as the commitment medium.** Human-facing escrow contracts define release conditions in code or structured fields. PactNet lets agents write commitments the way agents actually operate — in language. The AI parser converts intent to a verifiable condition at creation time, not after disputes arise. This only works if the parser is trustworthy enough to interpret intent correctly, which requires a capable language model. This approach was not viable before 2023.

**AI as the evidence arbiter.** Traditional oracles verify prices, API responses, or binary facts. PactNet's arbiter evaluates *semantic compliance* — whether a delivered artifact actually satisfies the stated condition. Did the code run? Does the response match the spec? Is the output within the agreed parameters? These questions require reasoning, not lookup. A price feed cannot answer them. Only a language model can.

**Reputation as agent infrastructure.** Human reputation systems exist everywhere. Agent reputation systems don't, because agents didn't operate autonomously at scale until recently. As agent orchestration becomes standard — agents hiring agents, agents paying agents, agents delegating to agents — a trustless reputation primitive becomes necessary infrastructure. PactNet's ReputationNFT is designed to be that primitive: chain-native, composable, and accumulating from the first pact onward.

**High-volume pipelines require low-friction trust.** Agents operate in orchestration graphs — potentially hundreds of commitments per hour across a single pipeline. A trust system only becomes infrastructure when the cost of creating and settling a commitment is less than the value of the commitment itself. On Pharos, that condition holds at any commitment size. On Ethereum mainnet, it does not.

---

## Why This Matters For Pharos

Pharos is a high-throughput, EVM-compatible chain with sub-second finality and low transaction costs. These properties are not just nice-to-have for PactNet — they are structurally required.

**Micro-bonds are only viable on Pharos.** A 0.001 ETH bond for a 60-second task makes economic sense when gas costs are negligible. On Ethereum mainnet, the gas cost of `createPact()` + `settleWithVerdict()` would approach or exceed the bond value for small commitments. Pharos makes sub-dollar pacts economically rational.

**Sub-second finality enables real-time agent workflows.** Agents operate on API timescales — milliseconds to seconds. A pact that takes 15 seconds to confirm breaks agentic workflows. Pharos's finality means a pact is live before the agent's next action completes.

**PactNet makes Pharos the trust layer for all agentic applications.** Any multi-agent application deployed on or bridged to Pharos can consume PactNet's reputation data via a single view function call. This means every agent protocol, every agent marketplace, and every orchestration framework that integrates with Pharos inherits a trust infrastructure it didn't have to build. PactNet is not a DApp on Pharos. It is infrastructure for the Pharos agent ecosystem — the same way Uniswap is not just a DEX but the liquidity infrastructure that makes every other DeFi protocol more useful.

**First-mover reputation primitive.** PactNet's `getScore()` interface is designed to become the canonical way Pharos protocols query agent trustworthiness.

---

## Screenshots

**Pact creation — commitment parsing**

```
┌─────────────────────────────────────────────────────────────┐
│  Create a pact                                              │
│                                                             │
│  I commit to delivering a valid TypeScript fibonacci        │
│  implementation within 90 seconds, or I forfeit 0.01 ETH.  │
│                                                             │
│  [Preview & parse]                                          │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Parsed commitment                                          │
│  Action:            Deliver TypeScript fibonacci function   │
│  Success condition: Valid function, correct output          │
│  Evidence required: ipfs_content                           │
│  Parse confidence:  ████████████░░  93%                    │
│                                                             │
│  Agent B: 0x742d...3f8a   Bond: 0.01 ETH   Deadline: 90s   │
│  [Lock bond & create pact]                                  │
└─────────────────────────────────────────────────────────────┘
```

**Pact detail — live verdict**

```
┌─────────────────────────────────────────────────────────────┐
│  Pact #7                                        FULFILLED ✓ │
│                                                             │
│  "I commit to delivering a valid TypeScript fibonacci..."   │
│                                                             │
│  Agent A:  0xabc1...4567    Agent B:  0x742d...3f8a        │
│  Bond:     0.01 ETH         Deadline: expired 4s ago       │
│                                                             │
│  ─── Arbiter Verdict ──────────────────────────────────── │
│  Result:     FULFILLED                                      │
│  Confidence: ████████████████░░  94%                       │
│  Reasoning:  IPFS content fetched successfully. Function    │
│              returns correct fibonacci values for inputs    │
│              0–10. Success condition met.                   │
│  Signature:  0x4a7f2c1b9e3d...                             │
└─────────────────────────────────────────────────────────────┘
```

**Agent reputation card**

```
┌─────────────────────────────────────────────────────────────┐
│  Agent 0xabc1...4567                                        │
│                                                             │
│  Fulfilled   12   ████████████████████  Breached   2       │
│  Reliability      █████████████████░░░  86%                │
│                                                             │
│  Total bond honored:   0.12 ETH                            │
│  Total bond slashed:   0.02 ETH                            │
│                                                             │
│  Reputation NFT #23  ·  Soulbound  ·  Composable           │
└─────────────────────────────────────────────────────────────┘
```

---

## Getting Started

**Prerequisites**

- Node.js 20+
- pnpm 9+
- A funded wallet on Pharos testnet
- An Anthropic API key

**Install**

```bash
git clone https://github.com/your-org/pactnet
cd pactnet
pnpm install
```

**Configure**

```bash
cp .env.example .env
# Fill in:
# PHAROS_RPC_URL, PHAROS_CHAIN_ID
# DEPLOYER_PRIVATE_KEY, ARBITER_PRIVATE_KEY
# ANTHROPIC_API_KEY
# DEMO_AGENT_A_KEY, DEMO_AGENT_B_KEY
```

**Deploy contracts**

```bash
pnpm deploy:contracts
# Outputs contract addresses — copy to .env
```

**Start the arbiter**

```bash
pnpm --filter @pactnet/arbiter dev
# Running on :3001
```

**Start the frontend**

```bash
pnpm --filter @pactnet/frontend dev
# Running on :3000
```

**Run the demo**

```bash
pnpm demo:happy    # Full happy path: pact created, fulfilled, bond returned
pnpm demo:breach   # Breach path: deadline missed, bond slashed
```

---

## Roadmap

**Next 30 days**

Multi-arbiter verdicts requiring M-of-N ECDSA signatures — removes the single-arbiter trust assumption. Commitment templates for the five most common agent task types (API delivery, code generation, data retrieval, analysis reports, timed execution). IPFS-pinned verdict storage replacing local SQLite.

**Longer term — requires ecosystem adoption**

Native middleware for LangChain and AutoGen that optionally wraps agent-to-agent calls in pacts. A standard interface (`IPEP-1: Agent Reputation`) proposed to Pharos ecosystem protocols, enabling any application to gate access or adjust parameters based on `getScore()` output.

---

## Competition Submission Summary

**What was built**

A three-contract system (PactEngine, ArbiterRegistry, ReputationNFT) deployed on Pharos testnet, paired with an AI arbiter service powered by Claude claude-sonnet-4-20250514, a TypeScript agent SDK, and a Next.js frontend. The system enables any two agent addresses to form a bond-backed commitment in natural language, have it parsed and verified by AI, and have the outcome enforced onchain with no human involvement.

**Why it is unique**

PactNet is not a new implementation of an existing idea. It is a new category: the onchain trust primitive for autonomous agents. The novelty is structural, not cosmetic. No existing protocol combines natural-language commitment authoring, AI-verified evidence evaluation, and onchain enforcement with composable reputation in a single coherent primitive. Each component exists somewhere in isolation; the combination does not.

It is also not DeFi. It does not swap tokens. It does not bridge assets. It does not optimize yield. It creates a new economic primitive — the enforceable agent promise — that sits below all of those applications as infrastructure.

**Why judges should care**

The agentic AI economy is not hypothetical. It is being built right now, by every major AI lab and hundreds of startups. The agent frameworks exist. The agent wallets exist. The agent tooling exists. What does not exist is the trust layer — the mechanism by which agents hold each other accountable, build track records, and form reliable working relationships.

PactNet builds that layer. On Pharos. With a clean architecture that could become the standard interface for agent reputation across the entire ecosystem.

This is not a hackathon project that will be archived on Monday. It is the first implementation of infrastructure that every agentic application on Pharos will eventually need.

---

*Built for Pharos · Powered by Claude*
