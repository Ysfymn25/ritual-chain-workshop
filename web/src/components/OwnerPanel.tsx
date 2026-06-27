"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatEther, parseEther } from "viem";
import { RITUAL_AUDITOR, ritualAuditorAbi } from "@/abi/RitualAuditor";
import { ritualChain } from "@/config/wagmi";
import { useWriteTx } from "@/hooks/useWriteTx";
import { Card, CardHeader, CardBody, Field, Input, Button, TxStatus, Badge } from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

/** Fee management — only rendered for the contract owner. */
export function OwnerPanel() {
  const { address } = useAccount();
  const [newFee, setNewFee] = useState("");

  const ownerQ = useReadContract({
    address: RITUAL_AUDITOR,
    abi: ritualAuditorAbi,
    functionName: "owner",
    chainId: ritualChain.id,
  });
  const feeQ = useReadContract({
    address: RITUAL_AUDITOR,
    abi: ritualAuditorAbi,
    functionName: "auditFee",
    chainId: ritualChain.id,
    query: { refetchInterval: 10_000 },
  });

  const tx = useWriteTx(() => {
    setNewFee("");
    void feeQ.refetch();
  });

  const owner = ownerQ.data as `0x${string}` | undefined;
  const isOwner =
    Boolean(address) && Boolean(owner) && address!.toLowerCase() === owner!.toLowerCase();
  if (!isOwner) return null;

  async function handleSetFee(e: React.FormEvent) {
    e.preventDefault();
    if (newFee.trim() === "") return;
    let value: bigint;
    try {
      value = parseEther(newFee.trim());
    } catch {
      return;
    }
    try {
      await tx.run({
        address: RITUAL_AUDITOR,
        abi: ritualAuditorAbi,
        functionName: "setAuditFee",
        args: [value],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Owner controls"
        subtitle="Re-price audits. Fees are paid to your treasury wallet."
        action={<Badge tone="indigo">You are the owner</Badge>}
      />
      <CardBody>
        <p className="mb-3 text-xs text-zinc-400">
          Current fee:{" "}
          <span className="font-mono text-zinc-200">
            {feeQ.data !== undefined ? formatEther(feeQ.data as bigint) : "…"} RITUAL
          </span>
        </p>
        <form onSubmit={handleSetFee} className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="New fee (RITUAL)">
              <Input
                value={newFee}
                onChange={(e) => setNewFee(e.target.value)}
                placeholder="0.01"
                inputMode="decimal"
              />
            </Field>
          </div>
          <Button type="submit" disabled={tx.isBusy || !newFee.trim()}>
            {tx.isBusy ? "Updating…" : "Set fee"}
          </Button>
        </form>
        <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
      </CardBody>
    </Card>
  );
}
