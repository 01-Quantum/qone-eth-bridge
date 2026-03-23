import { BrowserProvider, ContractFactory } from "ethers";
import adapterArtifact from "@artifacts/QONEOFTAdapter.sol/QONEOFTAdapter.json";
import authArtifact from "@artifacts/DummyAuthorizer.sol/DummyAuthorizer.json";
import qoneArtifact from "@artifacts/QONE-V2.sol/QONE.json";
import "./style.css";

const HYPEREVM = { id: 999, hex: "0x3e7", name: "HyperEVM", rpc: "https://rpc.hyperliquid.xyz/evm" };
const ETHEREUM = { id: 1, hex: "0x1" };
const EID = { HYPEREVM: 30367, ETHEREUM: 30101 };

let connectedAddress = "";
let authAddress = "";
let qoneAddress = "";
let adapterAddress = "";

const $ = (id: string) => document.getElementById(id)!;
const btn = (id: string) => $(id) as HTMLButtonElement;
const inp = (id: string) => $(id) as HTMLInputElement;

const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim());

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
  btn("deploy-auth-btn").disabled = false;
  btn("use-auth-btn").disabled = false;
});

function onAuthSet() {
  btn("deploy-qone-btn").disabled = false;
  btn("use-qone-btn").disabled = false;
  btn("deploy-auth-btn").disabled = true;
  btn("use-auth-btn").disabled = true;
  inp("auth-addr").disabled = true;
  updateSummary();
}

function onQoneSet() {
  btn("deploy-adapter-btn").disabled = false;
  btn("use-adapter-btn").disabled = false;
  btn("deploy-qone-btn").disabled = true;
  btn("use-qone-btn").disabled = true;
  inp("qone-addr").disabled = true;
  updateSummary();
}

function onAdapterSet() {
  btn("deploy-adapter-btn").disabled = true;
  btn("use-adapter-btn").disabled = true;
  inp("adapter-addr").disabled = true;
  updateSummary();
}

// ── "Use existing" buttons ───────────────────────────────

btn("use-auth-btn").addEventListener("click", () => {
  const addr = inp("auth-addr").value.trim();
  if (!isAddr(addr)) { log("auth-log", "Invalid address", "error"); return; }
  authAddress = addr;
  log("auth-log", `Using existing: ${authAddress}`, "success");
  onAuthSet();
});

btn("use-qone-btn").addEventListener("click", () => {
  const addr = inp("qone-addr").value.trim();
  if (!isAddr(addr)) { log("qone-log", "Invalid address", "error"); return; }
  qoneAddress = addr;
  log("qone-log", `Using existing: ${qoneAddress}`, "success");
  onQoneSet();
});

btn("use-adapter-btn").addEventListener("click", () => {
  const addr = inp("adapter-addr").value.trim();
  if (!isAddr(addr)) { log("adapter-log", "Invalid address", "error"); return; }
  adapterAddress = addr;
  log("adapter-log", `Using existing: ${adapterAddress}`, "success");
  onAdapterSet();
});

// ── Step 1: Deploy DummyAuthorizer on Ethereum ───────────

btn("deploy-auth-btn").addEventListener("click", async () => {
  btn("deploy-auth-btn").disabled = true;
  try {
    log("auth-log", "Switching MetaMask to Ethereum…");
    await ensureChain(ETHEREUM.hex);
    log("auth-log", "Connected to Ethereum", "success");

    log("auth-log", "Deploying DummyAuthorizer…");
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const factory = new ContractFactory(authArtifact.abi, authArtifact.bytecode.object, signer);
    const contract = await factory.deploy(connectedAddress);
    const txHash = contract.deploymentTransaction()?.hash;
    if (txHash) log("auth-log", `Tx: ${txHash}`);

    log("auth-log", "Waiting for confirmation…");
    await contract.waitForDeployment();
    authAddress = await contract.getAddress();
    log("auth-log", `Deployed: ${authAddress}`, "success");
    onAuthSet();
  } catch (err: any) {
    log("auth-log", `Error: ${err.shortMessage || err.message || err}`, "error");
    btn("deploy-auth-btn").disabled = false;
  }
});

// ── Step 2: Deploy QONE V2 on Ethereum ───────────────────

