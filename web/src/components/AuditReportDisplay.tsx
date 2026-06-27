"use client";

import { decodeAuditReport, type Severity } from "@/lib/auditReport";
import { Card, CardHeader, CardBody, Badge, Notice } from "@/components/ui";

const SEVERITY_TONE: Record<Severity, "green" | "amber" | "indigo" | "red" | "zinc"> = {
  none: "green",
  low: "indigo",
  medium: "amber",
  high: "red",
  critical: "red",
};

export function AuditReportDisplay({ report }: { report: string }) {
  const decoded = decodeAuditReport(report);
  if (!decoded) return null;

  const { raw, parsed } = decoded;

  return (
    <Card>
      <CardHeader
        title="AI security audit"
        subtitle="Produced on chain by the Ritual LLM precompile."
        action={
          parsed ? (
            <Badge tone={SEVERITY_TONE[parsed.severity]}>
              Severity: {parsed.severity.toUpperCase()}
            </Badge>
          ) : (
            <Badge tone="amber">Unparsed</Badge>
          )
        }
      />
      <CardBody className="space-y-3">
        {parsed ? (
          <>
            {parsed.issues.length > 0 ? (
              <ol className="space-y-3">
                {parsed.issues.map((issue, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-500/20 text-[11px] font-bold text-red-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-100">{issue.title}</p>
                        <p className="mt-1 text-xs text-zinc-300">{issue.detail}</p>
                        {issue.recommendation && (
                          <p className="mt-1.5 text-xs text-emerald-300">
                            <span className="text-emerald-500/70">Fix: </span>
                            {issue.recommendation}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <Notice tone="green">No issues found by the AI auditor.</Notice>
            )}

            {parsed.summary && (
              <div className="rounded-xl bg-black/20 px-3 py-2 text-sm text-zinc-200">
                <span className="text-zinc-500">Summary: </span>
                {parsed.summary}
              </div>
            )}
          </>
        ) : (
          <>
            <Notice tone="amber">
              Couldn&apos;t parse the report as JSON. Showing the raw model output.
            </Notice>
            <pre className="max-h-72 overflow-auto rounded-xl bg-black/40 p-3 font-mono text-xs text-zinc-300 whitespace-pre-wrap break-words">
              {raw}
            </pre>
          </>
        )}
      </CardBody>
    </Card>
  );
}
