import {
  ATTENDANCE_DAY_STATUS_LABELS,
  ATTENDANCE_EXPORT_COLUMN_GROUP_INFO,
  ATTENDANCE_EXPORT_COLUMN_GROUPS,
  ATTENDANCE_EXPORT_DEFAULT_COLUMN_GROUPS,
  ATTENDANCE_EXPORT_IDENTITY_COLUMNS,
  ATTENDANCE_EXPORT_STATUS_DESCRIPTIONS,
  ATTENDANCE_EXPORT_STATUS_LABELS,
  ATTENDANCE_EXPORT_STATUSES,
  type AttendanceDayStatus,
  type AttendanceExportColumnGroup,
  type AttendanceExportStatus,
} from "@hris/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttendancePeople } from "../api";
import {
  AttendanceExportPeoplePicker,
  type PickedEmployee,
} from "./attendance-export-people-picker";

// TM-D34: bagian-bagian dialog export Detail (pola dialog "Ekspor data karyawan"): Karyawan, Kelompok kolom,
// Filter baris. Aturan pemilihan & akses tetap dijaga API; di sini hanya kemudahan pakai.

export type EmployeeMode = "CREW" | "EMPLOYEES" | "PAGE_FILTER";

/** Filter Data Absen Harian saat dialog dibuka (diambil sekali; tidak ikut berubah). */
export interface PageFilters {
  tab: "inbox" | "all";
  /** Pencarian nama/NIP (sudah di-trim; kosong = tanpa pencarian). */
  q: string;
  /** Status halaman (hanya tab "all"). */
  status: string | undefined;
  labeledOnly: boolean;
}

export const ALL_STATUSES: readonly AttendanceExportStatus[] = ATTENDANCE_EXPORT_STATUSES;
export const DEFAULT_GROUPS: readonly AttendanceExportColumnGroup[] =
  ATTENDANCE_EXPORT_DEFAULT_COLUMN_GROUPS;

/** Status halaman → kelompok status export. Tab "Butuh keputusan" → Menunggu (tidak sama persis). */
export function pageStatuses(f: PageFilters): AttendanceExportStatus[] {
  if (f.tab === "inbox") return ["PENDING"];
  if (!f.status) return [...ALL_STATUSES];
  if (f.status === "OPEN" || f.status === "PENDING") return ["PENDING"];
  const known = f.status as AttendanceExportStatus;
  return ALL_STATUSES.includes(known) ? [known] : [...ALL_STATUSES];
}

export function pageFilterSummary(f: PageFilters): string {
  const parts: string[] = [];
  if (f.q) parts.push(`Cari "${f.q}"`);
  if (f.tab === "inbox") parts.push("tab Butuh keputusan");
  else if (f.status)
    parts.push(
      `status ${ATTENDANCE_DAY_STATUS_LABELS[f.status as AttendanceDayStatus] ?? f.status}`,
    );
  if (f.labeledOnly) parts.push("hanya berlabel");
  return parts.length ? parts.join(", ") : "Tanpa filter tambahan";
}

const RADIO = "accent-brand size-4";
const CHECK = "accent-brand size-4";

