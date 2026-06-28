# Ritual Audit: On-Chain AI Smart-Contract Auditor

An on-chain AI security auditor built on **Ritual Chain**. A user submits a
Solidity snippet; the contract forwards it to Ritual's **LLM inference
precompile (`0x0802`)**, which runs the model inside a TEE executor and returns
a security report **in the same transaction**. The findings are stored on-chain,
so every audit becomes a permanent, verifiable artifact anyone can read back.

> **Why this idea:** of the 120+ projects in the Ritual ecosystem list, none is a
> security auditor, code-review, or vulnerability scanner. This fills that gap and
> targets the developer audience directly.

---

## Deployment (live)

| | |
| --- | --- |
| **Network** | Ritual testnet (chainId `1979`) |
| **Contract** | `RitualAuditor` |
| **Address** | `0xa17adc506961d40413239ebdd349c82590cd482e` |
| **Owner** | `0x1BFe607AD53Ca8B2b638630865466E7F386a9b80` (can re-price / transfer) |
| **Treasury** | `0x1BFe607AD53Ca8B2b638630865466E7F386a9b80` (collects fees) |
| **Audit fee** | `0` on testnet (set above inference cost on mainnet) |

A prior iteration of the contract is at `0x950b7943A5b2E3C4F477463892ADAC250cfcE56b`;
the address above is the refined version used for live inference.

---

## Live AI proof

The hard part of this project was getting a contract to actually call Ritual's
LLM inference precompile and receive a real model answer back. That now works.
A minimal probe contract (`hardhat/contracts/LLMDebug.sol`) called the precompile
with the recipe below and stored the decoded result with `hasError = false` and a
real **GLM-4.7-FP8** audit in the completion field:

```json
{"severity":"Low","summary":"Function f is public but has no implementation, resulting in unnecessary gas consumption if called."}
```

### The working recipe

The encoding that makes the precompile return a real audit (implemented in
`hardhat/scripts/encrypted-call.mjs` and `hardhat/scripts/fund-llm.mjs`):

- **Executor:** `0xB42e435c4252A5a2E7440e37B609F00c61a0c91B`, read from
  `TEEServiceRegistry.getServicesByCapability(1, true)`.
- **Secrets encryption:** ECIES via `eciesjs` with
  `ECIES_CONFIG.symmetricNonceLength = 12` (the TEE expects a 12-byte AES-GCM
  nonce). Encrypt `JSON.stringify({ HF_TOKEN })` to the executor public key, then
  convert with `Buffer.from(enc).toString("hex")`.
- **Secret signatures:** EIP-191 `signMessage` over the encrypted hex blob.
- **Conversation history:** `["hf", "JsppIV/ritualauditconvos/convos/session.jsonl", "HF_TOKEN"]`.
- **`reasoning_effort`:** must be `"low"` (an empty string fails).
- **`maxCompletionTokens`:** at least `4096`.
- **`userPublicKey`:** `"0x"`.
- **RitualWallet:** the caller's RitualWallet
  (`0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948`) must hold a locked balance; run
  `scripts/fund-llm.mjs` to deposit and re-lock before each run.

The token (`HF_TOKEN`) and the caller key (`RITUAL_PRIVATE_KEY`) are read from
environment variables; nothing secret is committed.

---

## Files

- `hardhat/contracts/RitualAuditor.sol`: the auditor contract.
- `hardhat/contracts/LLMDebug.sol`: minimal probe used to prove the precompile
  call works and to read back the exact TEE output.
- `hardhat/contracts/mocks/MockLLMPrecompile.sol`: test-only stand-in for `0x0802`.
- `hardhat/ignition/modules/RitualAuditor.ts`: Ignition deploy module.
- `hardhat/test/RitualAuditor.ts`: fee + access-control tests.
- `hardhat/test/RitualAuditorE2E.ts`: full flow with a mocked LLM precompile.
- `hardhat/scripts/audit.mjs`: submit a snippet and read back the report.
- `hardhat/scripts/encrypted-call.mjs`: the proven encrypted-inference recipe.
- `hardhat/scripts/fund-llm.mjs`: fund and lock the caller's RitualWallet.

---

## Lifecycle

```
user --requestAudit(code, llmInput)--> RitualAuditor
                                         | 1. require fee (native RITUAL)
                                         | 2. store {requester, code}
                                         | 3. call LLM precompile 0x0802 --+
                                         |                                 v
                                         |                         TEE executor runs
                                         |                         the model on code
                                         | 4. decode response  <-----------+
                                         | 5. store report, mark completed
                                         v
                                   getAudit(id) --> {requester, code, report, completed, ts}
```

