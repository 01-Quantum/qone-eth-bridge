# QONE Bridge: HyperEVM <-> Ethereum — Deployment Guide

## Architecture Overview

```
  Ethereum                                        HyperEVM
┌──────────────────────┐                   ┌──────────────────────┐
│  DummyAuthorizer     │                   │  QONE Token (ERC-20) │
│  0x332E...8024       │                   │  0x1E3699...B698DB   │
│                      │                   │                      │
│  QONE V2 (ERC-20)   │                   │  QONEOFTAdapter      │
│  0x2019...AcdE0      │                   │  (lock/unlock)       │
│                      │                   │  0x070D...1a33       │
│  QONEOFTAdapter      │                   │                      │
│  Ethereum            │◄── LayerZero ──►  │                      │
│  (lock/unlock)       │    Messaging      │                      │
└──────────────────────┘                   └──────────────────────┘
```

**Contracts:**
- **DummyAuthorizer** — Placeholder PQC authorizer that allows all transfers (Phase 1). Deployed on Ethereum.
- **QONE V2** — Fixed-supply ERC-20 with PQC capability. Deployed on Ethereum.
- **QONEOFTAdapter (HyperEVM)** — Locks/unlocks existing QONE tokens on HyperEVM for cross-chain bridging.
- **QONEOFTAdapterEthereum** — Locks/unlocks existing QONE V2 tokens on Ethereum for cross-chain bridging.

Both adapters use the lock/unlock model. Liquidity must be seeded on both sides for bridging to work in each direction.

---

## Deployed Addresses

| Contract | Chain | Address | Status |
|----------|-------|---------|--------|
| DummyAuthorizer | Ethereum | `0x332E3F52594F54E2c4fcFD43958eD5368bCb8024` | Deployed & Verified |
| QONE V2 | Ethereum | `0x20196F73529C7DC24B30f4703D7A2b79643aCdE0` | Deployed & Verified |
| QONEOFTAdapter | HyperEVM | `0x070DA2E023FD454fEC26Dcecb2b9B16668781a33` | Deployed |
| QONEOFTAdapterEthereum | Ethereum | _deploy via web app_ | Pending |

### Hardcoded Values

| Item | Value |
|------|-------|
| Owner | `0xb2A1dc0DB510E268B645387e852061ce22E2e7aa` |
| QONE Token (HyperEVM) | `0x1E369922D78db967B009D4a21CC04c0881B698DB` |
| QONE V2 Token (Ethereum) | `0x20196F73529C7DC24B30f4703D7A2b79643aCdE0` |
| LayerZero EndpointV2 (HyperEVM) | `0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9` |
| LayerZero EndpointV2 (Ethereum) | `0x1a44076050125825900e736c501f859c50fE728c` |
| HyperEVM Endpoint ID (eid) | `30367` |
| Ethereum Endpoint ID (eid) | `30101` |

---

## Prerequisites

1. **Foundry** installed (`forge`, `cast`)
2. **Node.js** (v18+) and **npm**
3. **MetaMask** browser extension with funded wallet on both Ethereum and HyperEVM
4. **HyperEVM deployer account must be activated on HyperCore** (at least $1 in USDC or HYPE received on HyperCore)

---

## Step 0: Build the Contracts

```bash
forge build
```

---

## Step 1: Deploy QONEOFTAdapterEthereum via the Web App

The HyperEVM adapter is already deployed. The Ethereum adapter still needs to be deployed.

```bash
cd app
npm install
npm run dev
```

Open the URL shown in the terminal, then:

1. **Connect MetaMask** — click the button to connect your wallet.
2. **Deploy QONEOFTAdapterEthereum** — the app switches MetaMask to Ethereum and deploys.

The adapter address is shown on screen after deployment.

