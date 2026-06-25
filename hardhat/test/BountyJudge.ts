// BountyJudge — commit-reveal test suite (Hardhat 3 + node:test + viem).
//
// Run: npx hardhat test
//
// Covers every reveal-path case the homework asks for: correct reveal, wrong
// salt, tampered answer, foreign reveal, early/late reveal, double commit,
// double reveal, unauthorized judging, premature judging, finalizing an
// unrevealed winner, and out-of-range winner index — plus the full happy path.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  toHex,
  pad,
  type Address,
  type Hex,
} from "viem";

const { viem, networkHelpers } = await network.create();

// Reproduce the contract's commitment off-chain:
//   keccak256(abi.encode(answer, salt, sender, bountyId))
function makeCommitment(
  answer: string,
  salt: Hex,
  sender: Address,
  bountyId: bigint,
): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string, bytes32, address, uint256"), [
      answer,
      salt,
      sender,
      bountyId,
    ]),
  );
}

const salt = (s: string): Hex => pad(toHex(s), { size: 32 });

// Fresh contract per test (loadFixture snapshots/restores, so time resets too).
async function deployFixture() {
  const bounty = await viem.deployContract("BountyJudge");
  const wallets = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  return { bounty, wallets, publicClient };
}

// Helper: create a bounty (id 0 on a fresh deploy) with windows relative to now.
async function createBounty(bounty: any, creatorAccount: any) {
  const now = await networkHelpers.time.latest();
  const submissionDeadline = BigInt(now + 1000);
  const revealDeadline = BigInt(now + 2000);
  await bounty.write.createBounty(
    ["Best one-liner about commit-reveal", submissionDeadline, revealDeadline],
    { account: creatorAccount },
  );
  return { bountyId: 0n, submissionDeadline, revealDeadline };
}

