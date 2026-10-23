import {
  HOLIDAY_KIND_LABELS,
  HOLIDAY_KINDS,
  type HolidayKind,
  SHIFT_TIMEZONE_LABELS,
  SHIFT_TIMEZONES,
  type TimeSettings,
} from "@hris/shared";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { tmAccess } from "../access";
import {
  useHolidayActions,
  useHolidays,
  useImportOfficialHolidays,
  useOfficialHolidayYears,
  useSaveTimeSettings,
  useTimeSettings,
} from "../api";
import { workDateLabel } from "../components/display";
import type { Holiday } from "../schemas";

// D-072: kalender libur (tanggal merah & cuti bersama; cuti bersama memotong saldo cuti bila hari kerja
// roster tanpa absen). SA kelola; semua melihat. Pengaturan Time Management: SA ubah, HR lihat.

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, i, 1)),
  ),
);
const WEEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Sel-sel satu bulan (minggu dimulai hari Minggu, seperti kalender dinding Indonesia). */
function monthCells(year: number, month: number): { key: string; date: string | null }[] {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: { key: string; date: string | null }[] = Array.from({ length: first }, (_, i) => ({
    key: `${month}-lead-${i}`,
    date: null,
  }));
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${pad(month + 1)}-${pad(d)}`;
    cells.push({ key: date, date });
  }
  while (cells.length % 7 !== 0) cells.push({ key: `${month}-tail-${cells.length}`, date: null });
  return cells;
}

/** Bulatan tanggal: Minggu merah, tanggal merah (latar merah), cuti bersama (latar kuning). */
function DayDot({
  date,
  sunday,
  holiday,
  today,
}: {
  date: string;
  sunday: boolean;
  holiday: Holiday | undefined;
  today: boolean;
}) {
  return (
    <span
      className={cn(
        "mx-auto grid aspect-square w-full max-w-8 place-items-center rounded-full text-xs tabular-nums",
        sunday && !holiday && "font-semibold text-red-600",
        holiday?.kind === "NATIONAL" && "bg-red-600 font-semibold text-white",
        holiday?.kind === "COLLECTIVE_LEAVE" && "bg-amber-400 font-semibold text-amber-950",
        today && "ring-brand ring-2 ring-offset-1",
      )}
    >
      {Number(date.slice(8))}
    </span>
  );
}

export function HolidaysPage() {
  const me = useMe().data as Me;
  const manage = tmAccess.manageHolidays(me);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const holidays = useHolidays(year);
  const officialYears = useOfficialHolidayYears();
  const importOfficial = useImportOfficialHolidays();
  const [editing, setEditing] = useState<{ holiday: Holiday | null; date?: string } | null>(null);
  const rows = holidays.data ?? [];
  const byDate = new Map(rows.map((h) => [h.date, h]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const national = rows.filter((h) => h.kind === "NATIONAL").length;
  const collective = rows.length - national;
  const hasOfficial = officialYears.data?.includes(year) ?? false;

  const runImport = () =>
    importOfficial.mutate(year, {
      onSuccess: (r) =>
        toast.success(
          r.added > 0
            ? `${r.added} hari libur resmi ${r.year} ditambahkan${r.skipped ? ` (${r.skipped} sudah ada)` : ""}.`
            : `Semua libur resmi ${r.year} sudah ada di kalender.`,
        ),
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <div>
      <PageHeader
        title="Kalender Libur"
        description="Tanggal merah nasional dan cuti bersama sesuai SKB 3 Menteri. Cuti bersama pada hari kerja roster tanpa absen dihitung sebagai cuti."
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Tahun sebelumnya"
                onClick={() => setYear(year - 1)}
              >
                <ChevronLeft />
              </Button>
              <span className="w-14 text-center text-sm font-semibold tabular-nums">{year}</span>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Tahun berikutnya"
                onClick={() => setYear(year + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
            {manage && hasOfficial ? (
              <Button variant="outline" disabled={importOfficial.isPending} onClick={runImport}>
                <Download /> Isi libur resmi {year}
              </Button>
            ) : null}
            {manage ? (
              <Button variant="brand" onClick={() => setEditing({ holiday: null })}>
                <Plus /> Tambah
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="grid size-5 place-items-center rounded-full bg-red-600 text-[10px] font-semibold text-white">
            17
          </span>
          Tanggal merah ({national})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="grid size-5 place-items-center rounded-full bg-amber-400 text-[10px] font-semibold text-amber-950">
            24
          </span>
          Cuti bersama ({collective})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-red-600">Min</span> Hari Minggu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="ring-brand grid size-5 place-items-center rounded-full ring-2 text-[10px]">
            12
          </span>
          Hari ini
        </span>
        {manage ? (
          <span className="text-muted-foreground">Klik tanggal untuk menambah / mengubah.</span>
        ) : null}
      </div>

      {holidays.isPending ? (
        <Skeleton className="h-[480px]" />
      ) : holidays.isError ? (
        <EmptyState
          icon={CalendarDays}
          title="Gagal memuat"
          description={errorMessage(holidays.error)}
        />
      ) : (
        <div className="@container min-w-0">
          <div className="grid min-w-0 gap-6 @[72rem]:grid-cols-[minmax(0,1fr)_300px]">
            {rows.length === 0 ? (
              <div className="@[72rem]:col-span-2">
                <EmptyState
                  icon={CalendarDays}
                  title={`Belum ada hari libur ${year}`}
                  description={
                    !manage
                      ? "Hari libur tahun ini belum diisi pengelola kalender."
                      : hasOfficial
                        ? "Isi otomatis dari SKB 3 Menteri dengan tombol di bawah."
                        : "Data resmi tahun ini belum tersedia; tambahkan manual."
                  }
                  action={
                    manage && hasOfficial ? (
                      <Button
                        variant="brand"
                        disabled={importOfficial.isPending}
                        onClick={runImport}
                      >
                        <Download /> Isi libur resmi {year}
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : null}
            <div className="@container min-w-0">
              <div className="grid min-w-0 grid-cols-1 items-start gap-4 @[34rem]:grid-cols-2 @[52rem]:grid-cols-3 @[72rem]:grid-cols-4">
                {MONTHS.map((monthName, m) => (
                  <section
                    key={monthName}
                    className="bg-card min-w-0 rounded-xl border p-2.5 sm:p-3"
                  >
                    <h2 className="mb-2 text-sm font-semibold">{monthName}</h2>
                    <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] sm:text-[11px]">
                      {WEEK.map((w, i) => (
                        <span
                          key={w}
                          className={cn(
                            "text-muted-foreground font-medium",
                            i === 0 && "text-red-600",
                          )}
                        >
                          {w}
                        </span>
                      ))}
                      {monthCells(year, m).map(({ key, date }, i) => {
                        if (!date) return <span key={key} />;
                        const h = byDate.get(date);
                        const label = h ? `${h.name} (${HOLIDAY_KIND_LABELS[h.kind]})` : undefined;
                        return manage ? (
                          <button
                            key={key}
                            type="button"
                            title={label ?? "Tambah hari libur"}
                            aria-label={`${date}${label ? ` — ${label}` : ""}`}
                            className="hover:bg-muted min-w-0 rounded-md p-px sm:py-0.5"
                            onClick={() => setEditing({ holiday: h ?? null, date })}
                          >
                            <DayDot
                              date={date}
                              sunday={i % 7 === 0}
                              holiday={h}
                              today={date === today}
                            />
                          </button>
                        ) : (
                          <span key={key} title={label} className="min-w-0 p-px sm:py-0.5">
                            <DayDot
                              date={date}
                              sunday={i % 7 === 0}
                              holiday={h}
                              today={date === today}
                            />
                          </span>
                        );
                      })}
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {rows
                        .filter((h) => Number(h.date.slice(5, 7)) === m + 1)
                        .map((h) => (
                          <li key={h.id} className="flex min-w-0 gap-1.5 text-[11px] leading-snug">
                            <span
                              className={cn(
                                "w-5 shrink-0 text-right font-semibold tabular-nums",
                                h.kind === "NATIONAL" ? "text-red-600" : "text-amber-600",
                              )}
                            >
                              {Number(h.date.slice(8))}
                            </span>
                            <span className="text-muted-foreground min-w-0 break-words">
                              {h.name}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>

            {rows.length > 0 ? (
              <aside className="bg-card h-fit rounded-xl border @[72rem]:sticky @[72rem]:top-4">
                <h2 className="border-b px-4 py-3 text-sm font-semibold">
                  Daftar libur {year}{" "}
                  <span className="text-muted-foreground font-normal">({rows.length} hari)</span>
                </h2>
                <ul className="max-h-[70vh] divide-y overflow-y-auto">
                  {rows.map((h) => (
                    <li key={h.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="w-24 shrink-0 text-xs tabular-nums">
                        {workDateLabel(h.date)}
                      </span>
                      <span className="min-w-0 flex-1 text-xs">{h.name}</span>
                      {manage ? (
                        <div className="flex shrink-0">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Ubah ${h.name}`}
                            onClick={() => setEditing({ holiday: h })}
                          >
                            <Pencil />
                          </Button>
                        </div>
                      ) : (
                        <Badge
                          variant={h.kind === "NATIONAL" ? "destructive" : "warning"}
                          className="text-[10px]"
                        >
                          {h.kind === "NATIONAL" ? "Merah" : "Cuti"}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </aside>
            ) : null}
          </div>
        </div>
      )}
      {editing ? (
        <HolidayDialog
          holiday={editing.holiday}
          presetDate={editing.date}
          year={year}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function HolidayDialog({
  holiday,
  presetDate,
  year,
  onClose,
}: {
  holiday: Holiday | null;
  presetDate?: string | undefined;
  year: number;
  onClose: () => void;
}) {
  const { save, remove } = useHolidayActions();
  const [date, setDate] = useState(holiday?.date ?? presetDate ?? `${year}-01-01`);
  const [name, setName] = useState(holiday?.name ?? "");
  const [kind, setKind] = useState<HolidayKind>(holiday?.kind ?? "NATIONAL");
  const submit = async () => {
    try {
      await save.mutateAsync({ id: holiday?.id, date, name, kind });
      toast.success("Hari libur disimpan.");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{holiday ? "Ubah hari libur" : "Tambah hari libur"}</DialogTitle>
          <DialogDescription>Satu tanggal hanya boleh satu entri.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="hd-date">Tanggal</Label>
            <Input
              id="hd-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hd-name">Nama</Label>
            <Input
              id="hd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hari Kemerdekaan"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Jenis</Label>
            <FormSelect
              value={kind}
              onChange={(v) => setKind(v as HolidayKind)}
              placeholder="Jenis"
              options={HOLIDAY_KINDS.map((k) => ({ value: k, label: HOLIDAY_KIND_LABELS[k] }))}
            />
          </div>
        </div>
        <DialogFooter>
          {holiday ? (
            <Button
              variant="ghost"
              className="text-destructive mr-auto"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(holiday.id, {
                  onSuccess: () => {
                    toast.success("Hari libur dihapus.");
                    onClose();
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <Trash2 /> Hapus
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={save.isPending || name.trim().length < 2}
            onClick={() => void submit()}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FIELDS: { key: Exclude<keyof TimeSettings, "timezone">; label: string; hint: string }[] = [
  {
    key: "gpsAccuracyMaxM",
    label: "Batas akurasi GPS (meter)",
    hint: "Di atas ini absen diberi label Akurasi GPS rendah.",
  },
  {
    key: "selfieRetentionMonths",
    label: "Masa simpan selfie (bulan)",
    hint: "Setelah itu foto dihapus otomatis; data absen tetap.",
  },
  {
    key: "approvalDueDays",
    label: "Batas keputusan approval (hari)",
    hint: "Pengingat bila hari absen belum diputuskan (OD-15).",
  },
  {
    key: "rosterHorizonDays",
    label: "Roster dibangkitkan ke depan (hari)",
    hint: "Hari roster dari pola dibuat sejauh ini.",
  },
  {
    key: "checkOutEarlyMin",
    label: "Clock Out dibuka (mnt sebelum jam pulang)",
    hint: "Lebih awal dari ini = pulang darurat: wajib alasan & berlabel Pulang cepat.",
  },
  {
    key: "minRestHours",
    label: "Jeda minimal antarshift (jam)",
    hint: "Clock In kurang dari ini sejak Clock Out sebelumnya ditandai Jeda antarshift kurang (alasan wajib).",
  },
];

export function TimeSettingsPage() {
  const me = useMe().data as Me;
  const manage = tmAccess.manageSettings(me);
  const settings = useTimeSettings();
  const save = useSaveTimeSettings();
  const [form, setForm] = useState<TimeSettings | null>(null);
  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);
  const submit = async () => {
    if (!form) return;
    try {
      await save.mutateAsync(form);
      toast.success("Pengaturan disimpan.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div>
      <PageHeader
        title="Pengaturan Time Management"
        description={
          manage
            ? "Berlaku untuk semua PT."
            : "Hanya Super Admin yang dapat mengubah pengaturan ini."
        }
      />
      {settings.isPending || !form ? (
        <Skeleton className="h-72 max-w-xl" />
      ) : (
        <div className="bg-card max-w-xl space-y-4 rounded-xl border p-5">
          <div className="space-y-1.5">
            <Label>Zona waktu jam shift</Label>
            <FormSelect
              value={form.timezone}
              disabled={!manage}
              onChange={(v) => setForm({ ...form, timezone: v as TimeSettings["timezone"] })}
              placeholder="Zona waktu"
              options={SHIFT_TIMEZONES.map((tz) => ({
                value: tz,
                label: SHIFT_TIMEZONE_LABELS[tz],
              }))}
            />
          </div>
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`ts-${f.key}`}>{f.label}</Label>
              <Input
                id={`ts-${f.key}`}
                type="number"
                disabled={!manage}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
              />
              <p className="text-muted-foreground text-xs">{f.hint}</p>
            </div>
          ))}
          {manage ? (
            <div className="flex justify-end">
              <Button variant="brand" disabled={save.isPending} onClick={() => void submit()}>
                Simpan
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
