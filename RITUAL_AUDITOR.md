# Ritual Audit — On-Chain AI Smart-Contract Auditor

An on-chain AI security auditor built on **Ritual Chain**. A user submits a
Solidity snippet; the contract forwards it to Ritual's **LLM inference
precompile (`0x0802`)**, which runs the model inside a TEE executor and returns
a security report **in the same transaction**. The findings are stored on-chain,
so every audit becomes a permanent, verifiable artifact anyone can read back.

> **Why this idea:** of the 120+ projects in the Ritual ecosystem list, none is a
> security auditor / code-review / vulnerability scanner. This fills that gap and
> targets the developer audience directly.

---

## Deployment (live)

| | |
| --- | --- |
| **Network** | Ritual testnet (chainId `1979`) |
| **Contract** | `RitualAuditor` |
| **Address** | `0x950b7943A5b2E3C4F477463892ADAC250cfcE56b` |
| **Deploy tx** | `0x6dbcccb8a6fbd58cb26267724c13486742a90dd246dc1bd9bf848dac05ba38f0` |
| **Owner** | `0x1BFe607AD53Ca8B2b638630865466E7F386a9b80` (can re-price / transfer) |
| **Treasury** | `0x1BFe607AD53Ca8B2b638630865466E7F386a9b80` (collects fees) |

---

## Files

- `hardhat/contracts/RitualAuditor.sol` — the auditor contract.
- `hardhat/contracts/mocks/MockLLMPrecompile.sol` — test-only stand-in for `0x0802`.
- `hardhat/ignition/modules/RitualAuditor.ts` — Ignition deploy module.
- `hardhat/test/RitualAuditor.ts` — fee + access-control tests.
- `hardhat/test/RitualAuditorE2E.ts` — full flow with a mocked LLM precompile.
- `hardhat/scripts/audit.mjs` — submit a snippet and read back the report.
- `hardhat/scripts/fund-llm.mjs` — fund the caller's RitualWallet for inference.

---

## Lifecycle

```
user ──requestAudit(code, llmInput)──▶ RitualAuditor
                                         │ 1. require fee (native RITUAL)
                                         │ 2. store {requester, code}
                                         │ 3. forward fee ──▶ treasury wallet
                                         │ 4. call LLM precompile 0x0802 ─┐
                                         │                                ▼
                                         │                        TEE executor runs
                                         │                        the model on `code`
                                         │ 5. decode response  ◀──────────┘
                                         │ 6. store report, mark completed
                                         ▼
                                   getAudit(id) ──▶ {requester, code, report, completed, ts}
```

1. **requestAudit(code, llmInput)** — `payable`. Requires at least `auditFee` in
   the native Ritual token; the fee is forwarded to the treasury. `llmInput` is
   the ABI-encoded LLM request (built off-chain) embedding the code + the auditor
   system prompt. The LLM precompile runs the model and returns findings in the
   same tx; the report is stored on-chain.
2. **getAudit(id)** — read back `{requester, code, report, completed, timestamp}`.
3. **setAuditFee(newFee)** / **transferOwnership(newOwner)** — owner-only controls.

---

## Architecture note

### What lives where
- **On-chain:** the submitted code, the AI report (decoded from the precompile
  response), the requester, fee accounting, owner/treasury, and `auditFee`.
- **Off-chain (built by caller):** the `llmInput` payload — the chat messages
  (system prompt + code), model id (`zai-org/GLM-4.7-FP8`), and sampling params,
  ABI-encoded into the precompile's request tuple.
- **In-TEE (Ritual executor):** the model itself runs inside the trusted executor
  when the block builder replays the tx; the signed result is injected back and
  decoded by the contract.

### Fee economics (native RITUAL)
- `requestAudit` is `payable`; the fee is paid in the **native Ritual token**, so
  the exact same contract charges test-RITUAL on testnet and real RITUAL on
  mainnet — **no code change** between the two.
- Owner and treasury are both the user's own wallet, so **all fees flow to the
  user** and the user controls pricing.
- **Measured inference cost:** each inference reserves **~0.311 RITUAL** from the
  caller's RitualWallet (a prepaid, time-locked fee escrow at
  `0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948`). On mainnet, set `auditFee`
  comfortably above this so each audit is profitable.
- **Gas (Ritual testnet, ~1 gwei):** deploy ≈ 0.0015 RITUAL, requestAudit ≈
  0.00044 RITUAL (EVM gas only; inference is paid from the RitualWallet escrow).

### Trust model
The chain guarantees the process: the fee is collected, the exact submitted code
is recorded, and the report is produced by the precompile and stored immutably.
The TEE attestation ties the output to the request, so "the right model judged
the right input" is verifiable rather than merely trusted. The report is advisory
— a human should still act on the findings.

---

## Testing

```bash
cd hardhat
npm install
npx hardhat compile
npx hardhat test
```

**24 passing**, including a **full mocked end-to-end** test (`RitualAuditorE2E.ts`)
that deploys `MockLLMPrecompile`, `setCode`s it onto `0x0802`, and exercises the
entire flow locally — fee collected, **fee forwarded to the treasury**, the
precompile round-trip, and the report decoded and stored on-chain. The mock proves
the contract logic is correct independent of the live model; on Ritual the same
contract simply calls the real model instead of the mock.

---

## Deploy & run

```bash
# 1) Deploy to Ritual testnet (owner defaults to your wallet).
npx hardhat ignition deploy ignition/modules/RitualAuditor.ts --network ritual

# 2) Fund the caller's RitualWallet so the LLM precompile can charge inference.
RITUAL_PRIVATE_KEY=0x... DEPOSIT_AMOUNT=0.4 node scripts/fund-llm.mjs

# 3) Submit a snippet for an AI audit and read the report.
RITUAL_PRIVATE_KEY=0x... AUDITOR_ADDRESS=0x950b... node scripts/audit.mjs "contract C { ... }"
```

The async LLM precompile can't be simulated by `eth_estimateGas`, so `audit.mjs`
sends with an explicit gas limit (EIP-1559 / type-2; Ritual rejects legacy txs).

---

## Known limitation — live inference

The contract, fee logic, deployment, and full mocked flow all work and are tested.
The **live model call on Ritual testnet does not yet settle**: the inference tx is
accepted but dropped by the builder, because the **exact Ritual LLM precompile
request ABI is not yet publicly pinned down** — a limitation the workshop's own
encoder documents (`web/src/lib/ritualLlm.ts`, README §"The Ritual LLM encoder":
*"The exact Ritual LLM precompile ABI is not yet publicly pinned down… best-effort
tuple layout… only this file needs to change when the real ABI is published"*).

The request encoding is isolated in `scripts/audit.mjs` (mirroring the workshop's
`buildJudgeAllLlmInput`). When Ritual publishes the real request ABI, only that
encoding changes and the live audit works end-to-end — no contract change needed.
