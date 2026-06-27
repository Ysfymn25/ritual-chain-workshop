"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { RITUAL_AUDITOR, ritualAuditorAbi } from "@/abi/RitualAuditor";
import { buildAuditLlmInput } from "@/lib/auditEncoder";
import { ritualChain } from "@/config/wagmi";
import { useWriteTx } from "@/hooks/useWriteTx";
import { useRitualWalletStatus } from "@/hooks/useRitualWalletStatus";
import { RitualWalletPanel } from "@/components/RitualWalletPanel";
import { AuditReportDisplay } from "@/components/AuditReportDisplay";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Textarea,
  Button,
  Spinner,
  TxStatus,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

const SAMPLE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract Vault {
    mapping(address => uint256) public balance;
    function deposit() external payable { balance[msg.sender] += msg.value; }
    function withdraw() external {
        (bool ok, ) = msg.sender.call{value: balance[msg.sender]}("");
        require(ok);
        balance[msg.sender] = 0; // state updated AFTER external call
    }
}`;

export function AuditForm({ onAudited }: { onAudited?: (id: bigint) => void }) {
  const { address, isConnected } = useAccount();
  const [code, setCode] = useState("");
  const [pendingId, setPendingId] = useState<bigint | null>(null);

  const wallet = useRitualWalletStatus(address);

  const feeQ = useReadContract({
    address: RITUAL_AUDITOR,
    abi: ritualAuditorAbi,
    functionName: "auditFee",
    chainId: ritualChain.id,
  });

  const nextIdQ = useReadContract({
    address: RITUAL_AUDITOR,
    abi: ritualAuditorAbi,
    functionName: "nextAuditId",
    chainId: ritualChain.id,
    query: { refetchInterval: 10_000 },
  });

  // Once submitted, poll the audit until the AI report lands.
  const auditQ = useReadContract({
    address: RITUAL_AUDITOR,
    abi: ritualAuditorAbi,
    functionName: "getAudit",
    args: pendingId !== null ? [pendingId] : undefined,
    chainId: ritualChain.id,
    query: { enabled: pendingId !== null, refetchInterval: 5_000 },
  });

  const tx = useWriteTx(() => {
    if (nextIdQ.data !== undefined) {
      const id = nextIdQ.data as bigint;
      setPendingId(id);
      onAudited?.(id);
    }
  });

  const fee = (feeQ.data as bigint | undefined) ?? 0n;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !isConnected) return;
    const llmInput = buildAuditLlmInput(code.trim());
    try {
      await tx.run({
        address: RITUAL_AUDITOR,
        abi: ritualAuditorAbi,
        functionName: "requestAudit",
        args: [code.trim(), llmInput],
        value: fee,
        // The async LLM precompile can't be gas-estimated; set an explicit limit.
        gas: 8_000_000n,
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  const audit = auditQ.data as
    | readonly [`0x${string}`, string, string, boolean, bigint]
    | undefined;
  const completed = Boolean(audit && audit[3]);
  const report = audit ? audit[2] : "";
  const waitingForAI = pendingId !== null && tx.state === "confirmed" && !completed;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Audit a contract"
          subtitle="Paste Solidity. The on-chain AI returns a security report."
          action={
            feeQ.data !== undefined ? (
              <span className="text-xs text-zinc-400">
                Fee: <span className="font-mono text-zinc-200">{formatEther(fee)} RITUAL</span>
              </span>
            ) : null
          }
        />
        <CardBody className="space-y-3">
          <RitualWalletPanel status={wallet} onDeposited={wallet.refetch} />

          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Solidity code" hint="Pasted code is stored on-chain with the audit.">
              <Textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={12}
                placeholder="contract MyContract { ... }"
                className="font-mono text-xs"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={!isConnected || !code.trim() || tx.isBusy || !wallet.ready}
                className="flex-1"
              >
                {tx.isBusy
                  ? "Submitting…"
                  : !wallet.ready
                    ? "Fund RitualWallet to audit"
                    : `Audit (${formatEther(fee)} RITUAL)`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCode(SAMPLE)}
                disabled={tx.isBusy}
              >
                Load vulnerable sample
              </Button>
            </div>

            {!isConnected && (
              <p className="text-xs text-zinc-500">Connect your wallet to run an audit.</p>
            )}
            <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
          </form>
        </CardBody>
      </Card>

      {waitingForAI && (
        <Card>
          <CardBody>
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <Spinner /> AI is analyzing the contract on-chain (audit #{pendingId?.toString()})…
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              The Ritual LLM precompile runs the model inside a TEE; the report appears here once
              the async inference settles.
            </p>
          </CardBody>
        </Card>
      )}

      {completed && report && <AuditReportDisplay report={report} />}
    </div>
  );
}
