import { signL1Action } from "@nktkas/hyperliquid/signing";
import { BrowserProvider } from "ethers";

const HYPERLIQUID_API = "https://api.hyperliquid.xyz";

export async function setBlockSize(big: boolean): Promise<void> {
  const eth = window.ethereum;
  if (!eth) throw new Error("MetaMask not found");

  console.log("[HL] step 1: requesting accounts");
  let provider = new BrowserProvider(eth);
  await provider.send("eth_requestAccounts", []);

  console.log("[HL] step 2: checking chain");
  const network = await provider.getNetwork();
  console.log("[HL] step 2: current chainId", Number(network.chainId));

  if (Number(network.chainId) !== 1337) {
    console.log("[HL] step 3: switching to chain 1337");
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x539" }],
      });
      console.log("[HL] step 3: switched OK");
    } catch (err: any) {
      console.log("[HL] step 3: switchChain error", err.code, err.message);
      if (err.code === 4902) {
        console.log("[HL] step 3: adding chain 1337");
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x539",
            chainName: "Hyperliquid Core Signing",
            nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
            rpcUrls: ["https://api.hyperliquid.xyz/evm"],
          }],
        });
        console.log("[HL] step 3: chain added OK");
      } else {
        throw err;
      }
    }
    console.log("[HL] step 3: refreshing provider + signer after chain switch");
    provider = new BrowserProvider(eth);
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  console.log("[HL] step 4: signer address", address);

  const action = { type: "evmUserModify", usingBigBlocks: big };
  const nonce = Date.now();
  console.log("[HL] step 5: action", JSON.stringify(action), "nonce", nonce);

  console.log("[HL] step 6: calling signL1Action — approve on your wallet");
  let signature;
  try {
    signature = await signL1Action({
      wallet: signer,
      action,
      nonce,
      isTestnet: false,
    });
    console.log("[HL] step 6: signature", JSON.stringify(signature));
  } catch (signErr: any) {
    console.error("[HL] step 6: SIGNING FAILED", signErr);
    console.error("[HL] code", signErr?.code, "message", signErr?.message);
    console.error("[HL] cause", signErr?.cause);
    throw new Error(`Signing failed: ${signErr?.message || signErr}`);
  }

  const body = JSON.stringify({ action, nonce, signature, vaultAddress: null });
  console.log("[HL] step 7: POST /exchange");

  const res = await fetch(`${HYPERLIQUID_API}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const data = await res.json();
  console.log("[HL] step 8: response", JSON.stringify(data));

  if (data.status === "err") {
    throw new Error(data.response ?? "Hyperliquid API error");
  }

  console.log("[HL] done — block size set to", big ? "big" : "small");
}
