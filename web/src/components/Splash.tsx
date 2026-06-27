"use client";

import { useEffect, useState } from "react";
import { RitualMark } from "@/components/RitualMark";

/** Brief branded splash shown on first load, then it fades away. */
export function Splash() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 1700);
    return () => clearTimeout(t);
  }, []);

  if (done) return null;

  return (
    <div className="animate-splash-out fixed inset-0 z-50 grid place-items-center bg-zinc-950">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div className="absolute inset-0 -m-6 rounded-full bg-green-500/20 blur-2xl" />
          <RitualMark size={72} className="relative animate-spin-slow text-green-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold tracking-wide text-zinc-100">Ritual Audit</p>
          <p className="mt-1 text-xs text-zinc-500">Preparing the auditor…</p>
        </div>
      </div>
    </div>
  );
}
