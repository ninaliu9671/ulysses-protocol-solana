# Ulysses Watcher

Node.js monitoring service for the Ulysses Protocol.

## How it works
1. Helius webhook receives SPL token transfer events
2. Checks if the recipient has an active StakeInfo commitment for that mint
3. If violation detected → calls `slash()` on-chain
4. Fallback patrol loop (every 60s) scans active stakes directly

## Setup
```bash
cp .env.example .env
# Fill in HELIUS_API_KEY, WATCHER_KEYPAIR_PATH, PROGRAM_ID
npm install
npm start
```

## Status
**Day 2 task** — currently contains EVM skeleton (reference/watcher-evm/index.js).
Needs: replace ethers.js → @solana/web3.js, replace EVM addresses → Solana pubkeys,
register Helius webhook for active stake addresses.
