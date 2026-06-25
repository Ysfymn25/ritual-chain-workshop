// Hardhat Ignition deployment module for BountyJudge.
// Place this at: hardhat/ignition/modules/BountyJudge.ts
//
// Deploy (Sepolia):
//   npx hardhat ignition deploy ignition/modules/BountyJudge.ts --network sepolia
//
// BountyJudge has no constructor arguments, so this mirrors the repo's
// existing AIJudge module exactly.
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("BountyJudgeModule", (m) => {
  const bountyJudge = m.contract("BountyJudge");

  return { bountyJudge };
});
