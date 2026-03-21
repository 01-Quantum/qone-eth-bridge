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

## Reference Addresses

| Item | Value |
|------|-------|
| QONE Token (HyperEVM) | `0x1E369922D78db967B009D4a21CC04c0881B698DB` |
| LayerZero EndpointV2 (HyperEVM) | `0x1a44076050125825900e736c501f859c50fE728c` |
| LayerZero EndpointV2 (Ethereum) | `0x1a44076050125825900e736c501f859c50fE728c` |
| HyperEVM Endpoint ID (eid) | `30367` |
| Ethereum Endpoint ID (eid) | `30101` |

---

## Prerequisites

1. **Foundry** installed (`forge`, `cast`)
2. **Funded wallets** on both HyperEVM and Ethereum with native gas tokens
3. The deployer wallet must be the **owner** (or delegated owner) of the QONE token on HyperEVM, OR you must coordinate with the owner to authorize the adapter
4. **HyperEVM deployer account must be activated on HyperCore** (at least $1 in USDC or HYPE received on HyperCore)

---

## Step 0: Build the Contracts

```bash
cd qone-eth-bridge
forge build
```

This compiles two contracts:
- `src/QONEOFTAdapter.sol` — deploy on **HyperEVM**
- `src/QONEOFT.sol` — deploy on **Ethereum**

The compiled artifacts (ABI + bytecode) are in `out/`:
- `out/QONEOFTAdapter.sol/QONEOFTAdapter.json`
- `out/QONEOFT.sol/QONEOFT.json`

Use these JSON files in your deployment app. Each contains `abi` and `bytecode.object` fields.

---

## Step 1: Switch to Big Blocks on HyperEVM

HyperEVM requires "big blocks" for contract deployments due to gas limits.

```bash
npx @layerzerolabs/hyperliquid-composer set-block \
    --size big \
    --network mainnet \
    --log-level verbose \
    --private-key $PRIVATE_KEY
```

---

## Step 2: Deploy QONEOFTAdapter on HyperEVM

Deploy `QONEOFTAdapter` on HyperEVM with these constructor arguments:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `_token` | `0x1E369922D78db967B009D4a21CC04c0881B698DB` | QONE token address |
| `_lzEndpoint` | `0x1a44076050125825900e736c501f859c50fE728c` | LayerZero EndpointV2 on HyperEVM |
| `_owner` | Your deployer wallet address | Controls bridge config |

**Using `cast` (manual):**
```bash
# Get the bytecode from the compiled artifact
BYTECODE=$(jq -r '.bytecode.object' out/QONEOFTAdapter.sol/QONEOFTAdapter.json)

# Encode constructor args
ARGS=$(cast abi-encode "constructor(address,address,address)" \
    0x1E369922D78db967B009D4a21CC04c0881B698DB \
    0x1a44076050125825900e736c501f859c50fE728c \
    $OWNER_ADDRESS)

# Deploy (use your app instead if preferred)
cast send --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY \
    --create "${BYTECODE}${ARGS:2}"
```

> **Record the deployed adapter address.** You'll need it for Steps 4-8.

---

## Step 3: Switch Back to Small Blocks on HyperEVM

```bash
npx @layerzerolabs/hyperliquid-composer set-block \
    --size small \
    --network mainnet \
    --log-level verbose \
    --private-key $PRIVATE_KEY
```

---

## Step 4: Deploy QONEOFT on Ethereum

Deploy `QONEOFT` on Ethereum with these constructor arguments:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `_lzEndpoint` | `0x1a44076050125825900e736c501f859c50fE728c` | LayerZero EndpointV2 on Ethereum |
| `_owner` | Your deployer wallet address | Controls bridge config |

**Using `cast` (manual):**
```bash
BYTECODE=$(jq -r '.bytecode.object' out/QONEOFT.sol/QONEOFT.json)

ARGS=$(cast abi-encode "constructor(address,address)" \
    0x1a44076050125825900e736c501f859c50fE728c \
    $OWNER_ADDRESS)

cast send --rpc-url $ETHEREUM_RPC_URL \
    --private-key $PRIVATE_KEY \
    --create "${BYTECODE}${ARGS:2}"
```

