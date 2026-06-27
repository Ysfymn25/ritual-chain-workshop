"use client";

import { WalletConnect } from "@/components/WalletConnect";
import { AuditForm } from "@/components/AuditForm";
import { LookupAudit } from "@/components/LookupAudit";
import { OwnerPanel } from "@/components/OwnerPanel";
import { RITUAL_AUDITOR } from "@/abi/RitualAuditor";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";

export default function Home() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-400 text-sm font-bold text-zinc-950">
              ⛨
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Ritual Audit</h1>
              <p className="text-[11px] leading-tight text-zinc-500">on {ritualChain.name}</p>
            </div>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <section className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            On-chain AI smart-contract auditor.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Paste a Solidity contract. Ritual&apos;s on-chain AI analyzes it for
            vulnerabilities and writes the security report on-chain — a permanent,
            verifiable audit anyone can read back.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
            <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-inset ring-white/10">
              Powered by the Ritual LLM precompile (0x0802)
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-inset ring-white/10">
              Fees paid in native RITUAL
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-inset ring-white/10">
              Reports stored on-chain
            </span>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <AuditForm />
          </div>
          <div className="space-y-6">
            <OwnerPanel />
            <LookupAudit />
          </div>
        </section>

        <footer className="mt-10 border-t border-white/10 pt-4 text-xs text-zinc-600">
          Contract <span className="font-mono">{shortenAddress(RITUAL_AUDITOR, 6)}</span> · Chain{" "}
          {ritualChain.id}
        </footer>
      </main>
    </div>
  );
}
