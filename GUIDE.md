# QONE Bridge: HyperEVM <-> Ethereum — Deployment Guide

## Architecture Overview

```
  HyperEVM                                        Ethereum
┌──────────────────────┐                   ┌──────────────────────┐
│  QONE Token (ERC-20) │                   │                      │
│  0x1E3699...B698DB   │                   │   QONEOFT            │
│                      │                   │   (mint/burn ERC-20) │
│  QONEOFTAdapter      │◄── LayerZero ──►  │                      │
│  (lock/unlock)       │    Messaging      │                      │
└──────────────────────┘                   └──────────────────────┘
```

**How it works:**
- **HyperEVM → Ethereum:** User approves + sends QONE to the adapter. The adapter locks the tokens and sends a LayerZero message. On Ethereum, the QONEOFT contract mints the same amount.
- **Ethereum → HyperEVM:** User calls `send()` on QONEOFT. It burns the tokens and sends a LayerZero message. On HyperEVM, the adapter unlocks tokens to the recipient.

---

## Hardcoded Addresses

All addresses are baked into the contracts — no constructor arguments needed.

| Item | Value |
|------|-------|
| Owner | `0xb2A1dc0DB510E268B645387e852061ce22E2e7aa` |
| QONE Token (HyperEVM) | `0x1E369922D78db967B009D4a21CC04c0881B698DB` |
| LayerZero EndpointV2 (HyperEVM) | `0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9` |
| LayerZero EndpointV2 (Ethereum) | `0x1a44076050125825900e736c501f859c50fE728c` |
| HyperEVM Endpoint ID (eid) | `30367` |
| Ethereum Endpoint ID (eid) | `30101` |

---

## Prerequisites

1. **Foundry** installed (`forge`, `cast`)
2. **Node.js** (v18+) and **npm**
3. **MetaMask** browser extension with funded wallets on both HyperEVM and Ethereum
4. **HyperEVM deployer account must be activated on HyperCore** (at least $1 in USDC or HYPE received on HyperCore)

---

## Step 0: Build the Contracts

```bash
forge build
```

---

## Step 1: Deploy via the Web App

The `app/` directory contains a Vite + TypeScript deployer that uses MetaMask. It handles big-block switching on HyperEVM automatically.

```bash
cd app
npm install
npm run dev
```

Open the URL shown in the terminal, then:

1. **Connect MetaMask** — click the button to connect your wallet.
2. **Deploy QONEOFTAdapter** — the app switches to big blocks, deploys on HyperEVM, and restores small blocks.
3. **Deploy QONEOFT** — the app switches MetaMask to Ethereum and deploys.

Both deployed addresses are shown on screen after each deployment.

