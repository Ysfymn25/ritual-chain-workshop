"use client";

import { useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";

function walletGlyph(name: string) {
  const n = name.toLowerCase();
  if (n.includes("metamask")) return "🦊";
  if (n.includes("walletconnect")) return "🔗";
  if (n.includes("coinbase")) return "🪙";
  return "👛";
}

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const wrongChain = isConnected && chainId !== ritualChain.id;

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        {wrongChain && (
          <button
            onClick={() => switchChain({ chainId: ritualChain.id })}
            className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25"
          >
            Switch network
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setMenu((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm transition-colors hover:border-green-400/40"
          >
            <span
              className={`h-2 w-2 rounded-full ${wrongChain ? "bg-amber-400" : "bg-green-400 animate-pulse-glow"}`}
            />
            <span className="font-mono text-zinc-100">{shortenAddress(address)}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-zinc-500">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {menu && (
            <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur shadow-2xl shadow-black/40">
              <div className="border-b border-white/10 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Connected</p>
                <p className="mt-0.5 break-all font-mono text-xs text-zinc-200">{address}</p>
              </div>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/5"
              >
                📋 {copied ? "Copied" : "Copy address"}
              </button>
              <button
                onClick={() => {
                  disconnect();
                  setMenu(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-300 hover:bg-red-500/10"
              >
                ⏏ Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Dedupe connectors by name (injected + metaMask can overlap).
  const seen = new Set<string>();
  const list = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 px-3.5 py-2 text-sm font-semibold text-zinc-950 shadow-lg shadow-green-500/20 transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 7a2 2 0 012-2h12a2 2 0 012 2v1h-3a3 3 0 100 6h3v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
            fill="currentColor"
          />
          <circle cx="16" cy="11" r="1.4" fill="#052e16" />
        </svg>
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur shadow-2xl shadow-black/40">
          <div className="border-b border-white/10 px-3 py-2.5">
            <p className="text-xs font-semibold text-zinc-200">Choose a wallet</p>
            <p className="text-[11px] text-zinc-500">to connect on {ritualChain.name}</p>
          </div>
          {list.length === 0 && (
            <div className="px-3 py-3 text-xs text-zinc-500">No wallet connectors found.</div>
          )}
          {list.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                connect({ connector });
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-100 transition-colors hover:bg-green-400/10"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-base ring-1 ring-inset ring-white/10">
                {walletGlyph(connector.name)}
              </span>
              <span className="font-medium">{connector.name}</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className="ml-auto text-zinc-600"
              >
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
