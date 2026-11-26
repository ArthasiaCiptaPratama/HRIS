import type { ThlStatus } from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import type { DataColumn, tableFeaturesNone } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EmployeeListItem, ThlAttendance } from "../schemas";
import { formatThlMonth } from "./thl-section";

/**
 * Opsi C daftar Harian Lepas (pilihan pengguna 2026-11-26): kolom Status = satu badge gabungan
 * dan satu kolom "Hari hadir / bulan" berisi "n/3" = bulan penuh berturut-turut ≥ 21 hari hadir
 * (kutipan pengguna 15:5x WIB: judul tanpa nama bulan, isi cukup n/3); rincian per bulan di tooltip.
 */
const helper = createColumnHelper<typeof tableFeaturesNone, EmployeeListItem>();

const STATUS_BADGE: Record<ThlStatus, { label: string; className: string }> = {
  REQUIRED: {
    label: "THL · Wajib diangkat",
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
  },
  APPROACHING: {
    label: "THL · Mendekati batas",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  NONE: {
    label: "THL",
    className: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
  },
};

export function ThlListStatusBadge({ status }: { status: ThlStatus | null | undefined }) {
  const tone = STATUS_BADGE[status ?? "NONE"];
  return (
    <Badge
      variant="muted"
      className={cn("rounded-md font-medium whitespace-nowrap", tone.className)}
    >
      {tone.label}
    </Badge>
  );
}

const STREAK_TONE: Record<ThlStatus, string> = {
  REQUIRED: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
  APPROACHING: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  NONE: "text-muted-foreground",
};

const monthText = (m: ThlAttendance["currentMonth"], current = false) =>
  `${formatThlMonth(m.month)}${current ? " (berjalan)" : ""}: ${
    m.beforeJoin ? "–" : `${m.presentDays} hari`
  }${!m.beforeJoin && m.pendingDays > 0 ? ` (+${m.pendingDays} menunggu persetujuan)` : ""}`;

/** Rincian per bulan untuk tooltip: 3 bulan penuh + bulan berjalan. */
export function thlAttendanceTitle(attendance: ThlAttendance) {
  return [
    ...attendance.months.map((m) => monthText(m)),
    monthText(attendance.currentMonth, true),
  ].join(" · ");
}

/**
 * Sel "n/3" (kutipan pengguna 15:5x WIB: "cukup 1/3 atau 2/3"): bulan penuh berturut ≥ 21 hari.
 * Angka per bulan di tooltip; rincian lengkap di kartu THL tab Kepegawaian.
 */
export function ThlAttendanceCell({
  attendance,
  status,
}: {
  attendance: ThlAttendance | null | undefined;
  status: ThlStatus | null | undefined;
}) {
  if (!attendance) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      title={thlAttendanceTitle(attendance)}
      className={cn(
        "inline-block rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums",
        STREAK_TONE[status ?? "NONE"],
      )}
    >
      {attendance.streak}/3
    </span>
  );
}

/** Kolom daftar THL: Status diganti badge gabungan, ditambah kolom hari hadir (sort `thlStreak`). */
export function thlColumns(
  columns: DataColumn<EmployeeListItem>[],
): DataColumn<EmployeeListItem>[] {
  const status = helper.display({
    id: "status",
    header: "Status",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <ThlListStatusBadge status={row.original.thlStatus} />
        {/* HP: n/3 di bawah badge supaya terbaca tanpa geser tabel jauh. */}
        <span className="sm:hidden">
          <ThlAttendanceCell
            attendance={row.original.thlAttendance}
            status={row.original.thlStatus}
          />
        </span>
      </div>
    ),
  }) as DataColumn<EmployeeListItem>;
  const attendance = helper.display({
    id: "thlAttendance",
    header: "Hari hadir / bulan",
    meta: {
      sortKey: "thlStreak",
      headerClassName: "hidden sm:table-cell",
      className: "hidden sm:table-cell whitespace-nowrap",
    },
    cell: ({ row }) => (
      <ThlAttendanceCell attendance={row.original.thlAttendance} status={row.original.thlStatus} />
    ),
  }) as DataColumn<EmployeeListItem>;
  // Status + Hari hadir langsung setelah Karyawan (kolom terpenting di halaman THL).
  const rest = columns.filter((column) => column.id !== "status" && column.id !== "name");
  const name = columns.filter((column) => column.id === "name");
  return [...name, status, attendance, ...rest];
}
