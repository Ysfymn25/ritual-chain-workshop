// RitualAuditor - FULL end-to-end test with a mocked LLM precompile.
//
// Ritual's LLM precompile (0x0802) only exists on Ritual chain. Here we deploy
// MockLLMPrecompile, copy its runtime code onto 0x0802 with `setCode`, and then
// run the complete requestAudit flow locally - proving fee collection, the
// precompile round-trip, on-chain report storage, and the owner withdraw all
// work. On real Ritual the SAME contract simply calls the real model.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

const { viem, networkHelpers } = await network.create();

const LLM_PRECOMPILE = "0x0000000000000000000000000000000000000802";
const TREASURY = "0x1BFe607AD53Ca8B2b638630865466E7F386a9b80";
const FEE = parseEther("0.001");
const ZERO = "0x0000000000000000000000000000000000000000";

async function setupMockAndAuditor() {
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  const mock = await viem.deployContract("MockLLMPrecompile");
  const mockCode = await publicClient.getCode({ address: mock.address });
  await networkHelpers.setCode(LLM_PRECOMPILE, mockCode);
  // deployer (wallets[0]) is the owner here.
  const auditor = await viem.deployContract("RitualAuditor", [FEE, ZERO]);
  return { publicClient, wallets, auditor };
}

describe("RitualAuditor - full flow (mocked LLM precompile)", () => {
  it("keeps the fee in-contract and stores the AI report", async () => {
    const { publicClient, wallets, auditor } = await setupMockAndAuditor();
    const [, user] = wallets;

    const snippet = "contract Vault { function withdraw() external {} }";
    await auditor.write.requestAudit([snippet, "0x"], { account: user.account, value: FEE });

    // The fee is held by the contract (no external transfer before the precompile).
    const contractBal = await publicClient.getBalance({ address: auditor.address });
    assert.equal(contractBal, FEE, "fee not held in-contract");

    // The AI report was decoded and stored on-chain.
    const [requester, storedCode, report, completed] = await auditor.read.getAudit([0n]);
    assert.equal(requester.toLowerCase(), user.account.address.toLowerCase());
    assert.equal(storedCode, snippet);
    assert.equal(completed, true);
    assert.ok(report.includes("Reentrancy"), "report missing expected finding");
    assert.ok(report.includes("high"), "report missing severity");
  });

  it("lets the owner withdraw accrued fees to the treasury", async () => {
    const { publicClient, wallets, auditor } = await setupMockAndAuditor();
    const [owner, user] = wallets;

    await auditor.write.requestAudit(["contract C {}", "0x"], { account: user.account, value: FEE });

    const treasuryBefore = await publicClient.getBalance({ address: TREASURY });
    await auditor.write.withdraw({ account: owner.account });
    const treasuryAfter = await publicClient.getBalance({ address: TREASURY });

    assert.equal(treasuryAfter - treasuryBefore, FEE, "treasury did not receive the swept fee");
    assert.equal(await publicClient.getBalance({ address: auditor.address }), 0n, "contract not drained");
  });

  it("rejects an audit that underpays the fee (before any precompile call)", async () => {
    const { wallets, auditor } = await setupMockAndAuditor();
    const [, user] = wallets;
    await viem.assertions.revertWith(
      auditor.write.requestAudit(["contract C {}", "0x"], {
        account: user.account,
        value: parseEther("0.0001"),
      }),
      "insufficient fee",
    );
  });
});
