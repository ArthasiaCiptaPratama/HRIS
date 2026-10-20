import {
  ALPHA_RULE_START,
  ATTENDANCE_RECORD_OUTCOME_LABELS,
  type AttendanceRecordOutcome,
  CORRECTION_WINDOW_DAYS,
} from "@hris/shared";
import { CalendarX2, PenLine } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  type AttendanceRecord,
  useEmployeeAttendanceRecord,
  useMyAttendanceRecord,
} from "../record-api";
import { workDateLabel } from "./display";

// TM-D3 — rekam jejak Alpha & koreksi: ringkasan + daftar (terbaru di atas). Tidak pernah dihapus.

type BadgeVariant = "success" | "warning" | "destructive" | "muted" | "brand";
const OUTCOME_VARIANT: Record<AttendanceRecordOutcome, BadgeVariant> = {
  ALPHA_CORRECTABLE: "warning",
  ALPHA_EXPIRED: "destructive",
  ALPHA_PERIOD: "destructive",
  CORRECTION_PENDING: "brand",
  CORRECTED: "success",
  CORRECTION_REJECTED: "muted",
};

/** Sisa hari sampai batas koreksi (0 = hari terakhir). */
function daysLeft(deadline: string, today: string): number {
  return Math.round(
    (Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5,
  );
}

const SUMMARY: { key: AttendanceRecordOutcome; label: string; tone: string }[] = [
  { key: "ALPHA_EXPIRED", label: "Alpha permanen", tone: "text-destructive" },
  { key: "ALPHA_PERIOD", label: "Alpha tutup periode", tone: "text-destructive" },
  {
    key: "ALPHA_CORRECTABLE",
    label: "Masih bisa dikoreksi",
    tone: "text-amber-700 dark:text-amber-300",
  },
  { key: "CORRECTION_PENDING", label: "Koreksi menunggu", tone: "text-brand" },
  { key: "CORRECTED", label: "Dikoreksi", tone: "text-success" },
  { key: "CORRECTION_REJECTED", label: "Koreksi ditolak", tone: "text-muted-foreground" },
];

export function RecordSummary({ record }: { record: AttendanceRecord }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {SUMMARY.map((s) => (
        <div key={s.key} className="bg-card rounded-lg border px-3 py-2">
          <dt className="text-muted-foreground text-[11px]">{s.label}</dt>
          <dd className={cn("text-xl font-semibold tabular-nums", s.tone)}>
            {record.items.filter((i) => i.outcome === s.key).length}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RecordList({
  record,
  onCorrect,
}: {
  record: AttendanceRecord;
  /** Diisi di halaman karyawan sendiri: tombol koreksi untuk hari yang masih dalam batas. */
  onCorrect?: (workDate: string) => void;
}) {
  if (record.items.length === 0) {
    return <EmptyState icon={CalendarX2} title="Tidak ada catatan Alpha atau koreksi" />;
  }
  return (
    <ul className="divide-y rounded-xl border">
      {record.items.map((item) => {
        const left = daysLeft(item.deadline, record.today);
        return (
          <li
            key={item.workDate}
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3"
          >
            <div className="min-w-40">
              <p className="text-sm font-medium">{workDateLabel(item.workDate)}</p>
              <p className="text-muted-foreground text-xs">
                {item.shiftCode ? `Shift ${item.shiftCode}` : "Tanpa jadwal"}
              </p>
            </div>
            <Badge variant={OUTCOME_VARIANT[item.outcome]}>
              {ATTENDANCE_RECORD_OUTCOME_LABELS[item.outcome]}
            </Badge>
            <p className="text-muted-foreground min-w-0 flex-1 text-xs">
              {item.outcome === "ALPHA_CORRECTABLE"
                ? left <= 0
                  ? "Hari terakhir koreksi — ajukan hari ini."
                  : `Sisa ${left} hari untuk koreksi (s.d. ${workDateLabel(item.deadline)}).`
                : item.outcome === "ALPHA_EXPIRED"
                  ? `Batas koreksi lewat (${workDateLabel(item.deadline)}); tetap Alpha.`
                  : item.correction
                    ? `“${item.correction.reason}”`
                    : null}
            </p>
            {onCorrect && item.outcome === "ALPHA_CORRECTABLE" ? (
              <Button size="sm" variant="brand" onClick={() => onCorrect(item.workDate)}>
                <PenLine /> Koreksi
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ── Riwayat per bulan (mulai bulan aturan TM-D3 berlaku; bulan sebelumnya tidak dihitung) ─────

const START_MONTH = ALPHA_RULE_START.slice(0, 7);
const MONTH_FORMAT = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthLabel = (month: string) => MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`));

/** Bulan dari START_MONTH s.d. bulan `today`, terbaru di atas. */
export function monthsSinceStart(today: string): string[] {
  const months: string[] = [];
  const end = today.slice(0, 7);
  let [y, m] = START_MONTH.split("-").map(Number) as [number, number];
  for (let guard = 0; guard < 600; guard += 1) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > end) break;
    months.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months.reverse();
}

/** Hanya catatan sejak aturan TM-D3 berlaku (bulan sebelum Oktober 2026 tidak dihitung). */
export function sinceRuleStart(record: AttendanceRecord): AttendanceRecord {
  return { ...record, items: record.items.filter((i) => i.workDate >= ALPHA_RULE_START) };
}

const MONTH_COLUMNS: { label: string; outcomes: AttendanceRecordOutcome[]; tone: string }[] = [
  {
    label: "Alpha permanen",
    outcomes: ["ALPHA_EXPIRED", "ALPHA_PERIOD"],
    tone: "text-destructive",
  },
  {
    label: "Bisa dikoreksi",
    outcomes: ["ALPHA_CORRECTABLE"],
    tone: "text-amber-700 dark:text-amber-300",
  },
  { label: "Menunggu", outcomes: ["CORRECTION_PENDING"], tone: "text-brand" },
  { label: "Dikoreksi", outcomes: ["CORRECTED"], tone: "text-success" },
  { label: "Ditolak", outcomes: ["CORRECTION_REJECTED"], tone: "text-muted-foreground" },
];

export function MonthlyHistory({
  record,
  month,
  onSelect,
}: {
  record: AttendanceRecord;
  month: string | null;
  onSelect: (month: string | null) => void;
}) {
  const months = monthsSinceStart(record.today);
  const count = (m: string, outcomes: AttendanceRecordOutcome[]) =>
    record.items.filter((i) => i.workDate.startsWith(m) && outcomes.includes(i.outcome)).length;
  const rowClass = (active: boolean) =>
    cn("hover:bg-muted/60 cursor-pointer border-t", active && "bg-brand-soft/60 font-medium");
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm" aria-label="Riwayat Alpha per bulan">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Bulan</th>
            {MONTH_COLUMNS.map((c) => (
              <th key={c.label} className="px-3 py-2 text-right font-medium">
                {c.label}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Total hari</th>
          </tr>
        </thead>
        <tbody>
          <tr className={rowClass(month === null)} onClick={() => onSelect(null)}>
            <td className="px-3 py-2">
              <button type="button" className="text-left" onClick={() => onSelect(null)}>
                Semua bulan
              </button>
            </td>
            {MONTH_COLUMNS.map((c) => (
              <td key={c.label} className={cn("px-3 py-2 text-right tabular-nums", c.tone)}>
                {record.items.filter((i) => c.outcomes.includes(i.outcome)).length}
              </td>
            ))}
            <td className="px-3 py-2 text-right tabular-nums">{record.items.length}</td>
          </tr>
          {months.map((m) => {
            const total = record.items.filter((i) => i.workDate.startsWith(m)).length;
            return (
              <tr key={m} className={rowClass(month === m)} onClick={() => onSelect(m)}>
                <td className="px-3 py-2 capitalize">
                  <button type="button" className="text-left" onClick={() => onSelect(m)}>
                    {monthLabel(m)}
                  </button>
                </td>
                {MONTH_COLUMNS.map((c) => {
                  const n = count(m, c.outcomes);
                  return (
                    <td
                      key={c.label}
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        n === 0 ? "text-muted-foreground" : c.tone,
                      )}
                    >
                      {n}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right tabular-nums">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecordView({
  query,
  onCorrect,
}: {
  query: ReturnType<typeof useMyAttendanceRecord>;
  onCorrect?: (workDate: string) => void;
}) {
  const [month, setMonth] = useState<string | null>(null);
  if (query.isPending) return <Skeleton className="h-48 w-full" />;
  if (query.isError) {
    return <EmptyState icon={CalendarX2} title={errorMessage(query.error)} />;
  }
  const record = sinceRuleStart(query.data);
  const shown = month
    ? { ...record, items: record.items.filter((i) => i.workDate.startsWith(month)) }
    : record;
  return (
    <div className="space-y-4">
      <RecordSummary record={shown} />
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Riwayat per bulan</h3>
        <p className="text-muted-foreground text-xs">
          Dihitung sejak {monthLabel(START_MONTH)}. Klik bulan untuk melihat rinciannya.
        </p>
        <MonthlyHistory record={record} month={month} onSelect={setMonth} />
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold capitalize">
          {month ? `Rincian ${monthLabel(month)}` : "Rincian semua bulan"}
        </h3>
        <RecordList record={shown} onCorrect={onCorrect} />
      </section>
    </div>
  );
}

/** Halaman karyawan sendiri: daftar + tombol koreksi. */
export function MyAttendanceRecord({ onCorrect }: { onCorrect: (workDate: string) => void }) {
  return <RecordView query={useMyAttendanceRecord()} onCorrect={onCorrect} />;
}

/** Tab Absensi di detail karyawan (HR, atasan, SA). */
export function EmployeeAttendanceRecord({ employeeId }: { employeeId: string }) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Rekam jejak hari Alpha dan koreksi absen. Hari kerja tanpa absen menjadi Alpha; koreksi bisa
        diajukan paling lambat {CORRECTION_WINDOW_DAYS} hari setelah tanggal kerja. Catatan ini
        tidak pernah dihapus.
      </p>
      <RecordView query={useEmployeeAttendanceRecord(employeeId)} />
    </div>
  );
}