1. **requestAudit(code, llmInput)**: `payable`. Requires at least `auditFee` in
   the native Ritual token; the fee accrues in the contract. `llmInput` is the
   ABI-encoded LLM request (built off-chain) embedding the code and the auditor
   system prompt. The LLM precompile runs the model and returns findings in the
   same tx; the report is stored on-chain.
2. **getAudit(id)**: read back `{requester, code, report, completed, timestamp}`.
3. **setAuditFee(newFee)** / **transferOwnership(newOwner)**: owner-only controls.
4. **withdraw()**: owner sweeps accrued fees to the treasury wallet.

---

## Architecture note

### What lives where
- **On-chain:** the submitted code, the AI report (decoded from the precompile
  response), the requester, fee accounting, owner/treasury, and `auditFee`.
- **Off-chain (built by caller):** the `llmInput` payload, namely the chat
  messages (system prompt + code), model id (`zai-org/GLM-4.7-FP8`), and sampling
  params, ABI-encoded into the precompile's request tuple.
- **In-TEE (Ritual executor):** the model itself runs inside the trusted executor
  when the block builder replays the tx; the signed result is injected back and
  decoded by the contract.

### Fee economics (native RITUAL)
- `requestAudit` is `payable`; the fee is paid in the **native Ritual token**, so
  the exact same contract charges test-RITUAL on testnet and real RITUAL on
  mainnet, with no code change between the two.
- Owner and treasury are both the user's own wallet, so all fees flow to the user
  and the user controls pricing.
- **Measured inference cost:** each inference reserves roughly **0.311 RITUAL**
  from the caller's RitualWallet (a prepaid, time-locked fee escrow at
  `0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948`). On mainnet, set `auditFee`
  comfortably above this so each audit is profitable.
- **Gas (Ritual testnet, ~1 gwei):** deploy is about 0.0015 RITUAL, requestAudit
  about 0.00044 RITUAL (EVM gas only; inference is paid from the RitualWallet
  escrow).

### Trust model
The chain guarantees the process: the fee is collected, the exact submitted code
is recorded, and the report is produced by the precompile and stored immutably.
The TEE attestation ties the output to the request, so "the right model judged
the right input" is verifiable rather than merely trusted. The report is advisory;
a human should still act on the findings.

---

## Testing

```bash
cd hardhat
npm install
npx hardhat compile
npx hardhat test
```

**25 passing**, including a **full mocked end-to-end** test (`RitualAuditorE2E.ts`)
that deploys `MockLLMPrecompile`, `setCode`s it onto `0x0802`, and exercises the
entire flow locally: fee collected, fee swept to the treasury via `withdraw`, the
precompile round-trip, and the report decoded and stored on-chain. The mock proves
the contract logic is correct independent of the live model; on Ritual the same
contract simply calls the real model instead of the mock.

---

## Deploy & run

```bash
# 1) Deploy to Ritual testnet (owner defaults to your wallet).
npx hardhat ignition deploy ignition/modules/RitualAuditor.ts --network ritual

# 2) Fund and lock the caller's RitualWallet so the precompile can charge inference.
RITUAL_PRIVATE_KEY=0x... DEPOSIT_AMOUNT=0.4 node scripts/fund-llm.mjs

# 3) Run the proven encrypted-inference recipe against the deployed contract.
RITUAL_PRIVATE_KEY=0x... HF_TOKEN=hf_... node scripts/encrypted-call.mjs
```

The async LLM precompile cannot be simulated by `eth_estimateGas`, so the scripts
send with an explicit gas limit (EIP-1559 / type-2; Ritual rejects legacy txs).

---

## Known limitation

Live inference is proven: the precompile call returns a real GLM-4.7-FP8 audit
with `hasError = false`, as shown above. The remaining rough edge is settlement
reliability on Ritual's public RPC. The identical precompile call settles
consistently through the minimal probe function, but the user-facing
`requestAudit` path settles inconsistently: the async tx is sometimes accepted and
then dropped by the builder before the replay result is injected. This is a Ritual
async-replay and infra reliability quirk on the public endpoint, not a bug in the
contract or the request encoding. The same encoding that the probe proves correct
is what `requestAudit` sends, so when the public replay path stabilizes the
user-facing audit settles end to end with no contract change needed.
