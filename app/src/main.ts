import { BrowserProvider, ContractFactory } from "ethers";
import { setBlockSize } from "./hyperliquid";
import adapterArtifact from "@artifacts/QONEOFTAdapter.sol/QONEOFTAdapter.json";
import oftArtifact from "@artifacts/QONEOFT.sol/QONEOFT.json";
import "./style.css";

const HYPEREVM = { id: 999, hex: "0x3e7", name: "HyperEVM", rpc: "https://rpc.hyperliquid.xyz/evm" };
const ETHEREUM = { id: 1, hex: "0x1" };
const EID = { HYPEREVM: 30367, ETHEREUM: 30101 };

let connectedAddress = "";
let adapterAddress = "";
let oftAddress = "";

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

// ── Connect ──────────────────────────────────────────────

$("connect-btn").addEventListener("click", async () => {
  if (!window.ethereum) {
    alert("MetaMask not detected. Please install it.");
    return;
  }
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  connectedAddress = await signer.getAddress();

  $("wallet-info").textContent = connectedAddress;
  $("wallet-info").classList.add("connected");
  btn("deploy-adapter-btn").disabled = false;
  btn("deploy-oft-btn").disabled = false;
});

// ── Deploy QONEOFTAdapter on HyperEVM ────────────────────

btn("deploy-adapter-btn").addEventListener("click", async () => {
  btn("deploy-adapter-btn").disabled = true;
  try {
    log("adapter-log", "Switching to big blocks…");
    await setBlockSize(true, connectedAddress);
    log("adapter-log", "Big blocks enabled", "success");

    log("adapter-log", "Switching MetaMask to HyperEVM…");
    await ensureChain(HYPEREVM.hex, { name: HYPEREVM.name, rpc: HYPEREVM.rpc });
    log("adapter-log", "Connected to HyperEVM", "success");

    log("adapter-log", "Deploying QONEOFTAdapter…");
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const factory = new ContractFactory(adapterArtifact.abi, adapterArtifact.bytecode.object, signer);
    const contract = await factory.deploy();
    const txHash = contract.deploymentTransaction()?.hash;
    if (txHash) log("adapter-log", `Tx: ${txHash}`);

    log("adapter-log", "Waiting for confirmation…");
    await contract.waitForDeployment();
    adapterAddress = await contract.getAddress();
    log("adapter-log", `Deployed: ${adapterAddress}`, "success");

    log("adapter-log", "Switching back to small blocks…");
    await setBlockSize(false, connectedAddress);
    log("adapter-log", "Small blocks restored", "success");

    updateSummary();
  } catch (err: any) {
    log("adapter-log", `Error: ${err.shortMessage || err.message || err}`, "error");
    btn("deploy-adapter-btn").disabled = false;
    try { await setBlockSize(false, connectedAddress); } catch {}
  }
});

// ── Deploy QONEOFT on Ethereum ───────────────────────────

btn("deploy-oft-btn").addEventListener("click", async () => {
  btn("deploy-oft-btn").disabled = true;
  try {
    log("oft-log", "Switching MetaMask to Ethereum…");
    await ensureChain(ETHEREUM.hex);
    log("oft-log", "Connected to Ethereum", "success");

    log("oft-log", "Deploying QONEOFT…");
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const factory = new ContractFactory(oftArtifact.abi, oftArtifact.bytecode.object, signer);
    const contract = await factory.deploy();
    const txHash = contract.deploymentTransaction()?.hash;
    if (txHash) log("oft-log", `Tx: ${txHash}`);

    log("oft-log", "Waiting for confirmation…");
    await contract.waitForDeployment();
    oftAddress = await contract.getAddress();
    log("oft-log", `Deployed: ${oftAddress}`, "success");

    updateSummary();
  } catch (err: any) {
    log("oft-log", `Error: ${err.shortMessage || err.message || err}`, "error");
    btn("deploy-oft-btn").disabled = false;
  }
});

// ── Summary ──────────────────────────────────────────────

function updateSummary() {
  if (!adapterAddress && !oftAddress) return;
  $("summary-section").style.display = "block";

  let html = "";
  if (adapterAddress) {
    html += `<div class="addr-row"><label>QONEOFTAdapter (HyperEVM)</label><code>${adapterAddress}</code></div>`;
  }
  if (oftAddress) {
    html += `<div class="addr-row"><label>QONEOFT (Ethereum)</label><code>${oftAddress}</code></div>`;
  }

  if (adapterAddress && oftAddress) {
    html += `<h3>Wire the contracts</h3>`;
    html += `<p style="color:var(--muted);font-size:0.9rem;margin-bottom:0.75rem">Run these <code>cast</code> commands to finish setup:</p>`;
    html += `<pre>`;
    html += `# Set peers\n`;
    html += `cast send ${adapterAddress} \\\n`;
    html += `  "setPeer(uint32,bytes32)" ${EID.ETHEREUM} \\\n`;
    html += `  $(cast --to-bytes32 ${oftAddress}) \\\n`;
    html += `  --rpc-url ${HYPEREVM.rpc} --private-key $PRIVATE_KEY\n\n`;
    html += `cast send ${oftAddress} \\\n`;
    html += `  "setPeer(uint32,bytes32)" ${EID.HYPEREVM} \\\n`;
    html += `  $(cast --to-bytes32 ${adapterAddress}) \\\n`;
    html += `  --rpc-url $ETHEREUM_RPC_URL --private-key $PRIVATE_KEY\n\n`;
    html += `# Set enforced options\n`;
    html += `cast send ${adapterAddress} \\\n`;
    html += `  "setEnforcedOptions((uint32,uint16,bytes)[])" \\\n`;
    html += `  "[(${EID.ETHEREUM},1,0x00030100110100000000000000000000000000013880)]" \\\n`;
    html += `  --rpc-url ${HYPEREVM.rpc} --private-key $PRIVATE_KEY\n\n`;
    html += `cast send ${oftAddress} \\\n`;
    html += `  "setEnforcedOptions((uint32,uint16,bytes)[])" \\\n`;
    html += `  "[(${EID.HYPEREVM},1,0x00030100110100000000000000000000000000013880)]" \\\n`;
    html += `  --rpc-url $ETHEREUM_RPC_URL --private-key $PRIVATE_KEY`;
    html += `</pre>`;
  }

  $("summary-content").innerHTML = html;
}
