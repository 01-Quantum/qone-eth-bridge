import { BrowserProvider, ContractFactory, Contract, zeroPadValue } from "ethers";
import { setBlockSize } from "./hyperliquid";
import adapterArtifact from "@artifacts/QONEOFTAdapter.sol/QONEOFTAdapter.json";
import "./style.css";

const HYPEREVM = { id: 999, hex: "0x3e7", name: "HyperEVM", rpc: "https://rpc.hyperliquid.xyz/evm" };
const ETHEREUM = { id: 1, hex: "0x1" };
const EID = { HYPEREVM: 30367, ETHEREUM: 30101 };

const QONE_ADDRESS = "0x20196F73529C7DC24B30f4703D7A2b79643aCdE0";
const ENFORCED_OPTS_80K = "0x00030100110100000000000000000000000000013880";

let adapterAddress = "";

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
  btn("deploy-adapter-btn").disabled = false;
  btn("big-blocks-on-btn").disabled = false;
  btn("big-blocks-off-btn").disabled = false;
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

// ── Step 3: Deploy QONEOFTAdapter on HyperEVM ────────────

btn("deploy-adapter-btn").addEventListener("click", async () => {
  btn("deploy-adapter-btn").disabled = true;
  const L = (m: string, t?: "info" | "success" | "error") => log("adapter-log", m, t);

  try {
    L("Switching MetaMask to HyperEVM…");
    await ensureChain(HYPEREVM.hex, { name: HYPEREVM.name, rpc: HYPEREVM.rpc });
    await window.ethereum!.request({ method: "eth_requestAccounts" });

    // Verify we're on the right chain
    const chainId = await window.ethereum!.request({ method: "eth_chainId" });
    if (chainId !== HYPEREVM.hex) {
      throw new Error(`Expected chain ${HYPEREVM.hex} but got ${chainId}. Please switch MetaMask to HyperEVM manually.`);
    }
    L("Connected to HyperEVM", "success");

    L("Deploying QONEOFTAdapter…");
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const factory = new ContractFactory(adapterArtifact.abi, adapterArtifact.bytecode.object, signer);
    const contract = await factory.deploy({ gasLimit: 15_000_000 });
    const txHash = contract.deploymentTransaction()?.hash;
    if (txHash) L(`Tx: ${txHash}`);

    L("Waiting for confirmation…");
    await contract.waitForDeployment();
    adapterAddress = await contract.getAddress();
    L(`Deployed: ${adapterAddress}`, "success");

    showWiring();
    showSummary();
  } catch (err: any) {
    L(`Error: ${err.shortMessage || err.message || err}`, "error");
    btn("deploy-adapter-btn").disabled = false;
  }
});

// ── Step 4: Wire contracts ───────────────────────────────

function showWiring() {
  $("wiring-section").style.display = "block";
  btn("peer-adapter-btn").disabled = false;
  btn("peer-qone-btn").disabled = false;
  btn("opts-adapter-btn").disabled = false;
  btn("opts-qone-btn").disabled = false;
}

const W = (m: string, t?: "info" | "success" | "error") => log("wire-log", m, t);

// setPeer on Adapter (HyperEVM → points to QONE V2 on Ethereum)
btn("peer-adapter-btn").addEventListener("click", async () => {
  btn("peer-adapter-btn").disabled = true;
  try {
    W("Switching to HyperEVM…");
    await ensureChain(HYPEREVM.hex, { name: HYPEREVM.name, rpc: HYPEREVM.rpc });
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const contract = new Contract(adapterAddress, OApp_ABI, signer);

    const peerBytes32 = zeroPadValue(QONE_ADDRESS, 32);
    W(`setPeer(${EID.ETHEREUM}, ${peerBytes32})…`);
    const tx = await contract.setPeer(EID.ETHEREUM, peerBytes32);
    W(`Tx: ${tx.hash}`);
    await tx.wait();
    W("Adapter peer set", "success");
  } catch (err: any) {
    W(`Error: ${err.shortMessage || err.message || err}`, "error");
    btn("peer-adapter-btn").disabled = false;
  }
});

// setPeer on QONE V2 (Ethereum → points to Adapter on HyperEVM)
btn("peer-qone-btn").addEventListener("click", async () => {
  btn("peer-qone-btn").disabled = true;
  try {
    W("Switching to Ethereum…");
    await ensureChain(ETHEREUM.hex);
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const contract = new Contract(QONE_ADDRESS, OApp_ABI, signer);

    const peerBytes32 = zeroPadValue(adapterAddress, 32);
    W(`setPeer(${EID.HYPEREVM}, ${peerBytes32})…`);
    const tx = await contract.setPeer(EID.HYPEREVM, peerBytes32);
    W(`Tx: ${tx.hash}`);
    await tx.wait();
    W("QONE V2 peer set", "success");
  } catch (err: any) {
    W(`Error: ${err.shortMessage || err.message || err}`, "error");
    btn("peer-qone-btn").disabled = false;
  }
});

// setEnforcedOptions on Adapter (HyperEVM, for messages → Ethereum)
btn("opts-adapter-btn").addEventListener("click", async () => {
  btn("opts-adapter-btn").disabled = true;
  try {
    W("Switching to HyperEVM…");
    await ensureChain(HYPEREVM.hex, { name: HYPEREVM.name, rpc: HYPEREVM.rpc });
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const contract = new Contract(adapterAddress, OApp_ABI, signer);

    W("setEnforcedOptions on adapter…");
    const tx = await contract.setEnforcedOptions([
      [EID.ETHEREUM, 1, ENFORCED_OPTS_80K],
    ]);
    W(`Tx: ${tx.hash}`);
    await tx.wait();
    W("Adapter enforced options set", "success");
  } catch (err: any) {
    W(`Error: ${err.shortMessage || err.message || err}`, "error");
    btn("opts-adapter-btn").disabled = false;
  }
});

// setEnforcedOptions on QONE V2 (Ethereum, for messages → HyperEVM)
btn("opts-qone-btn").addEventListener("click", async () => {
  btn("opts-qone-btn").disabled = true;
  try {
    W("Switching to Ethereum…");
    await ensureChain(ETHEREUM.hex);
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const contract = new Contract(QONE_ADDRESS, OApp_ABI, signer);

    W("setEnforcedOptions on QONE V2…");
    const tx = await contract.setEnforcedOptions([
      [EID.HYPEREVM, 1, ENFORCED_OPTS_80K],
    ]);
    W(`Tx: ${tx.hash}`);
    await tx.wait();
    W("QONE V2 enforced options set", "success");
  } catch (err: any) {
    W(`Error: ${err.shortMessage || err.message || err}`, "error");
    btn("opts-qone-btn").disabled = false;
  }
});

// ── Summary ──────────────────────────────────────────────

function showSummary() {
  $("summary-section").style.display = "block";
  let html = "";
  html += `<div class="addr-row"><label>DummyAuthorizer (Ethereum)</label><code>0x332E3F52594F54E2c4fcFD43958eD5368bCb8024</code></div>`;
  html += `<div class="addr-row"><label>QONE V2 (Ethereum)</label><code>${QONE_ADDRESS}</code></div>`;
  html += `<div class="addr-row"><label>QONEOFTAdapter (HyperEVM)</label><code>${adapterAddress}</code></div>`;
  $("summary-content").innerHTML = html;
}
