# Bounty Judge - Commit-Reveal Submission

A bounty system where answers stay hidden until judging, so nobody can copy and
"improve on" a rival's submission before the deadline. This covers the **Required
Track** (commit-reveal on any EVM chain) and an **architecture note** for the
**Advanced Track** (Ritual TEE-backed hidden submissions).

## Files

- `contracts/BountyJudge.sol` - the commit-reveal contract.
- `test/BountyJudge.ts` - tests for every reveal case (15 cases, all passing).
- `ignition/modules/BountyJudge.ts` - Hardhat Ignition deployment module.
- This README - lifecycle, test plan, architecture note, reflection.

## How to run

This targets the forked workshop repo, which is **Hardhat 3 + viem + Ignition**.
Drop `BountyJudge.sol` into `hardhat/contracts/`, `BountyJudge.ts` into
`hardhat/test/`, and the Ignition module into `hardhat/ignition/modules/`, then:

```bash
cd hardhat
npm install
npx hardhat compile
npx hardhat test
```

The tests run on the `node:test` runner via `@nomicfoundation/hardhat-toolbox-viem`,
using `viem.assertions` for custom-error reverts and `networkHelpers.time` for time
travel between phases. Verified locally: **15 passing**.

### Deploy (Sepolia / any EVM chain)

The forked `hardhat.config.ts` already defines a `sepolia` network reading
`SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` via `configVariable()`. Set them
(keystore or env), fund the deployer, then:

```bash
npx hardhat ignition deploy ignition/modules/BountyJudge.ts --network sepolia
```

For Ritual testnet, the config also ships a `ritual` network (chainId `1979`,
RPC `https://rpc.ritualfoundation.org`); deploy with `--network ritual`.

---

## Lifecycle

The contract enforces four ordered phases per bounty, gated by two timestamps
(`submissionDeadline`, `revealDeadline`).

1. **Create** - `createBounty(prompt, submissionDeadline, revealDeadline)`
   The caller becomes the judging authority. Deadlines must be strictly increasing
   and in the future.

2. **Submit (hidden)** - `submitCommitment(bountyId, commitment)`
   Accepted only **before** `submissionDeadline`. Participants post **only** a
   hash. The answer is never on-chain in this phase.

   `commitment = keccak256(abi.encode(answer, salt, msg.sender, bountyId))`

   - `salt` makes the hash non-guessable (stops dictionary/brute-force on short answers).
   - `msg.sender` binds the commitment to its owner, so no one can replay or steal a reveal.
   - `bountyId` stops a commitment made for one bounty being reused in another.
   - Use the `computeCommitment(...)` view (via `eth_call`) to build the hash off-chain.

3. **Reveal** - `revealAnswer(bountyId, answer, salt)`
   Accepted only in `[submissionDeadline, revealDeadline)`. The contract recomputes
   the hash and reverts unless it matches the stored commitment. Only matching
   reveals are marked `revealed = true` and become eligible for judging.

4. **Judge** - `judgeAll(bountyId, llmInput)`
   Creator-only, after `revealDeadline`. `llmInput` is the exact byte payload of all
   revealed answers fed to the LLM in **one batch call** (not one call per answer).
   The contract counts revealed entries and stores `keccak256(llmInput)` so the
   judging input is auditable and tamper-evident.

5. **Finalize** - `finalizeWinner(bountyId, winnerIndex)`
   Creator-only, after judging. `winnerIndex` points into the public `participants`
   array; the winner must have revealed. Emits `WinnerFinalized`.

---

## Test plan (reveal cases)

`test/BountyJudge.ts` covers 15 cases (all passing):

