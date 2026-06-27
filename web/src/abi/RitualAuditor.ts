import type { Address } from "viem";

/** Deployed RitualAuditor (Ritual testnet). Overridable via env. */
export const RITUAL_AUDITOR: Address =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() as Address | undefined) ??
  "0x950b7943A5b2E3C4F477463892ADAC250cfcE56b";

export const ritualAuditorAbi = [
  {
    type: "function",
    name: "requestAudit",
    stateMutability: "payable",
    inputs: [
      { name: "code", type: "string" },
      { name: "llmInput", type: "bytes" },
    ],
    outputs: [{ name: "auditId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAudit",
    stateMutability: "view",
    inputs: [{ name: "auditId", type: "uint256" }],
    outputs: [
      { name: "requester", type: "address" },
      { name: "code", type: "string" },
      { name: "report", type: "string" },
      { name: "completed", type: "bool" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "auditFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "nextAuditId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "TREASURY",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "setAuditFee",
    stateMutability: "nonpayable",
    inputs: [{ name: "newFee", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: [],
  },
  {
    type: "event",
    name: "AuditRequested",
    inputs: [
      { name: "auditId", type: "uint256", indexed: true },
      { name: "requester", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AuditCompleted",
    inputs: [
      { name: "auditId", type: "uint256", indexed: true },
      { name: "report", type: "string", indexed: false },
    ],
  },
] as const;

export default ritualAuditorAbi;
