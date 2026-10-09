import { GripVertical, Minus } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
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

// Posisi & status terlipat diingat per browser (kenyamanan dev; boleh hilang).
const STORE_KEY = "hris.dev.dbSwitcher";
type Saved = { x: number; y: number; open: boolean };
function loadSaved(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Saved | null;
    if (raw && typeof raw.x === "number" && typeof raw.y === "number") return raw;
  } catch {
    // abaikan
  }
  return { x: 12, y: 12, open: false };
}
const clamp = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max));

/** Geser dengan pointer; klik tanpa geser (< 4 px) tetap dianggap klik. Posisi = jarak dari kiri-bawah. */
function useDraggable(
  initial: { x: number; y: number },
  onEnd: (p: { x: number; y: number }) => void,
) {
  const [pos, setPos] = useState(initial);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(
    null,
  );
  const box = useRef<HTMLDivElement>(null);
  const handlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      const w = box.current?.offsetWidth ?? 0;
      const h = box.current?.offsetHeight ?? 0;
      setPos({
        x: clamp(d.ox + dx, window.innerWidth - w),
        y: clamp(d.oy - dy, window.innerHeight - h),
      });
    },
    onPointerUp: () => {
      if (drag.current?.moved) onEnd(pos);
    },
  };
  /** true bila pointer terakhir hanya klik (bukan geser) — dipakai tombol lipat. */
  const wasClick = () => {
    const moved = drag.current?.moved ?? false;
    drag.current = null;
    return !moved;
  };
  return { pos, box, handlers, wasClick };
}

export function DevDbSwitcher() {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved] = useState(loadSaved);
  const [open, setOpen] = useState(saved.open);
  const persist = (next: Partial<Saved>) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadSaved(), ...next }));
    } catch {
      // abaikan
    }
  };
  const { pos, box, handlers, wasClick } = useDraggable(saved, (p) => persist(p));

  useEffect(() => {
    void getDb().then(setInfo);
  }, []);

  // Endpoint tak ada (bukan dev / api belum siap) → sembunyikan total.
  if (!info) return null;

  const toggle = (next: boolean) => {
    setOpen(next);
    persist({ open: next });
  };

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

  const dot = info.target === "local" ? "bg-emerald-500" : "bg-amber-500";

  if (!open) {
    return (
      <div ref={box} className="fixed z-[100]" style={{ left: pos.x, bottom: pos.y }}>
        <button
          type="button"
          {...handlers}
          onClick={() => wasClick() && toggle(true)}
          title={`DB dev: ${info.host} — klik untuk buka, tahan & geser untuk memindah`}
          className="flex cursor-grab touch-none items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-50/90 px-2.5 py-1 text-[11px] font-medium text-amber-900 opacity-60 shadow-sm backdrop-blur transition-opacity hover:opacity-100 active:cursor-grabbing dark:bg-amber-950/80 dark:text-amber-200"
        >
          <span className={cn("size-2 rounded-full", dot)} />
          DB · {LABELS[info.target]}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={box}
      className="fixed z-[100] w-64 rounded-xl border border-amber-400/60 bg-amber-50/95 p-3 text-xs shadow-lg backdrop-blur dark:bg-amber-950/90"
      style={{ left: pos.x, bottom: pos.y }}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          {...handlers}
          onClick={() => wasClick()}
          aria-label="Geser panel DB"
          title="Tahan & geser untuk memindah"
          className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-1.5 text-left active:cursor-grabbing"
        >
          <GripVertical className="size-3.5 shrink-0 text-amber-600" />
          <span className="font-semibold text-amber-900 dark:text-amber-200">DB (dev)</span>
          <span className={cn("size-2 shrink-0 rounded-full", dot)} />
        </button>
        <button
          type="button"
          onClick={() => toggle(false)}
          aria-label="Lipat panel DB"
          className="rounded p-0.5 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          <Minus className="size-3.5" />
        </button>
      </div>
      <p
        className="mb-2 truncate font-mono text-[10px] text-amber-700 dark:text-amber-300"
        title={info.host}
      >
        {info.host}
      </p>
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
