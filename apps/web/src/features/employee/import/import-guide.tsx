import { CircleHelp } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Panduan import (tombol "?"): langkah bernomor + ilustrasi mini (bukan tangkapan layar — tidak basi
// saat UI berubah & tanpa data asli). Langkah yang sedang dibuka disorot dan terbuka.

export type GuideStep = "upload" | "mapping" | "complete" | "preview" | "done";

/** Kotak "layar" kecil berisi garis-garis tiruan. */
function Mock({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="bg-muted/50 flex h-24 w-full shrink-0 flex-col gap-1.5 rounded-lg border p-2.5 sm:w-36"
    >
      {children}
    </div>
  );
}
const Bar = ({ className }: { className?: string }) => (
  <span className={cn("bg-muted-foreground/25 block h-1.5 rounded-full", className)} />
);
const Pill = ({ tone, className }: { tone: "ok" | "warn" | "brand"; className?: string }) => (
  <span
    className={cn(
      "block h-3 rounded",
      tone === "ok" && "bg-success-soft",
      tone === "warn" && "bg-warning-soft",
      tone === "brand" && "bg-brand",
      className,
    )}
  />
);

const STEPS: {
  key: GuideStep;
  title: string;
  mock: ReactNode;
  body: ReactNode;
}[] = [
  {
    key: "upload",
    title: "Unggah file",
    mock: (
      <Mock>
        <span className="border-muted-foreground/40 grid flex-1 place-items-center rounded border-2 border-dashed text-[10px]">
          .xlsx
        </span>
        <Bar className="w-2/3" />
      </Mock>
    ),
    body: (
      <>
        Belum punya file? Klik <strong>Unduh template Excel</strong>, isi satu karyawan per baris
        (kolom kuning wajib), lalu tarik file ke kotak unggah. File karyawan kantor yang sudah ada
        juga bisa langsung diunggah.
      </>
    ),
  },
  {
    key: "mapping",
    title: "Periksa pemetaan kolom",
    mock: (
      <Mock>
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex items-center gap-1.5">
            <Bar className="w-10" />
            <span className="text-muted-foreground text-[9px]">→</span>
            <Pill tone="ok" className="flex-1" />
          </span>
        ))}
      </Mock>
    ),
    body: (
      <>
        Biasanya dilewati otomatis. Bila muncul, pilih isi kolom yang bertanda kuning. File wajib
        punya kolom <strong>NIP</strong> atau <strong>No. KTP</strong>.
      </>
    ),
  },
  {
    key: "complete",
    title: "Lengkapi data",
    mock: (
      <Mock>
        <span className="flex items-center gap-1.5">
          <Pill tone="ok" className="w-3" />
          <Bar className="flex-1" />
        </span>
        <span className="flex items-center gap-1.5">
          <Pill tone="warn" className="w-3" />
          <Bar className="flex-1" />
        </span>
        <Pill tone="warn" className="ml-4" />
        <span className="flex items-center gap-1.5">
          <Pill tone="ok" className="w-3" />
          <Bar className="flex-1" />
        </span>
      </Mock>
    ),
    body: (
      <>
        Pilih yang bertanda kuning: PT, Departemen yang mirip (klik <em>Pakai saran</em>), atau
        status karyawan baru.
      </>
    ),
  },
  {
    key: "preview",
    title: "Pratinjau & simpan",
    mock: (
      <Mock>
        <span className="flex gap-1">
          <Pill tone="ok" className="flex-1" />
          <Pill tone="warn" className="w-6" />
        </span>
        <Bar />
        <Bar />
        <Bar className="w-3/4" />
        <Pill tone="brand" className="ml-auto w-12" />
      </Mock>
    ),
    body: (
      <>
        Baris yang salah tidak ikut disimpan; yang lain bisa disimpan sekarang. Unduh baris yang
        salah, betulkan di Excel, lalu unggah lagi — tidak akan dobel.
      </>
    ),
  },
  {
    key: "done",
    title: "Lampiran & selesai",
    mock: (
      <Mock>
        <Bar className="w-1/2" />
        <span className="bg-muted-foreground/15 mt-1 block h-2 rounded-full">
          <span className="bg-brand block h-2 w-2/3 rounded-full" />
        </span>
        <Bar className="w-3/4" />
      </Mock>
    ),
    body: (
      <>
        Foto & dokumen dari Google Drive diambil setelah simpan. Biarkan halaman terbuka sampai
        selesai.
      </>
    ),
  },
];

export function ImportGuide({ current }: { current: GuideStep }) {
  // IMP-D5 "sekali lihat": hanya langkah yang sedang dibuka yang terbuka; langkah lain satu baris judul.
  const [expanded, setExpanded] = useState<GuideStep>(current);
  return (
    <Dialog onOpenChange={(open) => open && setExpanded(current)}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label="Panduan import">
          <CircleHelp /> Panduan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Panduan import data karyawan</DialogTitle>
          <DialogDescription>Klik langkah untuk membaca caranya.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-2">
          {STEPS.map((step, i) => {
            const active = step.key === current;
            const open = step.key === expanded;
            return (
              <li
                key={step.key}
                aria-current={active ? "step" : undefined}
                className={cn("rounded-xl border", active && "border-brand bg-brand-soft/40")}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded(step.key)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
                >
                  {i + 1}. {step.title}
                  {active ? (
                    <span className="bg-brand text-brand-foreground rounded px-1.5 py-0.5 text-xs font-normal">
                      Sekarang
                    </span>
                  ) : null}
                </button>
                {open ? (
                  <div className="flex flex-col gap-3 px-3 pb-3 sm:flex-row">
                    {step.mock}
                    <p className="text-muted-foreground min-w-0 text-sm">{step.body}</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer">Untuk file Google Form</summary>
          <p className="mt-1">
            Atur lokal Sheet ke <strong>Indonesia</strong> (File → Setelan) supaya tanggal terbaca
            benar. Setelah import, batasi akses Sheet karena berisi data pribadi.
          </p>
        </details>
      </DialogContent>
    </Dialog>
  );
}