> **Alternative (CLI):** If you prefer deploying from the command line, see the [CLI Deploy](#cli-deploy) section below.

---

## Step 2: Set Peers

Each adapter must know its counterpart on the other chain. Replace `$ADAPTER_ETH_ADDRESS` with the Ethereum adapter address from Step 1.

### 2a. On HyperEVM — point HyperEVM adapter to Ethereum adapter

```bash
cast send 0x070DA2E023FD454fEC26Dcecb2b9B16668781a33 \
    "setPeer(uint32,bytes32)" \
    30101 \
    $(cast --to-bytes32 $ADAPTER_ETH_ADDRESS) \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

### 2b. On Ethereum — point Ethereum adapter to HyperEVM adapter

```bash
cast send $ADAPTER_ETH_ADDRESS \
    "setPeer(uint32,bytes32)" \
    30367 \
    $(cast --to-bytes32 0x070DA2E023FD454fEC26Dcecb2b9B16668781a33) \
    --rpc-url https://cloudflare-eth.com \
    --private-key $PRIVATE_KEY
```

---

## Step 3: Set Enforced Options

Enforced options guarantee enough gas for `_lzReceive` on the destination. Without them, `send()` reverts.

The options bytes below allocate **80 000 gas** (`0x13880`) for `lzReceive` (msgType 1 = SEND).

### 3a. On HyperEVM adapter (messages → Ethereum)

```bash
cast send 0x070DA2E023FD454fEC26Dcecb2b9B16668781a33 \
    "setEnforcedOptions((uint32,uint16,bytes)[])" \
    "[(30101,1,0x00030100110100000000000000000000000000013880)]" \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

### 3b. On Ethereum adapter (messages → HyperEVM)

```bash
cast send $ADAPTER_ETH_ADDRESS \
    "setEnforcedOptions((uint32,uint16,bytes)[])" \
    "[(30367,1,0x00030100110100000000000000000000000000013880)]" \
    --rpc-url https://cloudflare-eth.com \
    --private-key $PRIVATE_KEY
```

> 80 000 gas is a starting point. Profile actual `_lzReceive` usage and adjust with a safety margin.

---

## Step 4: Verify Contracts

DummyAuthorizer and QONE V2 are already verified on Etherscan. The HyperEVM adapter can be verified on HyperEVMScan, and the Ethereum adapter on Etherscan.

### HyperEVM adapter

```bash
source .env

forge verify-contract 0x070DA2E023FD454fEC26Dcecb2b9B16668781a33 \
    src/QONEOFTAdapter.sol:QONEOFTAdapter \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --verifier etherscan \
    --etherscan-api-key $ETHERSCAN_API_KEY
```

### Ethereum adapter

```bash
forge verify-contract $ADAPTER_ETH_ADDRESS \
    src/QONEOFTAdapterEthereum.sol:QONEOFTAdapterEthereum \
    --rpc-url https://cloudflare-eth.com \
    --verifier etherscan \
    --etherscan-api-key $ETHERSCAN_API_KEY
```

---

## Step 5: Seed Liquidity

Both adapters use lock/unlock, so each side needs QONE tokens deposited before bridging can work in that direction.

- **For Ethereum → HyperEVM:** Transfer QONE to the HyperEVM adapter (`0x070DA2E023FD454fEC26Dcecb2b9B16668781a33`)
- **For HyperEVM → Ethereum:** Transfer QONE V2 to the Ethereum adapter (`$ADAPTER_ETH_ADDRESS`)

Over time it's self-balancing: every bridge in one direction adds liquidity to the other side.

---

## Step 6: (Optional) Configure DVNs and Libraries

LayerZero uses its default DVN/library config by default. For production you may want to customize:

- **Check defaults:** [LayerZero Scan Default Checker](https://layerzeroscan.com/tools/defaults?version=V2)
- **Custom libraries:** Call `setSendLibrary` / `setReceiveLibrary` on the Endpoint. See [LZ deployed contracts](https://docs.layerzero.network/v2/deployments/chains/hyperliquid).
- **Custom DVN config:** Call `setConfig` on the Endpoint. See [LZ OFT Quickstart](https://docs.layerzero.network/contracts/oft-adapter).

---

## Step 7: Test a Bridge Transfer

### HyperEVM → Ethereum

1. **Approve** the HyperEVM adapter:

```bash
cast send 0x1E369922D78db967B009D4a21CC04c0881B698DB \
    "approve(address,uint256)" \
    0x070DA2E023FD454fEC26Dcecb2b9B16668781a33 \
    1000000000000000000 \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

2. **Quote** the fee:

```bash
cast call 0x070DA2E023FD454fEC26Dcecb2b9B16668781a33 \
    "quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool)" \
    "(30101,$(cast --to-bytes32 $RECIPIENT_ADDRESS),1000000000000000000,950000000000000000,0x,0x,0x)" \
    false \
    --rpc-url https://rpc.hyperliquid.xyz/evm
```

3. **Send** (attach the quoted fee as `msg.value`):

```bash
cast send 0x070DA2E023FD454fEC26Dcecb2b9B16668781a33 \
    "send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address)" \
    "(30101,$(cast --to-bytes32 $RECIPIENT_ADDRESS),1000000000000000000,950000000000000000,0x,0x,0x)" \
    "($QUOTED_NATIVE_FEE,0)" \
    $REFUND_ADDRESS \
    --value $QUOTED_NATIVE_FEE \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

### Ethereum → HyperEVM

1. **Approve** the Ethereum adapter:

```bash
cast send 0x20196F73529C7DC24B30f4703D7A2b79643aCdE0 \
    "approve(address,uint256)" \
    $ADAPTER_ETH_ADDRESS \
    1000000000000000000 \
    --rpc-url https://cloudflare-eth.com \
    --private-key $PRIVATE_KEY
```

2. **Quote** and **Send** — same pattern on the Ethereum adapter (`$ADAPTER_ETH_ADDRESS`) with `dstEid = 30367`.

---

## Step 8: Track Your Transaction

Paste your source tx hash on [LayerZero Scan](https://layerzeroscan.com/) to track delivery.

---

## CLI Deploy

If you prefer deploying without the web app:

### Deploy QONEOFTAdapterEthereum on Ethereum

```bash
BYTECODE=$(jq -r '.bytecode.object' out/QONEOFTAdapterEthereum.sol/QONEOFTAdapterEthereum.json)

cast send --rpc-url https://cloudflare-eth.com \
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

- [ ] QONEOFTAdapter deployed on HyperEVM
- [ ] QONEOFTAdapterEthereum deployed on Ethereum
- [ ] `setPeer` called on **both** adapters (bidirectional)
- [ ] Enforced options set on **both** adapters
- [ ] Both adapters verified on their respective explorers
- [ ] Liquidity seeded on both sides
- [ ] Test with a small amount first
- [ ] Verify delivery on [LayerZero Scan](https://layerzeroscan.com/)
- [ ] Owner keys are secured (owner can reconfigure peers and options)
