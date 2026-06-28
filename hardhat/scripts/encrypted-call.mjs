import { encrypt, ECIES_CONFIG } from "eciesjs";
ECIES_CONFIG.symmetricNonceLength = 12; // Ritual TEE expects a 12-byte AES-GCM nonce

import {
  createWalletClient, createPublicClient, http, defineChain,
  encodeAbiParameters, parseAbiParameters, encodeFunctionData, formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://rpc.ritualfoundation.org";
const CONTRACT = "0xa17adc506961d40413239ebdd349c82590cd482e";
const EXECUTOR = "0xB42e435c4252A5a2E7440e37B609F00c61a0c91B";
const EXECUTOR_PUBKEY = "0x0423933442895fd590807beab91f6aac4df3af5aa66f234d3c58d5cc0ef79b304db8932dbbac162660e073afe3c04d0d2d8381fa6e39e2130d00355e3cc0eb16e9";
const HF_USER = "JsppIV";
const HF_REPO = "ritualauditconvos";
const HF_TOKEN = process.env.HF_TOKEN;
const PK = process.env.RITUAL_PRIVATE_KEY;

const ritual = defineChain({ id: 1979, name: "Ritual",
  nativeCurrency: { name: "Ritual", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain: ritual, transport: http(RPC) });
const wallet = createWalletClient({ account: privateKeyToAccount(PK), chain: ritual, transport: http(RPC) });
const account = privateKeyToAccount(PK);

const auditAbi = [
  { type: "function", name: "requestAudit", stateMutability: "payable",
    inputs: [{ name: "code", type: "string" }, { name: "llmInput", type: "bytes" }], outputs: [{ name: "auditId", type: "uint256" }] },
  { type: "function", name: "auditFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nextAuditId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getAudit", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "address" }, { type: "string" }, { type: "string" }, { type: "bool" }, { type: "uint256" }] },
];

const fee = await pub.readContract({ address: CONTRACT, abi: auditAbi, functionName: "auditFee" });
const nextId = await pub.readContract({ address: CONTRACT, abi: auditAbi, functionName: "nextAuditId" });
console.log("auditFee =", formatEther(fee), "RITUAL | next auditId =", nextId.toString());

// 1) Encrypt secrets JSON to the executor pubkey (hex without 0x).
const secretsJson = JSON.stringify({ HF_TOKEN });
const encrypted = encrypt(EXECUTOR_PUBKEY.slice(2), Buffer.from(secretsJson));
// eciesjs returns a Uint8Array; wrap in Buffer so toString("hex") yields real hex.
const encryptedHex = "0x" + Buffer.from(encrypted).toString("hex");
console.log("encrypted blob bytes:", encrypted.length, "| hex ok:", /^0x[0-9a-f]+$/.test(encryptedHex));

// 2) EIP-191 sign the hex string of the encrypted blob.
const signature = await account.signMessage({ message: { raw: encryptedHex } });

const params = parseAbiParameters("address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)");
const messages = JSON.stringify([
  { role: "system", content: "You are a meticulous smart-contract security auditor. Return ONLY JSON: {\"severity\":string,\"issues\":[{\"title\":string,\"detail\":string,\"recommendation\":string}],\"summary\":string}" },
  { role: "user", content: "Audit this contract:\n\ncontract Vault { mapping(address=>uint) bal; function withdraw() external { (bool ok,)=msg.sender.call{value:bal[msg.sender]}(\"\"); require(ok); bal[msg.sender]=0; } }" },
]);
const convo = ["hf", `${HF_USER}/${HF_REPO}/convos/session.jsonl`, "HF_TOKEN"];
const SNIPPET = "contract Vault { mapping(address=>uint) bal; function withdraw() external { (bool ok,)=msg.sender.call{value:bal[msg.sender]}(\"\"); require(ok); bal[msg.sender]=0; } }";

const llmInput = encodeAbiParameters(params, [
  EXECUTOR, [encryptedHex], 300n, [signature], "0x", messages, "zai-org/GLM-4.7-FP8",
  0n, "", false, 8192n, "", "", 1n, false, 0n, "low", "0x", -1n, "", "",
  false, 700n, "0x", "0x", -1n, 1000n, "", false, convo,
]);
const data = encodeFunctionData({ abi: auditAbi, functionName: "requestAudit", args: [SNIPPET, llmInput] });

// 3) eth_call is informational only — async/encrypted payloads can't be simulated
// (TEE decryption is unavailable in eth_call), so we send the real tx regardless.
try {
  await pub.call({ account: account.address, to: CONTRACT, data, value: fee });
  console.log("\neth_call PASSED ✓");
} catch (e) {
  console.log("\neth_call says:", (e.details || e.shortMessage || "n/a").split("\n")[0], "(expected for encrypted payloads — sending anyway)");
}

// 4) Send the real tx (capture the async validator's detailed reason if any).
console.log("Sending real audit tx...");
let hash;
try {
  hash = await wallet.sendTransaction({ to: CONTRACT, data, value: fee, gas: 8_000_000n });
  console.log("tx:", hash);
} catch (e) {
  console.log("SEND FAILED. Full error chain:");
  let cur = e, depth = 0;
  while (cur && depth < 10) {
    if (cur.details) console.log("  details:", cur.details);
    if (cur.metaMessages) console.log("  meta:", cur.metaMessages.slice(0, 2).join(" | "));
    cur = cur.cause; depth++;
  }
  process.exit(1);
}

for (let i = 0; i < 50; i++) {
  await new Promise((r) => setTimeout(r, 6000));
  try {
    const r = await pub.getTransactionReceipt({ hash });
    console.log("MINED status =", r.status, "| gasUsed =", r.gasUsed.toString());
    if (r.status !== "success") { console.log("reverted on-chain"); process.exit(1); }
    break;
  } catch { process.stdout.write(`  waiting ${(i + 1) * 6}s\r`); }
}

const [, , report, completed] = await pub.readContract({ address: CONTRACT, abi: auditAbi, functionName: "getAudit", args: [nextId] });
console.log("\n=== AI AUDIT (id " + nextId + ") completed=" + completed + " ===");
console.log(report);
