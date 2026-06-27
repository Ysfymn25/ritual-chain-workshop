// RitualAuditor — fee + access-control tests (Hardhat 3 + node:test + viem).
//
// Note: the full requestAudit happy path calls the LLM precompile (0x0802),
// which only exists on Ritual chain — it cannot run on the local EDR network.
// These tests cover everything that is checked BEFORE the precompile call:
// constructor state, fee re-pricing (owner-gated), and the input/fee guards
// that revert early. That is exactly the money-handling logic worth pinning down.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

const { viem } = await network.create();

const TREASURY = "0x1BFe607AD53Ca8B2b638630865466E7F386a9b80";
const INITIAL_FEE = parseEther("0.001");

async function deploy() {
  const wallets = await viem.getWalletClients();
  // initialOwner = deployer (wallets[0]) so the existing owner assertions hold.
  const auditor = await viem.deployContract("RitualAuditor", [
    INITIAL_FEE,
    wallets[0].account.address,
  ]);
  return { auditor, wallets };
}

describe("RitualAuditor — fees & access control", () => {
  it("sets owner, fee and the fixed treasury at construction", async () => {
    const { auditor, wallets } = await deploy();
    const [deployer] = wallets;

    assert.equal(
      (await auditor.read.owner()).toLowerCase(),
      deployer.account.address.toLowerCase(),
    );
    assert.equal(await auditor.read.auditFee(), INITIAL_FEE);
    assert.equal(
      (await auditor.read.TREASURY()).toLowerCase(),
      TREASURY.toLowerCase(),
    );
  });

  it("honors an explicit initialOwner different from the deployer", async () => {
    const wallets = await viem.getWalletClients();
    const intendedOwner = wallets[2].account.address; // not the deployer
    const auditor = await viem.deployContract("RitualAuditor", [
      INITIAL_FEE,
      intendedOwner,
    ]);
    assert.equal(
      (await auditor.read.owner()).toLowerCase(),
      intendedOwner.toLowerCase(),
    );
  });

  it("lets the owner transfer ownership", async () => {
    const { auditor, wallets } = await deploy();
    const [owner, newOwner] = wallets;
    await auditor.write.transferOwnership([newOwner.account.address], {
      account: owner.account,
    });
    assert.equal(
      (await auditor.read.owner()).toLowerCase(),
      newOwner.account.address.toLowerCase(),
    );
    // Old owner can no longer re-price.
    await viem.assertions.revertWith(
      auditor.write.setAuditFee([0n], { account: owner.account }),
      "not owner",
    );
  });

  it("lets the owner re-price audits", async () => {
    const { auditor } = await deploy();
    const newFee = parseEther("0.005");
    await auditor.write.setAuditFee([newFee]);
    assert.equal(await auditor.read.auditFee(), newFee);
  });

  it("blocks a non-owner from changing the fee", async () => {
    const { auditor, wallets } = await deploy();
    const [, stranger] = wallets;
    await viem.assertions.revertWith(
      auditor.write.setAuditFee([parseEther("0")], { account: stranger.account }),
      "not owner",
    );
  });

  it("rejects an audit that underpays the fee", async () => {
    const { auditor, wallets } = await deploy();
    const [, user] = wallets;
    // Pay less than auditFee -> reverts before ever reaching the precompile.
    await viem.assertions.revertWith(
      auditor.write.requestAudit(["contract C {}", "0x"], {
        account: user.account,
        value: parseEther("0.0001"),
      }),
      "insufficient fee",
    );
  });

  it("rejects an audit with empty code", async () => {
    const { auditor, wallets } = await deploy();
    const [, user] = wallets;
    await viem.assertions.revertWith(
      auditor.write.requestAudit(["", "0x"], {
        account: user.account,
        value: INITIAL_FEE,
      }),
      "empty code",
    );
  });
});
