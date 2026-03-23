# QONE Bridge: HyperEVM <-> Ethereum — Deployment Guide

## Architecture Overview

```
  Ethereum                                        HyperEVM
┌──────────────────────┐                   ┌──────────────────────┐
│  DummyAuthorizer     │                   │  QONE Token (ERC-20) │
│  (PQC Phase 1)       │                   │  0x1E3699...B698DB   │
│                      │                   │                      │
│  QONE V2 (ERC-20)    │                   │  QONEOFTAdapter      │
│  (fixed supply + PQC)│◄── LayerZero ──►  │  (lock/unlock)       │
└──────────────────────┘    Messaging      └──────────────────────┘
```

**Contracts:**
- **DummyAuthorizer** — Placeholder PQC authorizer that allows all transfers (Phase 1). Deployed on Ethereum before QONE V2.
- **QONE V2** — Fixed-supply ERC-20 with PQC capability. Requires a deployed authorizer. Deployed on Ethereum.
- **QONEOFTAdapter** — Locks/unlocks existing QONE tokens on HyperEVM for cross-chain bridging. Deployed on HyperEVM.

---

## Hardcoded Addresses (QONEOFTAdapter)

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

The `app/` directory contains a Vite + TypeScript deployer that uses MetaMask.

```bash
cd app
npm install
npm run dev
```

Open the URL shown in the terminal, then:

1. **Connect MetaMask** — click the button to connect your wallet.
2. **Deploy DummyAuthorizer** — deploys on Ethereum. Or paste an existing address.
3. **Deploy QONE V2** — deploys on Ethereum using the authorizer from step 2. Or paste an existing address.
4. **Deploy QONEOFTAdapter** — deploys on HyperEVM. Or paste an existing address.

All deployed addresses are shown on screen after each deployment.

> **Alternative (CLI):** If you prefer deploying from the command line, see the [CLI Deploy](#cli-deploy) section below.

---

## Step 2: Set Peers

Each LayerZero contract must know its counterpart on the other chain.

### 2a. On HyperEVM — point adapter to the Ethereum contract

```bash
cast send $ADAPTER_HYPEREVM_ADDRESS \
    "setPeer(uint32,bytes32)" \
    30101 \
    $(cast --to-bytes32 $ETH_COUNTERPART_ADDRESS) \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

### 2b. On Ethereum — point counterpart to the HyperEVM adapter

```bash
cast send $ETH_COUNTERPART_ADDRESS \
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

### 3b. On Ethereum counterpart (messages → HyperEVM)

```bash
cast send $ETH_COUNTERPART_ADDRESS \
    "setEnforcedOptions((uint32,uint16,bytes)[])" \
    "[(30367,1,0x00030100110100000000000000000000000000013880)]" \
    --rpc-url $ETHEREUM_RPC_URL \
    --private-key $PRIVATE_KEY
```

> 80 000 gas is a starting point. Profile actual `_lzReceive` usage and adjust with a safety margin.

---

## Step 4: Verify Contracts on Block Explorers

Verifying contracts makes the source code public and lets users interact via the explorer UI.

Set your API key (stored in `.env`):

```bash
source .env
```

### 4a. Verify DummyAuthorizer on Ethereum

```bash
forge verify-contract $DUMMY_AUTHORIZER_ADDRESS \
    src/DummyAuthorizer.sol:DummyAuthorizer \
    --rpc-url $ETHEREUM_RPC_URL \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --constructor-args $(cast abi-encode "constructor(address)" $OWNER_ADDRESS)
```

### 4b. Verify QONE V2 on Ethereum

```bash
forge verify-contract $QONE_V2_ADDRESS \
    "src/QONE-V2.sol:QONE" \
    --rpc-url $ETHEREUM_RPC_URL \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --constructor-args $(cast abi-encode "constructor(address,address)" $OWNER_ADDRESS $DUMMY_AUTHORIZER_ADDRESS)
```

### 4c. Verify QONEOFTAdapter on HyperEVM

```bash
forge verify-contract $ADAPTER_HYPEREVM_ADDRESS \
    src/QONEOFTAdapter.sol:QONEOFTAdapter \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --verifier etherscan \
    --verifier-url https://api.hyperevmscan.io/api \
    --etherscan-api-key $ETHERSCAN_API_KEY
```

> HyperEVM explorer: [hyperevmscan.io](https://hyperevmscan.io). You may need a separate API key from HyperEVMScan — if so, register at their site and add it to `.env`.

---

## Step 5: (Optional) Configure DVNs and Libraries

LayerZero uses its default DVN/library config by default. For production you may want to customize:

- **Check defaults:** [LayerZero Scan Default Checker](https://layerzeroscan.com/tools/defaults?version=V2)
- **Custom libraries:** Call `setSendLibrary` / `setReceiveLibrary` on the Endpoint. See [LZ deployed contracts](https://docs.layerzero.network/v2/deployments/chains/hyperliquid).
- **Custom DVN config:** Call `setConfig` on the Endpoint. See [LZ OFT Quickstart](https://docs.layerzero.network/contracts/oft-adapter).

---

## Step 6: Test a Bridge Transfer

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

Same pattern on the Ethereum counterpart contract with `dstEid = 30367`.

---

## Step 7: Track Your Transaction

Paste your source tx hash on [LayerZero Scan](https://layerzeroscan.com/) to track delivery.

---

## CLI Deploy

If you prefer deploying without the web app:

### 1. Deploy DummyAuthorizer on Ethereum

```bash
BYTECODE=$(jq -r '.bytecode.object' out/DummyAuthorizer.sol/DummyAuthorizer.json)
ARGS=$(cast abi-encode "constructor(address)" $OWNER_ADDRESS)

cast send --rpc-url $ETHEREUM_RPC_URL \
    --private-key $PRIVATE_KEY \
    --create "${BYTECODE}${ARGS:2}"
```

### 2. Deploy QONE V2 on Ethereum

```bash
BYTECODE=$(jq -r '.bytecode.object' out/QONE-V2.sol/QONE.json)
ARGS=$(cast abi-encode "constructor(address,address)" $OWNER_ADDRESS $DUMMY_AUTHORIZER_ADDRESS)

cast send --rpc-url $ETHEREUM_RPC_URL \
    --private-key $PRIVATE_KEY \
    --create "${BYTECODE}${ARGS:2}"
```

### 3. Switch to big blocks (HyperEVM)

```bash
npx @layerzerolabs/hyperliquid-composer set-block \
    --size big --network mainnet --log-level verbose \
    --private-key $PRIVATE_KEY
```

### 4. Deploy QONEOFTAdapter on HyperEVM

```bash
BYTECODE=$(jq -r '.bytecode.object' out/QONEOFTAdapter.sol/QONEOFTAdapter.json)

cast send --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY \
    --create "$BYTECODE"
```

### 5. Switch back to small blocks

```bash
npx @layerzerolabs/hyperliquid-composer set-block \
    --size small --network mainnet --log-level verbose \
    --private-key $PRIVATE_KEY
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
- [ ] DummyAuthorizer owner matches QONE V2 owner
