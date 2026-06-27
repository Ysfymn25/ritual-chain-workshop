// Hardhat Ignition deployment module for RitualAuditor.
//
// Deploy to Ritual testnet (the LLM precompile 0x0802 only exists there):
//   npx hardhat ignition deploy ignition/modules/RitualAuditor.ts --network ritual
//
// Constructor args:
//   initialFee    — per-audit fee in wei of the native Ritual token (default 0.001)
//   initialOwner  — the wallet that owns the contract (can re-price / transfer).
//                   Defaults to the user's MetaMask, so a throwaway key can do the
//                   deploy while ownership lands on the real wallet.
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RitualAuditorModule", (m) => {
  // 0.001 native token = 1e15 wei.
  const initialFee = m.getParameter("initialFee", 1_000_000_000_000_000n);
  // Owner = your MetaMask (also the fee treasury), not the deploying key.
  const initialOwner = m.getParameter(
    "initialOwner",
    "0x1BFe607AD53Ca8B2b638630865466E7F386a9b80",
  );

  const auditor = m.contract("RitualAuditor", [initialFee, initialOwner]);

  return { auditor };
});