> **Alternative (CLI):** If you prefer deploying from the command line, see the [CLI Deploy](#cli-deploy) section below.

---

## Step 2: Set Peers

Each contract must know its counterpart on the other chain.

### 2a. On HyperEVM — point adapter to the Ethereum OFT

```bash
cast send $ADAPTER_HYPEREVM_ADDRESS \
    "setPeer(uint32,bytes32)" \
    30101 \
    $(cast --to-bytes32 $QONEOFT_ETH_ADDRESS) \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

### 2b. On Ethereum — point OFT to the HyperEVM adapter

```bash
cast send $QONEOFT_ETH_ADDRESS \
    "setPeer(uint32,bytes32)" \
    30367 \
    $(cast --to-bytes32 $ADAPTER_HYPEREVM_ADDRESS) \
    --rpc-url $ETHEREUM_RPC_URL \
    --private-key $PRIVATE_KEY
```

---

## Step 3: Set Enforced Options

Enforced options guarantee enough gas for `_lzReceive` on the destination. Without them, `send()` reverts.

The options bytes below allocate **80 000 gas** (`0x13880`) for `lzReceive` (msgType 1 = SEND).

### 3a. On HyperEVM adapter (messages → Ethereum)

```bash
cast send $ADAPTER_HYPEREVM_ADDRESS \
    "setEnforcedOptions((uint32,uint16,bytes)[])" \
    "[(30101,1,0x00030100110100000000000000000000000000013880)]" \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

### 3b. On Ethereum OFT (messages → HyperEVM)

```bash
cast send $QONEOFT_ETH_ADDRESS \
    "setEnforcedOptions((uint32,uint16,bytes)[])" \
    "[(30367,1,0x00030100110100000000000000000000000000013880)]" \
    --rpc-url $ETHEREUM_RPC_URL \
    --private-key $PRIVATE_KEY
```

> 80 000 gas is a starting point. Profile actual `_lzReceive` usage and adjust with a safety margin.

---

## Step 4: (Optional) Configure DVNs and Libraries

LayerZero uses its default DVN/library config by default. For production you may want to customize:

- **Check defaults:** [LayerZero Scan Default Checker](https://layerzeroscan.com/tools/defaults?version=V2)
- **Custom libraries:** Call `setSendLibrary` / `setReceiveLibrary` on the Endpoint. See [LZ deployed contracts](https://docs.layerzero.network/v2/deployments/chains/hyperliquid).
- **Custom DVN config:** Call `setConfig` on the Endpoint. See [LZ OFT Quickstart](https://docs.layerzero.network/contracts/oft-adapter).

---

## Step 5: Test a Bridge Transfer

### HyperEVM → Ethereum

1. **Approve** the adapter:

```bash
cast send 0x1E369922D78db967B009D4a21CC04c0881B698DB \
    "approve(address,uint256)" \
    $ADAPTER_HYPEREVM_ADDRESS \
    1000000000000000000 \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

2. **Quote** the fee:

```bash
cast call $ADAPTER_HYPEREVM_ADDRESS \
    "quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool)" \
    "(30101,$(cast --to-bytes32 $RECIPIENT_ADDRESS),1000000000000000000,950000000000000000,0x,0x,0x)" \
    false \
    --rpc-url https://rpc.hyperliquid.xyz/evm
```

3. **Send** (attach the quoted fee as `msg.value`):

```bash
cast send $ADAPTER_HYPEREVM_ADDRESS \
    "send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address)" \
    "(30101,$(cast --to-bytes32 $RECIPIENT_ADDRESS),1000000000000000000,950000000000000000,0x,0x,0x)" \
    "($QUOTED_NATIVE_FEE,0)" \
    $REFUND_ADDRESS \
    --value $QUOTED_NATIVE_FEE \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

### Ethereum → HyperEVM

Same pattern on the QONEOFT contract with `dstEid = 30367`.

---

## Step 6: Track Your Transaction

Paste your source tx hash on [LayerZero Scan](https://layerzeroscan.com/) to track delivery.

---

## CLI Deploy

If you prefer deploying without the web app:

### 1. Switch to big blocks

```bash
npx @layerzerolabs/hyperliquid-composer set-block \
    --size big --network mainnet --log-level verbose \
    --private-key $PRIVATE_KEY
```

### 2. Deploy QONEOFTAdapter on HyperEVM

```bash
BYTECODE=$(jq -r '.bytecode.object' out/QONEOFTAdapter.sol/QONEOFTAdapter.json)

cast send --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY \
    --create "$BYTECODE"
```

### 3. Switch back to small blocks

```bash
npx @layerzerolabs/hyperliquid-composer set-block \
    --size small --network mainnet --log-level verbose \
    --private-key $PRIVATE_KEY
```

### 4. Deploy QONEOFT on Ethereum

```bash
BYTECODE=$(jq -r '.bytecode.object' out/QONEOFT.sol/QONEOFT.json)

cast send --rpc-url $ETHEREUM_RPC_URL \
    --private-key $PRIVATE_KEY \
    --create "$BYTECODE"
```

---

## LI.FI Integration

Once the bridge is live:

1. Register your OFT bridge via the [LI.FI partner form](https://li.fi/) or Discord.
2. Users discover your route through the LI.FI SDK/API — no extra contracts needed.
3. Embed the [LI.FI Widget](https://docs.li.fi/integrate-li.fi-widget/li.fi-widget) for one-click bridging.

---

## Security Checklist

- [ ] `setPeer` called on **both** contracts (bidirectional)
- [ ] Enforced options set on **both** contracts
- [ ] Test with a small amount first
- [ ] Verify delivery on [LayerZero Scan](https://layerzeroscan.com/)
- [ ] Only ONE OFTAdapter exists globally (multiple adapters break unified liquidity)
- [ ] Owner keys are secured (owner can reconfigure peers and options)
