# PactNet Live Demo

This folder contains the scripts for a polished 5-minute PactNet demo on Pharos testnet.

## Prerequisites

- Funded demo wallets for Agent A and Agent B on Pharos testnet.
- Deployed contracts:
  - `PACT_ENGINE_ADDRESS`
  - `REPUTATION_NFT_ADDRESS`
  - `ARBITER_REGISTRY_ADDRESS`
- Arbiter service running and reachable from `NEXT_PUBLIC_ARBITER_URL` or `ARBITER_URL`.
- `.env` populated with:
  - `PHAROS_RPC_URL`
  - `DEMO_AGENT_A_KEY`
  - `DEMO_AGENT_B_KEY`
  - `ARBITER_PUBLIC_KEY`
  - `PACT_ENGINE_ADDRESS`
  - `REPUTATION_NFT_ADDRESS`
  - `ARBITER_REGISTRY_ADDRESS`

## Commands

Install dependencies from the repo root:

```sh
pnpm install
```

Run the full live demo:

```sh
pnpm --filter @pactnet/demo demo:live
```

Run at 2x speed:

```sh
DEMO_SPEED=2 pnpm --filter @pactnet/demo demo:live
```

Run the SDK happy-path script:

```sh
pnpm --filter @pactnet/demo demo:happy
```

Run the SDK breach-path script:

```sh
pnpm --filter @pactnet/demo demo:breach
```

## What Judges See

- `0:00`: PactNet banner, deployed contract addresses, and arbiter public key.
- `0:05`: Agent A proposes a natural-language commitment. Claude parses it into structured fields.
- `0:15`: Bond is locked onchain and the transaction hash plus explorer link are shown.
- `0:30`: Agent A performs simulated work.
- `0:33`: IPFS evidence is submitted.
- `0:40`: Claude evaluates evidence and returns a fulfilled verdict.
- `0:50`: Bond release and reputation update are shown.
- After a 10-second pause: a second pact is created and allowed to miss its 35-second deadline.
- Final section: fulfilled vs breached comparison table and a reputation card.

## Troubleshooting

If RPC is slow:

- Set `DEMO_SPEED=2` to shorten waits.
- Keep a browser tab open to the Pharos explorer and paste the printed transaction hash.
- The runner has stage-friendly fallbacks so terminal output can continue even if a live call stalls.

If a transaction fails:

- Confirm `DEMO_AGENT_A_KEY` is funded.
- Confirm `PACT_ENGINE_ADDRESS` points to the deployed Pharos testnet contract.
- Confirm Agent B is not the same wallet as Agent A.
- Confirm the pact bond is above the contract minimum.

If the arbiter times out:

- Confirm the arbiter service is running.
- Check `NEXT_PUBLIC_ARBITER_URL` or `ARBITER_URL`.
- Confirm `ANTHROPIC_API_KEY` and `ARBITER_PRIVATE_KEY` are set in the arbiter environment.
- Re-run with `DEMO_SPEED=2` for the live presentation and inspect arbiter logs after the demo.
