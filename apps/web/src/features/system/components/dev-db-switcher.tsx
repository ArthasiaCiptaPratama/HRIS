import { useEffect, useState } from "react";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

// DEV-ONLY: dirender hanya saat import.meta.env.DEV (providers.tsx, lazy → tak masuk bundle produksi).
// Menukar DB backend lokal ⇄ Supabase lewat endpoint /dev/db yang hanya ada saat NODE_ENV=development.
// Setelah tukar, halaman dimuat ulang agar seluruh data & sesi konsisten dengan DB baru.

type Target = "local" | "supabase";
type DbInfo = { target: Target; host: string; profiles: Record<Target, boolean> };

const LABELS: Record<Target, string> = { local: "Lokal", supabase: "Supabase" };
const PROFILE_ENV: Record<Target, string> = {
  local: "LOCAL_DATABASE_URL",
  supabase: "SUPABASE_DATABASE_URL",
};

async function getDb(): Promise<DbInfo | null> {
  try {
    const res = await fetch(`${env.VITE_API_BASE_URL}/dev/db`);
    if (!res.ok) return null;
    return (await res.json()).data as DbInfo;
  } catch {
    return null;
  }
}

export function DevDbSwitcher() {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getDb().then(setInfo);
  }, []);

  // Endpoint tak ada (bukan dev / api belum siap) → sembunyikan total.
  if (!info) return null;

  async function switchTo(target: Target) {
    if (busy || info?.target === target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${env.VITE_API_BASE_URL}/dev/db`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const json = (await res.json()) as { data?: DbInfo; error?: { message: string } };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "Gagal menukar DB.");
        setBusy(false);
        return;
      }
      // Seluruh query TanStack & sesi harus baca DB baru → muat ulang.
      window.location.reload();
    } catch {
      setError("Gagal menghubungi API.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-3 left-3 z-[100] w-60 rounded-xl border border-amber-400/60 bg-amber-50/95 p-3 text-xs shadow-lg backdrop-blur dark:bg-amber-950/90">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-amber-900 dark:text-amber-200">DB (dev)</span>
        <span className="font-mono text-[10px] text-amber-700 dark:text-amber-300">
          {info.host}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {(["local", "supabase"] as const).map((t) => (
          <button
            key={t}
            type="button"
            disabled={busy || !info.profiles[t]}
            title={info.profiles[t] ? undefined : `Isi ${PROFILE_ENV[t]} di .env`}
            onClick={() => void switchTo(t)}
            aria-pressed={info.target === t}
            className={cn(
              "rounded-md border px-2 py-1.5 font-medium transition-colors disabled:opacity-50",
              info.target === t
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-amber-300 bg-white text-amber-900 hover:bg-amber-100 dark:bg-transparent dark:text-amber-200",
            )}
          >
            {LABELS[t]}
          </button>
        ))}
      </div>
      {!info.profiles.local || !info.profiles.supabase ? (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          Isi {!info.profiles.local ? "LOCAL_DATABASE_URL" : "SUPABASE_DATABASE_URL"} di .env untuk
          mengaktifkan.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-[11px] text-red-600">{error}</p> : null}
      {busy ? <p className="mt-2 text-[11px] text-amber-700">Menukar & memuat ulang…</p> : null}
    </div>
  );
}
