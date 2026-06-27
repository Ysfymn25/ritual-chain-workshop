"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { RITUAL_AUDITOR, ritualAuditorAbi } from "@/abi/RitualAuditor";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import { AuditReportDisplay } from "@/components/AuditReportDisplay";
import { Card, CardHeader, CardBody, Field, Input, Button, Notice, Badge } from "@/components/ui";

export function LookupAudit() {
  const [input, setInput] = useState("");
  const [queryId, setQueryId] = useState<bigint | null>(null);

  const auditQ = useReadContract({
    address: RITUAL_AUDITOR,
    abi: ritualAuditorAbi,
    functionName: "getAudit",
    args: queryId !== null ? [queryId] : undefined,
    chainId: ritualChain.id,
    query: { enabled: queryId !== null, refetchInterval: queryId !== null ? 5_000 : undefined },
  });

  const data = auditQ.data as
    | readonly [string, string, string, boolean, bigint]
    | undefined;

  function handleLoad(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim() === "") return;
    try {
      setQueryId(BigInt(input.trim()));
    } catch {
      /* ignore bad input */
    }
  }

  const exists = data && data[0] !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Look up an audit" subtitle="Read any past audit by its id." />
        <CardBody>
          <form onSubmit={handleLoad} className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Audit id">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="0"
                  inputMode="numeric"
                />
              </Field>
            </div>
            <Button type="submit">Load</Button>
          </form>

          {queryId !== null && !exists && (
            <div className="mt-3">
              <Notice tone="zinc">No audit found for id {queryId.toString()}.</Notice>
            </div>
          )}

          {exists && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <Badge tone={data![3] ? "green" : "amber"}>
                {data![3] ? "Completed" : "Pending AI"}
              </Badge>
              <span>
                Requester <span className="font-mono">{shortenAddress(data![0], 4)}</span>
              </span>
            </div>
          )}
        </CardBody>
      </Card>

      {exists && data![3] && data![2] && <AuditReportDisplay report={data![2]} />}
    </div>
  );
}
