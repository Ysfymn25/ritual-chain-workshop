"use client";

import type { ReactNode } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { AuditForm } from "@/components/AuditForm";
import { LookupAudit } from "@/components/LookupAudit";
import { OwnerPanel } from "@/components/OwnerPanel";
import { Splash } from "@/components/Splash";
import { RitualMark } from "@/components/RitualMark";
import { RITUAL_AUDITOR } from "@/abi/RitualAuditor";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";

const explorerBase = ritualChain.blockExplorers?.default.url;

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PasteIcon = (
  <svg {...iconProps}>
    <path d="M9 3h6a1 1 0 011 1v1h1a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h1V4a1 1 0 011-1z" />
    <path d="M9 12h6M9 16h4" />
  </svg>
);

const AiIcon = (
  <svg {...iconProps}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
    <path d="M9 1.5v3M15 1.5v3M9 19.5v3M15 19.5v3M1.5 9h3M1.5 15h3M19.5 9h3M19.5 15h3" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const ShieldIcon = (
  <svg {...iconProps}>
    <path d="M12 3l7 3v5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const STEPS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: PasteIcon,
    title: "Paste your contract",
    body: "Drop in any Solidity snippet you want a second opinion on.",
  },
  {
    icon: AiIcon,
    title: "AI reviews it on chain",
    body: "Ritual runs the model inside a TEE and writes the report back on chain.",
  },
  {
    icon: ShieldIcon,
    title: "Read a permanent report",
    body: "Severity, issues and fixes, stored forever and verifiable by anyone.",
  },
];

const CHECKS = [
  "Reentrancy",
  "Access control",
  "Integer overflow",
  "Unchecked calls",
  "Bad randomness",
  "Front running",
];

export default function Home() {
  return (
    <div className="relative min-h-full overflow-hidden">
      <Splash />

      {/* decorative glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-green-500/15 blur-[120px]"
      />

      <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-black glow-ring animate-floaty ring-1 ring-green-400/30">
              <RitualMark size={20} />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Ritual Audit</h1>
              <p className="text-[11px] leading-tight text-zinc-500">on {ritualChain.name}</p>
            </div>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <section className="mb-10 animate-fade-up text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse-glow" />
            Live on {ritualChain.name}
          </span>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Let an AI <span className="text-gradient">audit your contract</span>, right on chain
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
            Paste your Solidity, pay a small fee in RITUAL, and get a security report written
            straight to the chain. No backend, no trust me bro. Just a result anyone can verify.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-zinc-300">
            <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-inset ring-white/10">
              ⚡ Powered by the Ritual LLM precompile
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-inset ring-white/10">
              💎 Fees in native RITUAL
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-inset ring-white/10">
              ♾️ Reports stored on chain
            </span>
          </div>
        </section>

        {/* How it works */}
        <section className="mb-10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className="group rounded-2xl border border-white/10 bg-zinc-900/40 p-5 transition-colors hover:border-green-400/40"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-green-400/20 to-emerald-500/5 text-green-300 ring-1 ring-inset ring-green-400/20 transition-transform group-hover:scale-105">
                    {s.icon}
                  </span>
                  <span className="text-2xl font-bold text-white/5">{i + 1}</span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-zinc-100">{s.title}</h3>
                <p className="mt-1 text-xs text-zinc-400">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* App */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <AuditForm />
          </div>
          <div className="space-y-6">
            <OwnerPanel />

            <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4">
              <h3 className="text-sm font-semibold text-zinc-100">What the auditor looks for</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {CHECKS.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-300 ring-1 ring-inset ring-white/10"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            <LookupAudit />
          </div>
        </section>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-zinc-600">
          <span className="flex items-center gap-1.5">
            <RitualMark size={12} className="opacity-70" />
            Contract{" "}
            {explorerBase ? (
              <a
                href={`${explorerBase}/address/${RITUAL_AUDITOR}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-zinc-400 hover:text-green-300"
              >
                {shortenAddress(RITUAL_AUDITOR, 6)}
              </a>
            ) : (
              <span className="font-mono">{shortenAddress(RITUAL_AUDITOR, 6)}</span>
            )}{" "}
            on chain {ritualChain.id}
          </span>
          <span>Built on Ritual</span>
        </footer>
      </main>
    </div>
  );
}