export function EmployeeSection({
  mode,
  onMode,
  disabledCrewPick,
  crewMode,
  onCrewMode,
  crews,
  crewIds,
  onToggleCrew,
  includeNoCrew,
  onIncludeNoCrew,
  crewError,
  companyId,
  employees,
  onEmployees,
  pageFilters,
}: {
  mode: EmployeeMode;
  onMode: (mode: EmployeeMode) => void;
  disabledCrewPick: boolean;
  crewMode: "ALL" | "PICK";
  onCrewMode: (mode: "ALL" | "PICK") => void;
  crews: { isPending: boolean; isError: boolean; data: { id: string; name: string }[] | undefined };
  crewIds: string[];
  onToggleCrew: (id: string) => void;
  includeNoCrew: boolean;
  onIncludeNoCrew: (value: boolean) => void;
  crewError: string | undefined;
  companyId: string | undefined;
  employees: PickedEmployee[];
  onEmployees: (next: PickedEmployee[]) => void;
  pageFilters: PageFilters;
}) {
  const people = useAttendancePeople(
    { companyId, ...(pageFilters.q ? { q: pageFilters.q } : {}) },
    { enabled: mode === "PAGE_FILTER" && Boolean(pageFilters.q) },
  );
  const matches = people.data?.pages[0]?.meta.total;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold">Karyawan</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="employee-mode"
          className={RADIO}
          checked={mode === "CREW"}
          onChange={() => onMode("CREW")}
        />
        Sesuai crew
      </label>
      {mode === "CREW" ? (
        <div className="ml-6 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="crew-mode"
              className={RADIO}
              checked={crewMode === "ALL"}
              onChange={() => onCrewMode("ALL")}
            />
            Semua crew
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="crew-mode"
              className={RADIO}
              checked={crewMode === "PICK"}
              disabled={disabledCrewPick}
              onChange={() => onCrewMode("PICK")}
            />
            Pilih crew tertentu
          </label>
          {disabledCrewPick ? (
            <p className="text-muted-foreground text-xs">
              Pilih PT di bilah atas untuk memilih crew tertentu.
            </p>
          ) : null}
          {crewMode === "PICK" ? (
            crews.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : crews.isError ? (
              <p className="text-destructive text-xs" role="alert">
                Daftar crew gagal dimuat.
              </p>
            ) : (crews.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-xs">Belum ada crew di PT ini.</p>
            ) : (
              <fieldset className="max-h-40 min-w-0 space-y-1 overflow-y-auto rounded-md border p-2">
                <legend className="sr-only">Daftar crew</legend>
                {(crews.data ?? []).map((crew) => (
                  <label key={crew.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className={CHECK}
                      checked={crewIds.includes(crew.id)}
                      onChange={() => onToggleCrew(crew.id)}
                    />
                    {crew.name}
                  </label>
                ))}
              </fieldset>
            )
          ) : null}
          {crewError ? (
            <p className="text-destructive text-xs" role="alert">
              {crewError}
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={CHECK}
              checked={includeNoCrew}
              onChange={(e) => onIncludeNoCrew(e.target.checked)}
            />
            Sertakan karyawan tanpa crew
          </label>
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="employee-mode"
          className={RADIO}
          checked={mode === "EMPLOYEES"}
          onChange={() => onMode("EMPLOYEES")}
        />
        Pilih karyawan tertentu
      </label>
      {mode === "EMPLOYEES" ? (
        <div className="ml-6">
          <AttendanceExportPeoplePicker
            companyId={companyId}
            selected={employees}
            onChange={onEmployees}
          />
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="employee-mode"
          className={RADIO}
          checked={mode === "PAGE_FILTER"}
          onChange={() => onMode("PAGE_FILTER")}
        />
        Sesuai filter halaman ini
      </label>
      {mode === "PAGE_FILTER" ? (
        <div className="text-muted-foreground ml-6 space-y-1 text-xs">
          <p>{pageFilterSummary(pageFilters)}.</p>
          <p aria-live="polite">
            {pageFilters.q
              ? matches === undefined
                ? "Menghitung karyawan yang cocok…"
                : `${matches} karyawan cocok dengan pencarian.`
              : "Semua karyawan dalam cakupan, termasuk yang tanpa crew."}
          </p>
          {pageFilters.tab === "inbox" ? (
            <p>
              Tab "Butuh keputusan" diekspor sebagai status Menunggu; hasilnya tidak sama persis
              dengan "menunggu keputusan saya".
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

export function ColumnGroupsSection({
  groups,
  onChange,
}: {
  groups: AttendanceExportColumnGroup[];
  onChange: (next: AttendanceExportColumnGroup[]) => void;
}) {
  const toggle = (group: AttendanceExportColumnGroup, on: boolean) =>
    onChange(
      ATTENDANCE_EXPORT_COLUMN_GROUPS.filter((g) => (g === group ? on : groups.includes(g))),
    );
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-semibold">Kelompok kolom</legend>
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className={CHECK} checked disabled />
          Identitas
        </label>
        <p className="text-muted-foreground pl-6 text-xs">
          {ATTENDANCE_EXPORT_IDENTITY_COLUMNS.join(", ")} (selalu ada)
        </p>
      </div>
      {ATTENDANCE_EXPORT_COLUMN_GROUPS.map((group) => {
        const info = ATTENDANCE_EXPORT_COLUMN_GROUP_INFO[group];
        return (
          <div key={group} className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={CHECK}
                checked={groups.includes(group)}
                onChange={(e) => toggle(group, e.target.checked)}
              />
              {info.label}
            </label>
            <p className="text-muted-foreground pl-6 text-xs">
              {group === "SUMMARY"
                ? "Sheet ringkasan, bukan kolom."
                : group === "REASON"
                  ? "Alasan absen; yang panjang membuat file lebih besar."
                  : info.columns.join(", ")}
            </p>
          </div>
        );
      })}
    </fieldset>
  );
}

export function RowFilterSection({
  statuses,
  onStatuses,
  labeledOnly,
  onLabeledOnly,
  prefilled,
}: {
  statuses: AttendanceExportStatus[];
  onStatuses: (next: AttendanceExportStatus[]) => void;
  labeledOnly: boolean;
  onLabeledOnly: (value: boolean) => void;
  prefilled: boolean;
}) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-semibold">Filter baris</legend>
      {prefilled ? (
        <p className="text-muted-foreground text-xs sm:col-span-2">
          Terisi dari filter halaman; bisa diubah.
        </p>
      ) : null}
      {ATTENDANCE_EXPORT_STATUSES.map((status) => (
        <div key={status} className="space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={CHECK}
              checked={statuses.includes(status)}
              onChange={(e) =>
                onStatuses(
                  ATTENDANCE_EXPORT_STATUSES.filter((s) =>
                    s === status ? e.target.checked : statuses.includes(s),
                  ),
                )
              }
            />
            {ATTENDANCE_EXPORT_STATUS_LABELS[status]}
          </label>
          {ATTENDANCE_EXPORT_STATUS_DESCRIPTIONS[status] ? (
            <p className="text-muted-foreground pl-6 text-xs">
              {ATTENDANCE_EXPORT_STATUS_DESCRIPTIONS[status]}
            </p>
          ) : null}
        </div>
      ))}
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className={CHECK}
          checked={labeledOnly}
          onChange={(e) => onLabeledOnly(e.target.checked)}
        />
        Hanya yang berlabel
      </label>
      {statuses.length === 0 ? (
        <p className="text-destructive text-xs sm:col-span-2" role="alert">
          Pilih minimal satu status.
        </p>
      ) : null}
    </fieldset>
  );
}
