import { BrowserProvider, ContractFactory } from "ethers";
import adapterArtifact from "@artifacts/QONEOFTAdapter.sol/QONEOFTAdapter.json";
import "./style.css";

const HYPEREVM = { id: 999, hex: "0x3e7", name: "HyperEVM", rpc: "https://rpc.hyperliquid.xyz/evm" };
const EID = { HYPEREVM: 30367, ETHEREUM: 30101 };

const AUTH_ADDRESS = "0x332E3F52594F54E2c4fcFD43958eD5368bCb8024";
const QONE_ADDRESS = "0x20196F73529C7DC24B30f4703D7A2b79643aCdE0";

let adapterAddress = "";

const $ = (id: string) => document.getElementById(id)!;
const btn = (id: string) => $(id) as HTMLButtonElement;

function log(msg: string, type: "info" | "success" | "error" = "info") {
  const el = $("adapter-log");
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
  const address = await signer.getAddress();

  $("wallet-info").textContent = address;
  $("wallet-info").classList.add("connected");
  btn("deploy-adapter-btn").disabled = false;
});

// ── Deploy QONEOFTAdapter on HyperEVM ────────────────────

btn("deploy-adapter-btn").addEventListener("click", async () => {
  btn("deploy-adapter-btn").disabled = true;
  try {
    log("Switching MetaMask to HyperEVM…");
    await ensureChain(HYPEREVM.hex, { name: HYPEREVM.name, rpc: HYPEREVM.rpc });
    log("Connected to HyperEVM", "success");

    log("Deploying QONEOFTAdapter…");
    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();
    const factory = new ContractFactory(adapterArtifact.abi, adapterArtifact.bytecode.object, signer);
    const contract = await factory.deploy();
    const txHash = contract.deploymentTransaction()?.hash;
    if (txHash) log(`Tx: ${txHash}`);

    log("Waiting for confirmation…");
    await contract.waitForDeployment();
    adapterAddress = await contract.getAddress();
    log(`Deployed: ${adapterAddress}`, "success");

    showSummary();
  } catch (err: any) {
    log(`Error: ${err.shortMessage || err.message || err}`, "error");
    btn("deploy-adapter-btn").disabled = false;
  }
});

// ── Summary ──────────────────────────────────────────────

function showSummary() {
  $("summary-section").style.display = "block";

  let html = "";
  html += `<div class="addr-row"><label>DummyAuthorizer (Ethereum)</label><code>${AUTH_ADDRESS}</code></div>`;
  html += `<div class="addr-row"><label>QONE V2 (Ethereum)</label><code>${QONE_ADDRESS}</code></div>`;
  html += `<div class="addr-row"><label>QONEOFTAdapter (HyperEVM)</label><code>${adapterAddress}</code></div>`;

  html += `<h3>Wire the contracts</h3>`;
  html += `<p style="color:var(--muted);font-size:0.9rem;margin-bottom:0.75rem">Run these <code>cast</code> commands to finish setup:</p>`;
  html += `<pre>`;
  html += `# Set peers\n`;
  html += `cast send ${adapterAddress} \\\n`;
  html += `  "setPeer(uint32,bytes32)" ${EID.ETHEREUM} \\\n`;
  html += `  $(cast --to-bytes32 ${QONE_ADDRESS}) \\\n`;
  html += `  --rpc-url ${HYPEREVM.rpc} --private-key $PRIVATE_KEY\n\n`;
  html += `cast send ${QONE_ADDRESS} \\\n`;
  html += `  "setPeer(uint32,bytes32)" ${EID.HYPEREVM} \\\n`;
  html += `  $(cast --to-bytes32 ${adapterAddress}) \\\n`;
  html += `  --rpc-url $ETHEREUM_RPC_URL --private-key $PRIVATE_KEY\n\n`;
  html += `# Set enforced options\n`;
  html += `cast send ${adapterAddress} \\\n`;
  html += `  "setEnforcedOptions((uint32,uint16,bytes)[])" \\\n`;
  html += `  "[(${EID.ETHEREUM},1,0x00030100110100000000000000000000000000013880)]" \\\n`;
  html += `  --rpc-url ${HYPEREVM.rpc} --private-key $PRIVATE_KEY\n\n`;
  html += `cast send ${QONE_ADDRESS} \\\n`;
  html += `  "setEnforcedOptions((uint32,uint16,bytes)[])" \\\n`;
  html += `  "[(${EID.HYPEREVM},1,0x00030100110100000000000000000000000000013880)]" \\\n`;
  html += `  --rpc-url $ETHEREUM_RPC_URL --private-key $PRIVATE_KEY`;
  html += `</pre>`;

  $("summary-content").innerHTML = html;
}
