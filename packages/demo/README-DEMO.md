# PactNet Live Demo

This folder contains the terminal scripts used for the PactNet live demo on Pharos testnet.

The default judging path does **not** require an Anthropic API key. If `ANTHROPIC_API_KEY` is missing or empty, the arbiter uses **Deterministic Arbiter Mode**. Claude mode remains available when an Anthropic key is provided.

## Prerequisites

- Funded demo wallets for Agent A and Agent B on Pharos testnet.
- Arbiter service running on `http://localhost:3001`.
- Deployed contract addresses in `.env`:
  - `PACT_ENGINE_ADDRESS`
  - `REPUTATION_NFT_ADDRESS`
  - `ARBITER_REGISTRY_ADDRESS`
- Demo wallet keys in `.env`:
  - `DEMO_AGENT_A_KEY`
  - `DEMO_AGENT_B_KEY`
- Arbiter signing configuration:
  - `ARBITER_PRIVATE_KEY`
  - `ARBITER_PUBLIC_KEY`
- Pharos RPC configuration:
  - `PHAROS_RPC_URL`
  - `PHAROS_CHAIN_ID`

Optional:

- `ANTHROPIC_API_KEY`
- `DEMO_SPEED`

## Start The Arbiter

From the repo root:

```powershell
cd "C:\Users\USER\Desktop\5th Skill"
$env:COREPACK_HOME = Join-Path (Get-Location) ".corepack"
$env:ANTHROPIC_API_KEY = ""
corepack pnpm --filter @pactnet/arbiter run build
node packages/arbiter/dist/index.js
```

Check health:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

Expected:

```text
ok: true
chainConnected: true
arbiterMode: Deterministic Arbiter Mode
```

## Run The Short Happy-Path Demo

In a second PowerShell window:

```powershell
cd "C:\Users\USER\Desktop\5th Skill"
$env:COREPACK_HOME = Join-Path (Get-Location) ".corepack"
$env:ANTHROPIC_API_KEY = ""
corepack pnpm demo:happy
```

What judges see:

- Agent A creates a real pact on Pharos.
- Agent B watches state transitions.
- Agent A submits fibonacci evidence.
- Deterministic Arbiter Mode returns a fulfilled verdict.
- `PactEngine` settles the pact.
- Final table shows `Fulfilled`, confidence, and bond outcome.

## Run The Breach Demo

```powershell
cd "C:\Users\USER\Desktop\5th Skill"
$env:COREPACK_HOME = Join-Path (Get-Location) ".corepack"
$env:ANTHROPIC_API_KEY = ""
corepack pnpm demo:breach
```

What judges see:

- Agent A creates a real pact on Pharos.
- The script waits past the deadline.
- Agent A submits `TIMEOUT` evidence.
- Deterministic Arbiter Mode returns a breached verdict.
- `PactEngine` slashes the bond.
- Final table shows `Breached`, confidence, and bond outcome.

## Optional Stage Runner

The scripted presentation runner is available:

```powershell
corepack pnpm --filter @pactnet/demo run demo:live
```

Run faster:

```powershell
$env:DEMO_SPEED = "2"
corepack pnpm --filter @pactnet/demo run demo:live
```

The short `demo:happy` and `demo:breach` commands are recommended for judging because they are concise and use the real SDK flow directly.

## Deployed Addresses

- `PactEngine`: `0x8cB1a452A2fAC00F71110bc303453d416b521Cdb`
- `ReputationNFT`: `0x19807b9CBe1E1e766BC10C6d101A746D2728430B`
- `ArbiterRegistry`: `0xC71e59D7cCE0895D8eDa7c2F613F676F79b5952f`
- Registered arbiter signer: `0x8534B350B98dc0D60c8a5102637675Fe3b020700`

## Troubleshooting

If `pnpm` is not available:

```powershell
$env:COREPACK_HOME = Join-Path (Get-Location) ".corepack"
corepack pnpm --version
```

If port `3001` is already in use, the arbiter is probably already running. Do not start another copy; run the demo command in a new terminal.

If the arbiter times out while settling, wait for the command to finish. The SDK uses longer settlement timeouts and recovers stored verdicts from `/arbiter/pact/:id` when possible.

If a transaction fails:

- Confirm `DEMO_AGENT_A_KEY` is funded.
- Confirm `DEMO_AGENT_A_KEY` and `DEMO_AGENT_B_KEY` are different wallets.
- Confirm `PACT_ENGINE_ADDRESS` is the deployed Pharos testnet contract.
- Confirm the arbiter health endpoint reports `chainConnected: true`.

If deterministic mode is expected but Claude is mentioned in logs, confirm the shell has:

```powershell
$env:ANTHROPIC_API_KEY = ""
```