btn("deploy-qone-btn").addEventListener("click", async () => {
  btn("deploy-qone-btn").disabled = true;
  try {
    if (!authAddress) {
      log("qone-log", "Deploy DummyAuthorizer first (Step 1)", "error");
      btn("deploy-qone-btn").disabled = false;
      return;
    }

    log("qone-log", "Switching MetaMask to Ethereum…");
    await ensureChain(ETHEREUM.hex);
    log("qone-log", "Connected to Ethereum", "success");

    log("qone-log", `Deploying QONE V2 (owner: ${connectedAddress}, authorizer: ${authAddress})…`);
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const factory = new ContractFactory(qoneArtifact.abi, qoneArtifact.bytecode.object, signer);
    const contract = await factory.deploy(connectedAddress, authAddress);
    const txHash = contract.deploymentTransaction()?.hash;
    if (txHash) log("qone-log", `Tx: ${txHash}`);

    log("qone-log", "Waiting for confirmation…");
    await contract.waitForDeployment();
    qoneAddress = await contract.getAddress();
    log("qone-log", `Deployed: ${qoneAddress}`, "success");
    onQoneSet();
  } catch (err: any) {
    log("qone-log", `Error: ${err.shortMessage || err.message || err}`, "error");
    btn("deploy-qone-btn").disabled = false;
  }
});

// ── Step 3: Deploy QONEOFTAdapter on HyperEVM ────────────

btn("deploy-adapter-btn").addEventListener("click", async () => {
  btn("deploy-adapter-btn").disabled = true;
  try {
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
    onAdapterSet();
  } catch (err: any) {
    log("adapter-log", `Error: ${err.shortMessage || err.message || err}`, "error");
    btn("deploy-adapter-btn").disabled = false;
  }
});

// ── Summary ──────────────────────────────────────────────

function updateSummary() {
  if (!authAddress && !qoneAddress && !adapterAddress) return;
  $("summary-section").style.display = "block";

  let html = "";
  if (authAddress) {
    html += `<div class="addr-row"><label>DummyAuthorizer (Ethereum)</label><code>${authAddress}</code></div>`;
  }
  if (qoneAddress) {
    html += `<div class="addr-row"><label>QONE V2 (Ethereum)</label><code>${qoneAddress}</code></div>`;
  }
  if (adapterAddress) {
    html += `<div class="addr-row"><label>QONEOFTAdapter (HyperEVM)</label><code>${adapterAddress}</code></div>`;
  }

  if (adapterAddress && qoneAddress) {
    html += `<h3>Wire the contracts</h3>`;
    html += `<p style="color:var(--muted);font-size:0.9rem;margin-bottom:0.75rem">Run these <code>cast</code> commands to finish setup:</p>`;
    html += `<pre>`;
    html += `# Set peers\n`;
    html += `cast send ${adapterAddress} \\\n`;
    html += `  "setPeer(uint32,bytes32)" ${EID.ETHEREUM} \\\n`;
    html += `  $(cast --to-bytes32 ${qoneAddress}) \\\n`;
    html += `  --rpc-url ${HYPEREVM.rpc} --private-key $PRIVATE_KEY\n\n`;
    html += `cast send ${qoneAddress} \\\n`;
    html += `  "setPeer(uint32,bytes32)" ${EID.HYPEREVM} \\\n`;
    html += `  $(cast --to-bytes32 ${adapterAddress}) \\\n`;
    html += `  --rpc-url $ETHEREUM_RPC_URL --private-key $PRIVATE_KEY\n\n`;
    html += `# Set enforced options\n`;
    html += `cast send ${adapterAddress} \\\n`;
    html += `  "setEnforcedOptions((uint32,uint16,bytes)[])" \\\n`;
    html += `  "[(${EID.ETHEREUM},1,0x00030100110100000000000000000000000000013880)]" \\\n`;
    html += `  --rpc-url ${HYPEREVM.rpc} --private-key $PRIVATE_KEY\n\n`;
    html += `cast send ${qoneAddress} \\\n`;
    html += `  "setEnforcedOptions((uint32,uint16,bytes)[])" \\\n`;
    html += `  "[(${EID.HYPEREVM},1,0x00030100110100000000000000000000000000013880)]" \\\n`;
    html += `  --rpc-url $ETHEREUM_RPC_URL --private-key $PRIVATE_KEY`;
    html += `</pre>`;
  }

  $("summary-content").innerHTML = html;
}