> **Record the deployed OFT address.** You'll need it for Steps 5-8.

---

## Step 5: Authorize the OFTAdapter in the PQC Authorizer

**CRITICAL:** The QONE token has a PQC authorizer that checks `isAuthorized(from)` on every transfer. When the adapter unlocks tokens (sends them to a user), the adapter is the `from` address. The adapter address must be authorized in the PQC authorizer.

Contact the QONE token owner (or if you are the owner) to ensure the `QONEOFTAdapter` contract address is whitelisted in the PQC authorizer contract at `0xF097375de704d394339Eb322122A9bCDa766AC1b`.

Without this step, bridging from Ethereum back to HyperEVM will fail with `"QONE: sender not authorized (PQC)"`.

---

## Step 6: Set Peers (Wire the Contracts)

Each contract must know its counterpart on the other chain. Call `setPeer()` on both contracts.

### 6a. On HyperEVM — Set the Ethereum peer on the adapter

```bash
# Convert Ethereum OFT address to bytes32
PEER_BYTES32=$(cast --to-bytes32 $QONEOFT_ETH_ADDRESS)

cast send $ADAPTER_HYPEREVM_ADDRESS \
    "setPeer(uint32,bytes32)" \
    30101 \
    $PEER_BYTES32 \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

### 6b. On Ethereum — Set the HyperEVM peer on the OFT

```bash
PEER_BYTES32=$(cast --to-bytes32 $ADAPTER_HYPEREVM_ADDRESS)

cast send $QONEOFT_ETH_ADDRESS \
    "setPeer(uint32,bytes32)" \
    30367 \
    $PEER_BYTES32 \
    --rpc-url $ETHEREUM_RPC_URL \
    --private-key $PRIVATE_KEY
```

---

## Step 7: Set Enforced Options

Enforced options guarantee enough gas is allocated for `_lzReceive` on the destination chain. Without them, `send()` will revert.

### 7a. On HyperEVM adapter — Set enforced options for messages TO Ethereum

```bash
# EnforcedOptionParam[] — msgType=1 (SEND), 80000 gas for lzReceive on Ethereum
# Options bytes: 0x00030100110100000000000000000000000000013880
# Breakdown: 0x0003 (type3) | 01 (worker=executor) | 0011 (length=17) | 01 (lzReceive) | gas=80000 (0x13880)

cast send $ADAPTER_HYPEREVM_ADDRESS \
    "setEnforcedOptions((uint32,uint16,bytes)[])" \
    "[(30101,1,0x00030100110100000000000000000000000000013880)]" \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

### 7b. On Ethereum OFT — Set enforced options for messages TO HyperEVM

```bash
cast send $QONEOFT_ETH_ADDRESS \
    "setEnforcedOptions((uint32,uint16,bytes)[])" \
    "[(30367,1,0x00030100110100000000000000000000000000013880)]" \
    --rpc-url $ETHEREUM_RPC_URL \
    --private-key $PRIVATE_KEY
```

> **Note:** The `80000` gas value (0x13880) is a starting point. Profile the actual gas usage of `_lzReceive` on each chain and adjust upward with a safety margin.

---

## Step 8: (Optional) Configure DVNs and Libraries

By default, LayerZero uses its default DVN and message library configuration for each pathway. For production deployments, you should explicitly set your security configuration.

### 8a. Check Default Config

