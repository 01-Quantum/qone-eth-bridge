import { signL1Action } from "@nktkas/hyperliquid/signing";
import { BrowserProvider } from "ethers";

const HYPERLIQUID_API = "https://api.hyperliquid.xyz";
const SIGNING_CHAIN_ID = "0x539"; // 1337 in hex

async function ensureSigningChain(): Promise<void> {
  const eth = window.ethereum!;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SIGNING_CHAIN_ID }],
    });
  } catch (err: any) {
    if (err.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: SIGNING_CHAIN_ID,
          chainName: "Hyperliquid Core Signing",
          nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
          rpcUrls: ["https://api.hyperliquid.xyz/evm"],
        }],
      });
    } else {
      throw err;
    }
  }
}

export async function setBlockSize(big: boolean): Promise<void> {
  const eth = window.ethereum;
  if (!eth) throw new Error("MetaMask not found");

  await ensureSigningChain();
  await eth.request({ method: "eth_requestAccounts" });

  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();

  const action = { type: "evmUserModify", usingBigBlocks: big };
  const nonce = Date.now();

  const signature = await signL1Action({
    wallet: signer,
    action,
    nonce,
    isTestnet: false,
  });

  const res = await fetch(`${HYPERLIQUID_API}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      nonce,
      signature,
      vaultAddress: null,
    }),
  });

  const data = await res.json();
  if (data.status === "err") {
    throw new Error(data.response ?? "Hyperliquid API error");
  }
}
