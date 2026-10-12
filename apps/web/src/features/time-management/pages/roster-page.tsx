import { OFF_CODE, ROSTER_SOURCE_LABELS, type RosterSource } from "@hris/shared";
import { CalendarRange, Eraser, FileUp, Paintbrush, Save, Settings2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { useCompanyScope } from "@/features/employee/api";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { tmAccess } from "../access";
import { useCrews, useRosterGrid, useRosterImport, useSetRosterCells } from "../api";
import { hhmm, todayIn } from "../components/display";
import { RosterFileError, type RosterFileRow, readRosterFile, rowsFromGrid } from "../roster-file";
import type { CellIssue, RosterGrid } from "../schemas";

// D-068: grid roster bulanan per PT. SA/HR PT: edit per sel (mode kuas) & import; MANAGER: tim (baca);
// karyawan: diri sendiri. Sumber sel terlihat (pola / manual / import / perubahan disetujui).

const ERASE = "__ERASE__";
const key = (employeeId: string, date: string) => `${employeeId}|${date}`;
const WEEKDAY = new Intl.DateTimeFormat("id-ID", { weekday: "narrow", timeZone: "UTC" });

/** PT yang dipakai halaman roster: pilihan cakupan, kalau tidak ada → PT pertama. */
export function useRosterCompany() {
  const scope = useCompanyScope();
  const [companyId, setCompanyId] = useState<string>("");
  const effective = companyId || scope.selectedId || scope.companies[0]?.id || "";
  return { companies: scope.companies, companyId: effective, setCompanyId };
}

export function RosterPage() {
  const me = useMe().data as Me;
  const { companies, companyId, setCompanyId } = useRosterCompany();
  const [month, setMonth] = useState(() => todayIn().slice(0, 7));
  const [crewId, setCrewId] = useState("");
  const crews = useCrews(companyId || undefined);
  const grid = useRosterGrid(companyId || undefined, month, crewId);
  const [importOpen, setImportOpen] = useState(false);
  const manage = tmAccess.manageRoster(me);

  return (
    <div>
      <PageHeader
        title="Roster Bulanan"
        description="Jadwal kerja per karyawan. Absen di luar roster tetap tercatat dengan label dan perlu alasan."
        actions={
          manage ? (
            <>
              <Button variant="outline" asChild>
                <Link to="/time/roster/pengaturan">
                  <Settings2 /> Shift, pola & crew
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!companyId}>
                <FileUp /> Import
              </Button>
            </>
          ) : null
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {companies.length > 1 ? (
          <FormSelect
            aria-label="Perusahaan"
            className="h-9 sm:w-56"
            value={companyId}
            onChange={(value) => {
              setCompanyId(value);
              setCrewId("");
            }}
            placeholder="Pilih perusahaan"
            options={companies.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
          />
        ) : null}
        <Input
          type="month"
          aria-label="Bulan"
          className="h-9 sm:w-44"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
        <FormSelect
          aria-label="Crew"
          className="h-9 sm:w-48"
          value={crewId}
          onChange={setCrewId}
          placeholder="Semua crew"
          noneLabel="Semua crew"
          options={(crews.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
      {!companyId ? (
        <EmptyState icon={CalendarRange} title="Belum ada perusahaan dalam cakupan akun ini" />
      ) : grid.isPending ? (
        <Skeleton className="h-96" />
      ) : grid.isError ? (
        <EmptyState
          icon={CalendarRange}
          title="Gagal memuat roster"
          description={errorMessage(grid.error)}
        />
      ) : (
        <RosterGridView key={`${companyId}-${month}-${crewId}`} grid={grid.data} />
      )}
      {manage && companyId ? (
        <ImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          companyId={companyId}
          month={month}
        />
      ) : null}
    </div>
  );
}

function RosterGridView({ grid }: { grid: RosterGrid }) {
  const save = useSetRosterCells();
  const [brush, setBrush] = useState<string | null>(null);
  const [pending, setPending] = useState<Map<string, string | null>>(new Map());
  const [issues, setIssues] = useState<Map<string, string>>(new Map());
  const painting = useRef(false);

  useEffect(() => {
    const stop = () => {
      painting.current = false;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const cells = useMemo(() => {
    const map = new Map<string, { code: string; source: string }>();
    for (const d of grid.days) map.set(key(d.employeeId, d.date), d);
    return map;
  }, [grid.days]);
  const holidays = useMemo(() => new Map(grid.holidays.map((h) => [h.date, h])), [grid.holidays]);
  const color = (code: string) => grid.shifts.find((s) => s.code === code)?.color ?? null;
  const activeShifts = grid.shifts.filter((s) => !s.archived);
  const today = todayIn();

  const paint = (employeeId: string, date: string) => {
    if (!brush || !grid.canEdit) return;
    const k = key(employeeId, date);
    const value = brush === ERASE ? null : brush;
    setPending((prev) => {
      const next = new Map(prev);
      const current = cells.get(k)?.code ?? null;
      if (current === value) next.delete(k);
      else next.set(k, value);
      return next;
    });
  };

  const submit = async () => {
    const list = [...pending.entries()].map(([k, code]) => {
      const [employeeId, date] = k.split("|") as [string, string];
      return { employeeId, date, code };
    });
    try {
      const result = await save.mutateAsync({ companyId: grid.companyId, cells: list });
      toast.success(`${result.updated} sel roster disimpan.`);
      setPending(new Map());
      setIssues(new Map());
    } catch (error) {
      if (error instanceof ApiError && Array.isArray(error.details)) {
        const map = new Map<string, string>();
        for (const issue of error.details as CellIssue[]) {
          const cell = list[issue.index];
          if (cell) map.set(key(cell.employeeId, cell.date), issue.message);
        }
        setIssues(map);
      }
      toast.error(errorMessage(error));
    }
  };

  if (grid.employees.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Belum ada karyawan di roster bulan ini"
        description={
          grid.canEdit
            ? "Buat shift, pola, dan crew lalu masukkan anggota — roster terbentuk otomatis dari pola."
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {grid.canEdit ? (
        <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-2">
          <span className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
            <Paintbrush className="size-3.5" /> Kuas:
          </span>
          {[...activeShifts.map((s) => s.code), OFF_CODE].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setBrush(brush === code ? null : code)}
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono text-xs font-semibold",
                brush === code && "ring-brand ring-2",
                code === OFF_CODE && "bg-muted text-muted-foreground",
              )}
              style={
                color(code)
                  ? { backgroundColor: `${color(code)}22`, color: color(code) ?? undefined }
                  : undefined
              }
              aria-pressed={brush === code}
            >
              {code}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setBrush(brush === ERASE ? null : ERASE)}
            className={cn(
              "flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs",
              brush === ERASE && "ring-brand ring-2",
            )}
            aria-pressed={brush === ERASE}
          >
            <Eraser className="size-3.5" /> Hapus
          </button>
          <div className="ml-auto flex items-center gap-2">
            {pending.size > 0 ? (
              <span className="text-muted-foreground text-xs">{pending.size} sel diubah</span>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending.size === 0}
              onClick={() => {
                setPending(new Map());
                setIssues(new Map());
              }}
            >
              <Undo2 /> Batal
            </Button>
            <Button
              size="sm"
              variant="brand"
              disabled={pending.size === 0 || save.isPending}
              onClick={() => void submit()}
            >
              <Save /> Simpan
            </Button>
          </div>
        </div>
      ) : null}

      <div
        className="bg-card overflow-auto rounded-xl border select-none"
        style={{ maxHeight: "70dvh" }}
      >
        <table className="border-separate border-spacing-0 text-xs">
          <thead className="bg-card sticky top-0 z-20">
            <tr>
              <th className="bg-card sticky left-0 z-30 min-w-52 border-r border-b px-3 py-2 text-left font-medium">
                Karyawan
              </th>
              {grid.dates.map((date) => {
                const holiday = holidays.get(date);
                const weekday = WEEKDAY.format(new Date(`${date}T00:00:00Z`));
                return (
                  <th
                    key={date}
                    title={holiday?.name}
                    className={cn(
                      "min-w-10 border-b px-1 py-1 text-center font-normal",
                      holiday && "bg-destructive/10 text-destructive",
                      date === today && "bg-brand-soft",
                    )}
                  >
                    <div className="text-muted-foreground text-[10px]">{weekday}</div>
                    <div className="font-medium">{Number(date.slice(8))}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grid.employees.map((employee, rowIndex) => {
              const crewChanged =
                rowIndex === 0 || grid.employees[rowIndex - 1]?.crew !== employee.crew;
              return (
                <tr
                  key={employee.id}
                  className={cn(crewChanged && rowIndex > 0 && "[&>*]:border-t-2")}
                >
                  <th className="bg-card sticky left-0 z-10 border-r border-b px-3 py-1.5 text-left font-normal">
                    <p className="truncate font-medium">{employee.fullName}</p>
                    <p className="text-muted-foreground truncate text-[10px]">
                      <span className="font-mono">{employee.employeeNumber ?? "—"}</span>
                      {employee.crew ? ` · ${employee.crew}` : ""}
                    </p>
                  </th>
                  {grid.dates.map((date) => {
                    const k = key(employee.id, date);
                    const saved = cells.get(k);
                    const isPending = pending.has(k);
                    const code = isPending ? pending.get(k) : saved?.code;
                    const c = code ? color(code) : null;
                    const issue = issues.get(k);
                    const source = saved?.source as RosterSource | undefined;
                    return (
                      <td
                        key={date}
                        title={[
                          issue,
                          source && !isPending ? `Sumber: ${ROSTER_SOURCE_LABELS[source]}` : null,
                          holidays.get(date)?.name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        onPointerDown={(e) => {
                          if (!brush) return;
                          e.preventDefault();
                          painting.current = true;
                          paint(employee.id, date);
                        }}
                        onPointerEnter={() => painting.current && paint(employee.id, date)}
                        className={cn(
                          "relative h-9 border-b p-0.5 text-center",
                          brush && grid.canEdit && "cursor-cell",
                          holidays.has(date) && "bg-destructive/5",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-full items-center justify-center rounded font-mono text-[11px] font-semibold",
                            code === OFF_CODE && "text-muted-foreground bg-muted",
                            isPending && "ring-brand ring-2",
                            issue && "ring-destructive ring-2",
                          )}
                          style={c ? { backgroundColor: `${c}22`, color: c } : undefined}
                        >
                          {code === null && isPending ? "×" : (code ?? "")}
                        </span>
                        {source && source !== "PATTERN" && !isPending ? (
                          <span
                            className={cn(
                              "absolute top-0.5 right-0.5 size-1.5 rounded-full",
                              source === "CHANGE"
                                ? "bg-success"
                                : source === "IMPORT"
                                  ? "bg-warning"
                                  : "bg-brand",
                            )}
                            aria-hidden
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {activeShifts.map((s) => (
          <span key={s.id}>
            <span
              className="font-mono font-semibold"
              style={s.color ? { color: s.color } : undefined}
            >
              {s.code}
            </span>{" "}
            {s.name} {hhmm(s.startMinute)}–{hhmm(s.endMinute)}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="bg-brand size-1.5 rounded-full" /> manual
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-warning size-1.5 rounded-full" /> import
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-success size-1.5 rounded-full" /> perubahan disetujui
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-destructive/20 size-2.5 rounded-sm" /> libur nasional / cuti bersama
        </span>
      </div>
    </div>
  );
}

function ImportDialog({
  open,
  onClose,
  companyId,
  month,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  month: string;
}) {
  const { preview, commit } = useRosterImport();
  const [rows, setRows] = useState<RosterFileRow[]>([]);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    format: string;
    problems: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const result = preview.data;

  const reset = () => {
    setRows([]);
    setFileInfo(null);
    setError("");
    preview.reset();
  };

  const onFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    try {
      const parsed = rowsFromGrid(await readRosterFile(file), month);
      if (parsed.rows.length === 0)
        throw new RosterFileError("Tidak ada baris roster yang terbaca.");
      setRows(parsed.rows);
      setFileInfo({ name: file.name, format: parsed.format, problems: parsed.problems });
      preview.mutate({ companyId, rows: parsed.rows });
    } catch (e) {
      setError(e instanceof RosterFileError ? e.message : errorMessage(e));
    }
  };

  const save = async () => {
    try {
      const saved = await commit.mutateAsync({ companyId, rows });
      toast.success(`${saved.saved} hari roster diimport.`);
      reset();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import roster</DialogTitle>
          <DialogDescription>
            File .xlsx/.csv dengan kolom <b>NIP, Tanggal, Kode</b>, atau grid bulanan: kolom NIP
            lalu satu kolom per tanggal (angka 1–31 dibaca sebagai bulan {month}). Kosong dilewati;
            "-", "L", "OFF" = libur. Simpan hanya bila semua baris valid.
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".xlsx,.csv" onChange={(e) => void onFile(e.target.files?.[0])} />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {fileInfo ? (
          <div className="space-y-2 text-sm">
            <p>
              {fileInfo.name} · format{" "}
              {fileInfo.format === "long" ? "baris per hari" : "grid bulanan"} · {rows.length} sel
            </p>
            {fileInfo.problems.length > 0 ? (
              <ul className="text-destructive list-disc pl-5 text-xs">
                {fileInfo.problems.slice(0, 10).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {preview.isPending ? <Skeleton className="h-16" /> : null}
        {preview.isError ? (
          <p className="text-destructive text-sm">{errorMessage(preview.error)}</p>
        ) : null}
        {result ? (
          <div className="space-y-2 text-sm">
            <p>
              <b>{result.valid}</b> dari {result.total} sel valid.
            </p>
            {result.issues.length > 0 ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
                {result.issues.map((issue) => (
                  <li key={`${issue.index}-${issue.date}`}>
                    <span className="font-mono">
                      {issue.employeeNumber ?? rows[issue.index]?.employeeNumber}
                    </span>{" "}
                    {issue.date}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
          <Button
            variant="brand"
            disabled={
              !result ||
              result.issues.length > 0 ||
              fileInfo?.problems.length !== 0 ||
              commit.isPending
            }
            onClick={() => void save()}
          >
            {commit.isPending ? "Menyimpan…" : "Simpan import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