Use [LayerZero Scan's Default Checker](https://layerzeroscan.com/tools/defaults?version=V2) to inspect the default DVN/library configuration for the HyperEVM <-> Ethereum pathway.

### 8b. Set Custom Send/Receive Libraries (if needed)

Call `setSendLibrary` and `setReceiveLibrary` on the LayerZero Endpoint on each chain. See the [LayerZero deployed contracts page](https://docs.layerzero.network/v2/deployments/chains/hyperliquid) for the correct `SendUln302` and `ReceiveUln302` addresses.

### 8c. Set Custom DVN Config (if needed)

Call `setConfig` on the Endpoint with your desired DVN configuration. Refer to the [LayerZero OFT Quickstart](https://docs.layerzero.network/contracts/oft-adapter) for detailed examples.

---

## Step 9: Test a Bridge Transfer

### HyperEVM → Ethereum

1. **Approve** the adapter to spend your QONE tokens:

```bash
cast send 0x1E369922D78db967B009D4a21CC04c0881B698DB \
    "approve(address,uint256)" \
    $ADAPTER_HYPEREVM_ADDRESS \
    1000000000000000000 \
    --rpc-url https://rpc.hyperliquid.xyz/evm \
    --private-key $PRIVATE_KEY
```

2. **Quote** the send fee:

```bash
# SendParam struct: (dstEid, to, amountLD, minAmountLD, extraOptions, composeMsg, oftCmd)
cast call $ADAPTER_HYPEREVM_ADDRESS \
    "quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool)" \
    "(30101,$(cast --to-bytes32 $RECIPIENT_ADDRESS),1000000000000000000,950000000000000000,0x,0x,0x)" \
    false \
    --rpc-url https://rpc.hyperliquid.xyz/evm
```

3. **Send** (attach the quoted native fee as `msg.value`):

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

Same pattern but on the QONEOFT contract, using `dstEid = 30367`.

---

## Step 10: Track Your Transaction

Use [LayerZero Scan](https://layerzeroscan.com/) to track cross-chain message delivery. Paste your source transaction hash to see the delivery status.

---

## LI.FI Integration

[LI.FI](https://li.fi/) is a cross-chain aggregation protocol. Once your LayerZero OFT bridge is live and verified, you can request LI.FI integration:

1. **Submit your bridge to LI.FI:** Contact the LI.FI team via their [partner integration form](https://li.fi/) or Discord to register your OFT bridge as a route.
2. **Use the LI.FI SDK/API:** Once listed, users can discover and use your bridge through the LI.FI widget, SDK, or API. LI.FI routes are purely on the frontend/API layer — no additional smart contracts are needed.
3. **LI.FI Widget:** Embed the [LI.FI Widget](https://docs.li.fi/integrate-li.fi-widget/li.fi-widget) in your dApp to give users a one-click bridge experience.

---

## Environment Variables Reference

Create a `.env` file (do NOT commit this):

```bash
PRIVATE_KEY=0x...                           # Deployer private key
OWNER_ADDRESS=0x...                         # Owner address for the bridge contracts
ETHEREUM_RPC_URL=https://eth.llamarpc.com   # Ethereum RPC
HYPEREVM_RPC_URL=https://rpc.hyperliquid.xyz/evm

# Filled after deployment:
ADAPTER_HYPEREVM_ADDRESS=0x...              # QONEOFTAdapter on HyperEVM
QONEOFT_ETH_ADDRESS=0x...                   # QONEOFT on Ethereum
```

---

## Contract Summary

| Contract | Chain | Purpose | Constructor Args |
|----------|-------|---------|-----------------|
| `QONEOFTAdapter` | HyperEVM | Locks/unlocks existing QONE | `(tokenAddr, lzEndpoint, owner)` |
| `QONEOFT` | Ethereum | Mints/burns bridged QONE | `(lzEndpoint, owner)` |

---

## Security Checklist

- [ ] The OFTAdapter address is authorized in the QONE PQC authorizer
- [ ] `setPeer` called correctly on BOTH contracts (bidirectional)
- [ ] Enforced options set on BOTH contracts
- [ ] Test with a small amount first
- [ ] Verify on [LayerZero Scan](https://layerzeroscan.com/) that the message was delivered
- [ ] Only ONE OFTAdapter exists globally (multiple adapters break unified liquidity)
- [ ] Owner keys are secured (the owner can reconfigure peers and options)
