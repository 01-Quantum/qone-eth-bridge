import { BrowserProvider, Contract, zeroPadValue } from "ethers";
import { setBlockSize } from "./hyperliquid";
import "./style.css";

const HYPEREVM = { id: 999, hex: "0x3e7", name: "HyperEVM", rpc: "https://rpc.hyperliquid.xyz/evm" };
const ETHEREUM = { id: 1, hex: "0x1" };
const EID = { HYPEREVM: 30367, ETHEREUM: 30101 };

const ADAPTER_HYPEREVM = "0x070DA2E023FD454fEC26Dcecb2b9B16668781a33";
const ADAPTER_ETHEREUM = "0x2A2bB67D6c9158539Aee373A03C262F0Fb2e3721";
const ENFORCED_OPTS_80K = "0x00030100110100000000000000000000000000013880";

const $ = (id: string) => document.getElementById(id)!;
const btn = (id: string) => $(id) as HTMLButtonElement;

function log(target: string, msg: string, type: "info" | "success" | "error" = "info") {
  const el = $(target);
  const line = document.createElement("div");
  line.className = `log-line ${type}`;
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

async function ensureChain(chainHex: string, add?: { name: string; rpc: string }) {
  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
  } catch (err: any) {
    if (err.code === 4902 && add) {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chainHex,
          chainName: add.name,
          rpcUrls: [add.rpc],
          nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
        }],
      });
    } else {
      throw err;
    }
  }
}

const OApp_ABI = [
  "function setPeer(uint32 _eid, bytes32 _peer) external",
  "function setEnforcedOptions((uint32 eid, uint16 msgType, bytes options)[] _enforcedOptions) external",
];


// ── Connect ──────────────────────────────────────────────

$("connect-btn").addEventListener("click", async () => {
  if (!window.ethereum) {
    alert("MetaMask not detected. Please install it.");
    return;
  }
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  $("wallet-info").textContent = address;
  $("wallet-info").classList.add("connected");
  btn("big-blocks-on-btn").disabled = false;
  btn("big-blocks-off-btn").disabled = false;
  btn("peer-adapter-btn").disabled = false;
  btn("peer-eth-adapter-btn").disabled = false;
  btn("opts-adapter-btn").disabled = false;
  btn("opts-eth-adapter-btn").disabled = false;
});

// ── Big Blocks ───────────────────────────────────────────

btn("big-blocks-on-btn").addEventListener("click", async () => {
  btn("big-blocks-on-btn").disabled = true;
  const L = (m: string, t?: "info" | "success" | "error") => log("bigblocks-log", m, t);
  try {
    L("Enabling big blocks…");
    await setBlockSize(true);
    L("Big blocks enabled", "success");
  } catch (err: any) {
    L(`Error: ${err.shortMessage || err.message || err}`, "error");
  } finally {
    btn("big-blocks-on-btn").disabled = false;
  }
});

btn("big-blocks-off-btn").addEventListener("click", async () => {
  btn("big-blocks-off-btn").disabled = true;
  const L = (m: string, t?: "info" | "success" | "error") => log("bigblocks-log", m, t);
  try {
    L("Disabling big blocks…");
    await setBlockSize(false);
    L("Big blocks disabled", "success");
  } catch (err: any) {
    L(`Error: ${err.shortMessage || err.message || err}`, "error");
  } finally {
    btn("big-blocks-off-btn").disabled = false;
  }
});

// ── Step 5: Wire adapters ────────────────────────────────

const W = (m: string, t?: "info" | "success" | "error") => log("wire-log", m, t);

// setPeer on HyperEVM Adapter → points to Ethereum Adapter
btn("peer-adapter-btn").addEventListener("click", async () => {
  btn("peer-adapter-btn").disabled = true;
  try {
    W("Switching to HyperEVM…");
    await ensureChain(HYPEREVM.hex, { name: HYPEREVM.name, rpc: HYPEREVM.rpc });
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const contract = new Contract(ADAPTER_HYPEREVM, OApp_ABI, signer);

    const peerBytes32 = zeroPadValue(ADAPTER_ETHEREUM, 32);
    W(`setPeer(${EID.ETHEREUM}, ${peerBytes32})…`);
    const tx = await contract.setPeer(EID.ETHEREUM, peerBytes32);
    W(`Tx: ${tx.hash}`);
    await tx.wait();
    W("HyperEVM adapter peer set → Ethereum adapter", "success");
  } catch (err: any) {
    W(`Error: ${err.shortMessage || err.message || err}`, "error");
    btn("peer-adapter-btn").disabled = false;
  }
});

// setPeer on Ethereum Adapter → points to HyperEVM Adapter
btn("peer-eth-adapter-btn").addEventListener("click", async () => {
  btn("peer-eth-adapter-btn").disabled = true;
  try {
    W("Switching to Ethereum…");
    await ensureChain(ETHEREUM.hex);
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const contract = new Contract(ADAPTER_ETHEREUM, OApp_ABI, signer);

    const peerBytes32 = zeroPadValue(ADAPTER_HYPEREVM, 32);
    W(`setPeer(${EID.HYPEREVM}, ${peerBytes32})…`);
    const tx = await contract.setPeer(EID.HYPEREVM, peerBytes32);
    W(`Tx: ${tx.hash}`);
    await tx.wait();
    W("Ethereum adapter peer set → HyperEVM adapter", "success");
  } catch (err: any) {
    W(`Error: ${err.shortMessage || err.message || err}`, "error");
    btn("peer-eth-adapter-btn").disabled = false;
  }
});

// setEnforcedOptions on HyperEVM Adapter (messages → Ethereum)
btn("opts-adapter-btn").addEventListener("click", async () => {
  btn("opts-adapter-btn").disabled = true;
  try {
    W("Switching to HyperEVM…");
    await ensureChain(HYPEREVM.hex, { name: HYPEREVM.name, rpc: HYPEREVM.rpc });
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const contract = new Contract(ADAPTER_HYPEREVM, OApp_ABI, signer);

    W("setEnforcedOptions on HyperEVM adapter…");
    const tx = await contract.setEnforcedOptions([
      [EID.ETHEREUM, 1, ENFORCED_OPTS_80K],
    ]);
    W(`Tx: ${tx.hash}`);
    await tx.wait();
    W("HyperEVM adapter enforced options set", "success");
  } catch (err: any) {
    W(`Error: ${err.shortMessage || err.message || err}`, "error");
    btn("opts-adapter-btn").disabled = false;
  }
});

// setEnforcedOptions on Ethereum Adapter (messages → HyperEVM)
btn("opts-eth-adapter-btn").addEventListener("click", async () => {
  btn("opts-eth-adapter-btn").disabled = true;
  try {
    W("Switching to Ethereum…");
    await ensureChain(ETHEREUM.hex);
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const contract = new Contract(ADAPTER_ETHEREUM, OApp_ABI, signer);

    W("setEnforcedOptions on Ethereum adapter…");
    const tx = await contract.setEnforcedOptions([
      [EID.HYPEREVM, 1, ENFORCED_OPTS_80K],
    ]);
    W(`Tx: ${tx.hash}`);
    await tx.wait();
    W("Ethereum adapter enforced options set", "success");
  } catch (err: any) {
    W(`Error: ${err.shortMessage || err.message || err}`, "error");
    btn("opts-eth-adapter-btn").disabled = false;
  }
});