| # | Case | Expected |
|---|------|----------|
| 1 | Full happy path: commit → reveal → judge → finalize → read winner | succeeds; answer hidden until reveal |
| 2 | Reveal with wrong **salt** | revert `CommitmentMismatch` |
| 3 | Reveal with tampered **answer** | revert `CommitmentMismatch` |
| 4 | Someone else tries to reveal your commitment | revert `NothingToReveal` (commitment bound to sender) |
| 5 | Reveal **before** submission deadline | revert `RevealNotOpen` |
| 6 | Reveal **after** reveal deadline | revert `RevealClosed` |
| 7 | Commit twice | revert `AlreadyCommitted` |
| 8 | Commit after submission deadline | revert `SubmissionClosed` |
| 9 | Double reveal | revert `AlreadyRevealed` |
| 10 | Non-creator judges | revert `NotCreator` |
| 11 | Judging before reveal window closes | revert `JudgingNotOpen` |
| 12 | Finalize an un-revealed winner | revert `WinnerNotRevealed` |
| 13 | Out-of-range winner index | revert `IndexOutOfRange` |
| 14 | Bad deadline ordering / past deadline at creation | revert `BadDeadlines` |
| 15 | Finalize before judging | revert `NotJudged` |

A useful manual check: during phase 2, call `getSubmission(bountyId, addr)` and
confirm `answer == ""` and only the hash is visible - proof that nothing leaks early.

---

## Architecture note

### Required track (any EVM chain)

- **On-chain:** bounty metadata, deadlines, the participant list, commitment hashes,
  the revealed answers (after reveal), `keccak256(llmInput)`, and the winner index.
- **Off-chain:** the AI judge. After reveal closes, an off-chain process reads the
  revealed answers, runs the LLM once over the batch, and the creator records the
  decision via `judgeAll` + `finalizeWinner`.
- **Trust model:** the chain guarantees the *process* (hidden until reveal, valid
  reveals only, deadlines enforced). It does **not** hide answers after reveal - in this track, answers become public, which is what makes judging auditable. The
  weak point is that the off-chain judge is trusted to run the model honestly; the
  stored `judgeInputHash` only proves *what* was judged, not that the model ran.

### Advanced track (Ritual TEE-backed)

Goal: answers stay **encrypted** even after the deadline, and only become plaintext
**inside a TEE** at the judging step - closing the gap above.

- **Where plaintext exists:** (a) briefly in the participant's own browser when they
  write the answer, and (b) inside the TEE enclave during the single batch-judging
  call. Nowhere else - not on-chain, not on the creator's server.
- **On-chain:** the commitment hash **and** the answer encrypted to a key the TEE
  controls (ECIES / Ritual's secrets mechanism, e.g. a `SECRET_NAME` reference that
  is substituted with the decrypted value only inside the enclave). Plus deadlines,
  participant list, and the final ranking/result returned by the judge.
- **Off-chain / in-enclave:** at judging, the contract calls the **LLM precompile
  (0x0802)** once with the full batch. The Ritual executor decrypts the submissions
  inside the TEE, runs the model over all of them together, and settles the ranked
  result on-chain in the same async flow. Because it is one batched call (not one
  call per answer), the model can compare submissions directly and cost stays bounded.
- **Why it's stronger:** the prompt/answer never leak to the operator, and the
  attestation ties the output to the exact request - so "the right model judged the
  right inputs" is verifiable, not merely trusted.

Relevant Ritual pieces: LLM precompile `0x0802` (batch judging), the secrets/ECIES
precompile for encrypted inputs and PII handling, and TEE-EOVMT for attested
off-chain execution settled on-chain.

---

## Reflection

**What should be public, what should stay hidden, and what should be decided by AI
versus by a human in a bounty system?**

In a fair bounty system the prompt, the rules, the deadlines, the participant list,
and the commitment hashes should all be public, because they let anyone verify the
process was not tampered with. The answers themselves must stay hidden during the
submission phase - only their commitment hashes live on-chain - so that no one can
read and improve on a rival's work before the deadline. After the deadline the
answers become checkable, either by going public (basic track) or by being decrypted
only inside a TEE (advanced track), which is what makes judging auditable. The
mechanical, objective parts - verifying a reveal matches its commitment, enforcing
deadlines, and tallying who is eligible - should be decided by the contract, because
code is deterministic and trustless. The subjective quality comparison across many
answers is where an AI judge adds value, since it can score a whole batch
consistently against a rubric without favoritism or fatigue. A human, however, should
still own the final outcome: defining the rubric, handling edge cases and disputes,
and confirming or overriding the AI's recommendation before any reward moves. The
healthiest split is therefore that the chain guarantees integrity, the AI proposes a
ranking, and a human ratifies the result - keeping the system both scalable and
accountable.
