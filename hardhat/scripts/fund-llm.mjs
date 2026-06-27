// Fund the deployer's RitualWallet so the LLM precompile can charge inference
// fees. Without a sufficient locked balance, requestAudit reverts.
//
//   $env:RITUAL_PRIVATE_KEY="0x..."; node scripts/fund-llm.mjs
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.RITUAL_RPC_URL || "https://rpc.ritualfoundation.org";
const PK = process.env.RITUAL_PRIVATE_KEY;
if (!PK) {
  console.error("Set RITUAL_PRIVATE_KEY first.");
  process.exit(1);
}

const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
const DEPOSIT_AMOUNT = parseEther(process.env.DEPOSIT_AMOUNT || "0.05");
const LOCK_DURATION = 100_000n;

const abi = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [{ name: "lockDuration", type: "uint256" }], outputs: [] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "lockUntil", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
];

const ritual = defineChain({
  id: 1979,
  name: "Ritual",
  nativeCurrency: { name: "Ritual", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const account = privateKeyToAccount(PK);
const publicClient = createPublicClient({ chain: ritual, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: ritual, transport: http(RPC) });

console.log("Depositing", formatEther(DEPOSIT_AMOUNT), "RITUAL into RitualWallet for", account.address);

const hash = await wallet.writeContract({
  address: RITUAL_WALLET,
  abi,
  functionName: "deposit",
  args: [LOCK_DURATION],
  value: DEPOSIT_AMOUNT,
});
console.log("deposit tx:", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("status:", receipt.status);

const [bal, lock, block] = await Promise.all([
  publicClient.readContract({ address: RITUAL_WALLET, abi, functionName: "balanceOf", args: [account.address] }),
  publicClient.readContract({ address: RITUAL_WALLET, abi, functionName: "lockUntil", args: [account.address] }),
  publicClient.getBlockNumber(),
]);
console.log("RitualWallet balance:", formatEther(bal), "RITUAL");
console.log("lockUntil:", lock.toString(), "| currentBlock:", block.toString(), "| locked for", (lock - block).toString(), "blocks");