describe("BountyJudge — commit-reveal lifecycle", () => {
  it("happy path: commit -> reveal -> judge -> finalize -> winner readable", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice, bob] = wallets;

    const { bountyId, submissionDeadline, revealDeadline } = await createBounty(
      bounty,
      creator.account,
    );

    const aliceAnswer = "hash first, talk later";
    const bobAnswer = "reveal is just keccak with extra steps";
    const aliceSalt = salt("alice-salt");
    const bobSalt = salt("bob-salt");

    await bounty.write.submitCommitment(
      [bountyId, makeCommitment(aliceAnswer, aliceSalt, alice.account.address, bountyId)],
      { account: alice.account },
    );
    await bounty.write.submitCommitment(
      [bountyId, makeCommitment(bobAnswer, bobSalt, bob.account.address, bountyId)],
      { account: bob.account },
    );

    // Move into the reveal window.
    await networkHelpers.time.increaseTo(submissionDeadline);

    await bounty.write.revealAnswer([bountyId, aliceAnswer, aliceSalt], {
      account: alice.account,
    });
    await bounty.write.revealAnswer([bountyId, bobAnswer, bobSalt], {
      account: bob.account,
    });

    // Close the reveal window, then judge + finalize (creator only).
    await networkHelpers.time.increaseTo(revealDeadline);
    await bounty.write.judgeAll([bountyId, toHex("batched-llm-input")], {
      account: creator.account,
    });

    const participants = await bounty.read.getParticipants([bountyId]);
    const winnerIndex = BigInt(
      participants.findIndex(
        (p: Address) => p.toLowerCase() === alice.account.address.toLowerCase(),
      ),
    );
    await bounty.write.finalizeWinner([bountyId, winnerIndex], {
      account: creator.account,
    });

    const [winner, answer] = await bounty.read.getWinner([bountyId]);
    assert.equal(winner.toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(answer, aliceAnswer);
  });

  it("rejects a reveal with the wrong salt", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId, submissionDeadline } = await createBounty(bounty, creator.account);

    const answer = "correct answer";
    await bounty.write.submitCommitment(
      [bountyId, makeCommitment(answer, salt("real"), alice.account.address, bountyId)],
      { account: alice.account },
    );
    await networkHelpers.time.increaseTo(submissionDeadline);

    await viem.assertions.revertWithCustomError(
      bounty.write.revealAnswer([bountyId, answer, salt("wrong")], {
        account: alice.account,
      }),
      bounty,
      "CommitmentMismatch",
    );
  });

  it("rejects a reveal with a tampered answer", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId, submissionDeadline } = await createBounty(bounty, creator.account);

    const s = salt("s");
    await bounty.write.submitCommitment(
      [bountyId, makeCommitment("original", s, alice.account.address, bountyId)],
      { account: alice.account },
    );
    await networkHelpers.time.increaseTo(submissionDeadline);

    await viem.assertions.revertWithCustomError(
      bounty.write.revealAnswer([bountyId, "tampered", s], { account: alice.account }),
      bounty,
      "CommitmentMismatch",
    );
  });

  it("stops someone else from revealing using your commitment (sender-bound)", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice, mallory] = wallets;
    const { bountyId, submissionDeadline } = await createBounty(bounty, creator.account);

    const answer = "alice's secret";
    const s = salt("alice");
    // Commitment is bound to alice's address.
    await bounty.write.submitCommitment(
      [bountyId, makeCommitment(answer, s, alice.account.address, bountyId)],
      { account: alice.account },
    );
    await networkHelpers.time.increaseTo(submissionDeadline);

    // Mallory never committed -> nothing to reveal.
    await viem.assertions.revertWithCustomError(
      bounty.write.revealAnswer([bountyId, answer, s], { account: mallory.account }),
      bounty,
      "NothingToReveal",
    );
  });

  it("rejects revealing before the submission deadline", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId } = await createBounty(bounty, creator.account);

    const s = salt("s");
    await bounty.write.submitCommitment(
      [bountyId, makeCommitment("a", s, alice.account.address, bountyId)],
      { account: alice.account },
    );

    await viem.assertions.revertWithCustomError(
      bounty.write.revealAnswer([bountyId, "a", s], { account: alice.account }),
      bounty,
      "RevealNotOpen",
    );
  });

  it("rejects revealing after the reveal deadline", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId, revealDeadline } = await createBounty(bounty, creator.account);

    const s = salt("s");
    await bounty.write.submitCommitment(
      [bountyId, makeCommitment("a", s, alice.account.address, bountyId)],
      { account: alice.account },
    );
    await networkHelpers.time.increaseTo(revealDeadline);

    await viem.assertions.revertWithCustomError(
      bounty.write.revealAnswer([bountyId, "a", s], { account: alice.account }),
      bounty,
      "RevealClosed",
    );
  });

  it("rejects committing twice", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId } = await createBounty(bounty, creator.account);

    const c = makeCommitment("a", salt("s"), alice.account.address, bountyId);
    await bounty.write.submitCommitment([bountyId, c], { account: alice.account });

    await viem.assertions.revertWithCustomError(
      bounty.write.submitCommitment([bountyId, c], { account: alice.account }),
      bounty,
      "AlreadyCommitted",
    );
  });

  it("rejects committing after the submission deadline", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId, submissionDeadline } = await createBounty(bounty, creator.account);
    await networkHelpers.time.increaseTo(submissionDeadline);

    await viem.assertions.revertWithCustomError(
      bounty.write.submitCommitment(
        [bountyId, makeCommitment("a", salt("s"), alice.account.address, bountyId)],
        { account: alice.account },
      ),
      bounty,
      "SubmissionClosed",
    );
  });

  it("rejects revealing twice", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId, submissionDeadline } = await createBounty(bounty, creator.account);

    const answer = "a";
    const s = salt("s");
    await bounty.write.submitCommitment(
      [bountyId, makeCommitment(answer, s, alice.account.address, bountyId)],
      { account: alice.account },
    );
    await networkHelpers.time.increaseTo(submissionDeadline);
    await bounty.write.revealAnswer([bountyId, answer, s], { account: alice.account });

    await viem.assertions.revertWithCustomError(
      bounty.write.revealAnswer([bountyId, answer, s], { account: alice.account }),
      bounty,
      "AlreadyRevealed",
    );
  });

  it("only the creator can judge", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId, revealDeadline } = await createBounty(bounty, creator.account);
    await networkHelpers.time.increaseTo(revealDeadline);

    await viem.assertions.revertWithCustomError(
      bounty.write.judgeAll([bountyId, toHex("x")], { account: alice.account }),
      bounty,
      "NotCreator",
    );
  });

  it("cannot judge before the reveal window closes", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator] = wallets;
    const { bountyId, submissionDeadline } = await createBounty(bounty, creator.account);
    await networkHelpers.time.increaseTo(submissionDeadline);

    await viem.assertions.revertWithCustomError(
      bounty.write.judgeAll([bountyId, toHex("x")], { account: creator.account }),
      bounty,
      "JudgingNotOpen",
    );
  });

  it("cannot finalize a winner who never revealed", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId, submissionDeadline, revealDeadline } = await createBounty(
      bounty,
      creator.account,
    );

    // Alice commits but never reveals.
    await bounty.write.submitCommitment(
      [bountyId, makeCommitment("a", salt("s"), alice.account.address, bountyId)],
      { account: alice.account },
    );
    await networkHelpers.time.increaseTo(revealDeadline);
    await bounty.write.judgeAll([bountyId, toHex("x")], { account: creator.account });

    await viem.assertions.revertWithCustomError(
      bounty.write.finalizeWinner([bountyId, 0n], { account: creator.account }),
      bounty,
      "WinnerNotRevealed",
    );
  });

  it("rejects an out-of-range winner index", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId, submissionDeadline, revealDeadline } = await createBounty(
      bounty,
      creator.account,
    );

    const answer = "a";
    const s = salt("s");
    await bounty.write.submitCommitment(
      [bountyId, makeCommitment(answer, s, alice.account.address, bountyId)],
      { account: alice.account },
    );
    await networkHelpers.time.increaseTo(submissionDeadline);
    await bounty.write.revealAnswer([bountyId, answer, s], { account: alice.account });
    await networkHelpers.time.increaseTo(revealDeadline);
    await bounty.write.judgeAll([bountyId, toHex("x")], { account: creator.account });

    await viem.assertions.revertWithCustomError(
      bounty.write.finalizeWinner([bountyId, 5n], { account: creator.account }),
      bounty,
      "IndexOutOfRange",
    );
  });

  it("rejects creating a bounty with bad deadline ordering", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator] = wallets;
    const now = await networkHelpers.time.latest();

    // revealDeadline <= submissionDeadline
    await viem.assertions.revertWithCustomError(
      bounty.write.createBounty(["p", BigInt(now + 2000), BigInt(now + 1000)], {
        account: creator.account,
      }),
      bounty,
      "BadDeadlines",
    );

    // submissionDeadline in the past
    await viem.assertions.revertWithCustomError(
      bounty.write.createBounty(["p", BigInt(now - 10), BigInt(now + 1000)], {
        account: creator.account,
      }),
      bounty,
      "BadDeadlines",
    );
  });

  it("cannot finalize before judging", async () => {
    const { bounty, wallets } = await networkHelpers.loadFixture(deployFixture);
    const [creator, alice] = wallets;
    const { bountyId, submissionDeadline, revealDeadline } = await createBounty(
      bounty,
      creator.account,
    );
    const answer = "a";
    const s = salt("s");
    await bounty.write.submitCommitment(
      [bountyId, makeCommitment(answer, s, alice.account.address, bountyId)],
      { account: alice.account },
    );
    await networkHelpers.time.increaseTo(submissionDeadline);
    await bounty.write.revealAnswer([bountyId, answer, s], { account: alice.account });
    await networkHelpers.time.increaseTo(revealDeadline);

    await viem.assertions.revertWithCustomError(
      bounty.write.finalizeWinner([bountyId, 0n], { account: creator.account }),
      bounty,
      "NotJudged",
    );
  });
});
