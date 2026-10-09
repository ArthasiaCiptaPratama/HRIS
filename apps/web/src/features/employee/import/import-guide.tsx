import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
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
// saat UI berubah & tanpa data asli). Langkah yang sedang dibuka disorot.

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
        Unduh Sheet respons Google Form sebagai <strong>.xlsx</strong> (File → Download → Microsoft
        Excel), lalu tarik ke kotak unggah. Pilih <strong>Tambah + perbarui</strong> bila sebagian
        karyawan sudah ada di sistem.
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
        Setiap kolom file sudah dipasangkan ke data karyawan. Periksa kolom yang kecocokannya{" "}
        <em>rendah</em> atau <em>belum dipetakan</em>. File wajib punya kolom <strong>NIP</strong>{" "}
        atau <strong>NIK KTP</strong>. Pemetaan disimpan untuk file dengan judul kolom yang sama.
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
        Muncul bila ada data yang perlu ditentukan untuk banyak karyawan sekaligus. Kerjakan dari
        atas; bagian yang belum selesai ditandai kuning.
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>
            <strong>PT</strong> untuk karyawan yang tidak punya kolom PT di file.
          </li>
          <li>
            <strong>Unit organisasi</strong>: nilai Departemen/Divisi yang berlabel{" "}
            <em>Perlu dipilih</em> mirip unit lain (salah ketik atau singkatan, mis. “Enginering”,
            “HRGA”). Gunakan <em>Pakai saran</em>, lalu periksa satu per satu. Untuk unit baru,
            periksa jenis (Departemen, Divisi, Seksi) dan induknya. Unit dicocokkan per PT.
          </li>
          <li>
            <strong>Status kepegawaian</strong> untuk karyawan yang belum ada di sistem.
          </li>
        </ol>
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
        Baris yang error langsung ditampilkan beserta cara memperbaikinya. Kesalahan isi file (mis.
        NIK salah dan NIP kosong) diperbaiki di file: klik <em>Unduh baris bermasalah</em>,
        perbaiki, lalu unggah ulang. PT dan status bisa diubah per karyawan. Peringatan tidak
        menghalangi penyimpanan. Klik <strong>Simpan</strong> bila sudah sesuai.
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
        Foto & dokumen dari tautan Google Drive diambil setelah simpan (panel progres). Karyawan
        tanpa NIP ditandai <em>NIP belum ada</em> di daftar. Lengkapi NIP lewat edit karyawan atau
        impor ulang file yang sudah berisi NIP (karyawan dikenali dari NIK KTP).
      </>
    ),
  },
];

export function ImportGuide({ current }: { current: GuideStep }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Panduan import">
          <CircleHelp />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Panduan import data karyawan</DialogTitle>
          <DialogDescription>
            Urutan pengisian dari atas ke bawah. Langkah yang sedang Anda buka ditandai.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {STEPS.map((step, i) => {
            const active = step.key === current;
            return (
              <li
                key={step.key}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-3 sm:flex-row",
                  active && "border-brand bg-brand-soft/40",
                )}
              >
                {step.mock}
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {i + 1}. {step.title}
                    {active ? (
                      <span className="bg-brand text-brand-foreground ml-2 rounded px-1.5 py-0.5 text-xs font-normal">
                        Langkah saat ini
                      </span>
                    ) : null}
                  </p>
                  <div className="text-muted-foreground mt-1">{step.body}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-muted-foreground text-xs">
          Tips Sheet Google Form: atur lokal ke <strong>Indonesia</strong> (File → Setelan) supaya
          tanggal terbaca benar. Setelah import, batasi akses Sheet karena berisi data pribadi.
        </p>
      </DialogContent>
    </Dialog>
  );
}
