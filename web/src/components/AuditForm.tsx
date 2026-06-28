"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { RITUAL_AUDITOR, ritualAuditorAbi } from "@/abi/RitualAuditor";
import { ritualChain } from "@/config/wagmi";
import { AuditReportDisplay } from "@/components/AuditReportDisplay";
import { RitualMark } from "@/components/RitualMark";
import { Card, CardHeader, CardBody, Field, Textarea, Button, Notice } from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

const SAMPLE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Vault {
    mapping(address => uint256) public balances;
    address public owner;
    constructor() { owner = msg.sender; }
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "low");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok);
        balances[msg.sender] -= amount; // state updated AFTER external call
    }
    function setOwner(address newOwner) external { owner = newOwner; }
    function drain() external { payable(msg.sender).transfer(address(this).balance); }
}`;

export function AuditForm() {
  const [code, setCode] = useState("");
  const [pendingId, setPendingId] = useState<bigint | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Poll the audit until the AI report lands on-chain.
  const auditQ = useReadContract({
    address: RITUAL_AUDITOR,
    abi: ritualAuditorAbi,
    functionName: "getAudit",
    args: pendingId !== null ? [pendingId] : undefined,
    chainId: ritualChain.id,
    query: { enabled: pendingId !== null, refetchInterval: 5_000 },
  });

  const audit = auditQ.data as
    | readonly [`0x${string}`, string, string, boolean, bigint]
    | undefined;
  const completed = Boolean(audit && audit[3]);
  const report = audit ? audit[2] : "";
  const waiting = pendingId !== null && !completed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError(null);
    setPendingId(null);
    setTxHash(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "request failed");
      setTxHash(data.txHash);
      setPendingId(BigInt(data.auditId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Audit a contract"
          subtitle="Paste Solidity. The onchain AI returns a security report. No wallet needed."
        />
        <CardBody className="space-y-3">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Solidity code" hint="Your code is sent to the auditor and stored on chain with the result.">
              <Textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={12}
                placeholder="contract MyContract { ... }"
                className="font-mono text-xs"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!code.trim() || submitting || waiting} className="flex-1">
                {submitting ? "Submitting…" : waiting ? "Auditing…" : "Audit"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCode(SAMPLE)}
                disabled={submitting || waiting}
              >
                Load vulnerable sample
              </Button>
            </div>

            {error && <Notice tone="red">{error}</Notice>}
          </form>
        </CardBody>
      </Card>

      {waiting && (
        <Card>
          <CardBody>
            <div className="flex items-center gap-3 text-sm text-zinc-200">
              <RitualMark size={22} className="animate-spin-slow" />
              The AI is analyzing your contract on chain (audit #{pendingId?.toString()})…
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Ritual runs the model inside a TEE and writes the report back on chain. This usually
              takes a couple of minutes. The Ritual testnet can occasionally drop the async job; if
              nothing appears after a few minutes, just run it again.
            </p>
            {txHash && explorerBase && (
              <a
                href={`${explorerBase}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-green-400 hover:text-green-300 underline underline-offset-2"
              >
                View transaction
              </a>
            )}
          </CardBody>
        </Card>
      )}

      {completed && report && <AuditReportDisplay report={report} />}
    </div>
  );
}
