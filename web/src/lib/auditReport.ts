export type Severity = "none" | "low" | "medium" | "high" | "critical";

export type AuditIssue = {
  title: string;
  detail: string;
  recommendation: string;
};

export type AuditResult = {
  severity: Severity;
  issues: AuditIssue[];
  summary: string;
};

export type DecodedReport = {
  /** Raw model text. */
  raw: string;
  /** Parsed audit result, or null if the text wasn't parseable JSON. */
  parsed: AuditResult | null;
};

const SEVERITIES: Severity[] = ["none", "low", "medium", "high", "critical"];

/** Decode the on-chain `report` string into a structured audit result. */
export function decodeAuditReport(report?: string): DecodedReport | null {
  if (!report || report.trim() === "") return null;
  const parsed = tryParse(report);
  return { raw: report, parsed };
}

function tryParse(text: string): AuditResult | null {
  const candidate = extractJson(text);
  if (!candidate) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const severity = (
    typeof o.severity === "string" && SEVERITIES.includes(o.severity as Severity)
      ? o.severity
      : "none"
  ) as Severity;

  const issues: AuditIssue[] = Array.isArray(o.issues)
    ? (o.issues as unknown[])
        .map((i) => {
          if (!i || typeof i !== "object") return null;
          const e = i as Record<string, unknown>;
          return {
            title: typeof e.title === "string" ? e.title : String(e.title ?? ""),
            detail: typeof e.detail === "string" ? e.detail : String(e.detail ?? ""),
            recommendation:
              typeof e.recommendation === "string"
                ? e.recommendation
                : String(e.recommendation ?? ""),
          } satisfies AuditIssue;
        })
        .filter((i): i is AuditIssue => i !== null)
    : [];

  return {
    severity,
    issues,
    summary: typeof o.summary === "string" ? o.summary : "",
  };
}

/** Strip markdown fences and isolate the first {...} block. */
function extractJson(text: string): string | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}
