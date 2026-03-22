import { encode } from "@msgpack/msgpack";
import { keccak256 } from "ethers";

const HYPERLIQUID_API = "https://api.hyperliquid.xyz";

function computeActionHash(
  action: Record<string, unknown>,
  nonce: number
): string {
  const packed = encode(action);

  const nonceBuf = new Uint8Array(8);
  new DataView(nonceBuf.buffer).setBigUint64(0, BigInt(nonce), false);

  const vaultByte = new Uint8Array([0x00]);

  const data = new Uint8Array(packed.length + 8 + 1);
  data.set(packed, 0);
  data.set(nonceBuf, packed.length);
  data.set(vaultByte, packed.length + 8);

  return keccak256(data);
}

export async function setBlockSize(
  big: boolean,
  address: string
): Promise<void> {
  const eth = window.ethereum;
  if (!eth) throw new Error("MetaMask not found");

  const action = { type: "evmUserModify", usingBigBlocks: big };
  const nonce = Date.now();
  const connectionId = computeActionHash(action, nonce);

  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Agent: [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" },
      ],
    },
    primaryType: "Agent",
    domain: {
      name: "Exchange",
      version: "1",
      chainId: 1337,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    message: { source: "a", connectionId },
  };

  // v3 produces the same hash as v4 for flat structs but avoids
  // MetaMask's chainId-must-match-active-network validation.
  let sig: string;
  try {
    sig = (await eth.request({
      method: "eth_signTypedData_v4",
      params: [address, JSON.stringify(typedData)],
    })) as string;
  } catch {
    sig = (await eth.request({
      method: "eth_signTypedData_v3",
      params: [address, JSON.stringify(typedData)],
    })) as string;
  }

  const r = `0x${sig.slice(2, 66)}`;
  const s = `0x${sig.slice(66, 130)}`;
  const v = parseInt(sig.slice(130, 132), 16);

  const res = await fetch(`${HYPERLIQUID_API}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      nonce,
      signature: { r, s, v },
      vaultAddress: null,
    }),
  });

  const data = await res.json();
  if (data.status === "err") {
    throw new Error(data.response ?? "Hyperliquid API error");
  }
}
