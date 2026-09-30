import type { ImportFieldKey } from "@hris/shared";
import { ArrowLeft, Download, FolderPlus, Save, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { FormSelect } from "@/components/form-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MasterData } from "../schemas";
import type { ImportPreview } from "./api";
import { ACTION_LABELS, fieldLabel, issueText } from "./labels";

export type MasterMap = {
  departments: Record<string, string>;
  positions: Record<string, string>;
  grades: Record<string, string>;
  workLocations: Record<string, string>;
};
export const masterKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
export const positionKey = (department: string, name: string) =>
  `${masterKey(department)}|${masterKey(name)}`;

type Filter = "ALL" | "CREATE" | "UPDATE" | "SKIP" | "ERROR";

const ACTION_BADGE = {
  CREATE: "success",
  UPDATE: "secondary",
  SKIP: "muted",
  ERROR: "destructive",
} as const;

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

export function PreviewStep({
  preview,
  master,
  masterMap,
  onMasterMapChange,
  columnOf,
  onBack,
  onCommit,
  onDownloadIssues,
  busy,
}: {
  preview: ImportPreview;
  master: MasterData | undefined;
  masterMap: MasterMap;
  onMasterMapChange: (next: MasterMap) => void;
  columnOf: (field: ImportFieldKey) => number | undefined;
  onBack: () => void;
  onCommit: () => void;
  onDownloadIssues: () => void;
  busy: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const { counts, masterData } = preview;
  const writable = counts.create + counts.update;
  const problems = preview.rows.filter((r) => r.issues.length > 0).length;
  const rows = useMemo(
    () => (filter === "ALL" ? preview.rows : preview.rows.filter((r) => r.action === filter)),
    [preview.rows, filter],
  );
  const newMaster =
    masterData.departments.length +
    masterData.positions.length +
    masterData.grades.length +
    masterData.workLocations.length;

  const departmentsById = new Map((master?.departments ?? []).map((d) => [d.id, d.name]));
  const pick = (
    group: keyof MasterMap,
    key: string,
    label: string,
    options: { value: string; label: string; hint?: string }[],
  ) => (
    <div
      key={`${group}-${key}`}
      className="grid gap-1.5 sm:grid-cols-[1fr_minmax(0,280px)] sm:items-center"
    >
      <p className="truncate text-sm" title={label}>
        {label}
      </p>
      <FormSelect
        aria-label={`Pemetaan ${label}`}
        value={masterMap[group][key] ?? ""}
        onChange={(value) => {
          const next = { ...masterMap[group] };
          if (value) next[key] = value;
          else delete next[key];
          onMasterMapChange({ ...masterMap, [group]: next });
        }}
        noneLabel="Buat baru"
        placeholder="Buat baru"
        options={options}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 max-sm:[&>*:last-child]:col-span-2">
        <Stat label="Akan dibuat" value={counts.create} tone="text-success-soft-foreground" />
        <Stat label="Akan diperbarui" value={counts.update} />
        <Stat label="Dilewati" value={counts.skip} />
        <Stat
          label="Error (tidak diimpor)"
          value={counts.error}
          tone={counts.error ? "text-destructive" : ""}
        />
        <Stat label="Baris kosong" value={counts.blank} />
      </div>

      {preview.skippedFields.length > 0 ? (
        <Alert>
          <ShieldAlert />
          <AlertTitle>Kolom sensitif dilewati</AlertTitle>
          <AlertDescription>
            Akun Anda tidak punya izin menulis data pribadi/rekening, jadi kolom berikut tidak
            diimpor: {preview.skippedFields.map(fieldLabel).join(", ")}. Minta Super Admin memberi
            grant bila perlu.
          </AlertDescription>
        </Alert>
      ) : null}

      {newMaster > 0 ? (
        <div className="bg-card space-y-4 rounded-2xl border p-5">
          <div className="flex items-start gap-3">
            <FolderPlus className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-medium">Master data baru ({newMaster})</p>
              <p className="text-muted-foreground text-sm">
                Nilai ini belum ada di sistem dan akan dibuat. Bila sebenarnya sama dengan data yang
                sudah ada (mis. singkatan), pilih data tersebut.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {masterData.departments.map((name) =>
              pick(
                "departments",
                masterKey(name),
                `Departemen: ${name}`,
                (master?.departments ?? []).map((d) => ({ value: d.id, label: d.name })),
              ),
            )}
            {masterData.positions.map((p) =>
              pick(
                "positions",
                positionKey(p.department, p.name),
                `Jabatan: ${p.name} (${p.department})`,
                (master?.positions ?? []).map((pos) => ({
                  value: pos.id,
                  label: pos.name,
                  hint: departmentsById.get(pos.departmentId),
                })),
              ),
            )}
            {masterData.grades.map((name) =>
              pick(
                "grades",
                masterKey(name),
                `Grade: ${name}`,
                (master?.grades ?? []).map((g) => ({ value: g.id, label: g.name })),
              ),
            )}
            {masterData.workLocations.map((name) =>
              pick(
                "workLocations",
                masterKey(name),
                `Lokasi kerja: ${name}`,
                (master?.workLocations ?? []).map((l) => ({ value: l.id, label: l.name })),
              ),
            )}
          </div>
        </div>
      ) : null}

      <nav aria-label="Saring baris" className="flex flex-wrap gap-1.5">
        {(["ALL", "CREATE", "UPDATE", "SKIP", "ERROR"] as const).map((key) => {
          const count =
            key === "ALL"
              ? preview.rows.length
              : preview.rows.filter((r) => r.action === key).length;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                filter === key
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "ALL" ? "Semua" : ACTION_LABELS[key]}
              <span className="font-mono text-xs tabular-nums">{count}</span>
            </button>
          );
        })}
      </nav>

      <div className="bg-card overflow-hidden rounded-2xl border">
        <div className="max-h-[60vh] overflow-auto">
          <Table aria-label="Pratinjau baris import">
            <TableHeader className="bg-card sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-16">Baris</TableHead>
                <TableHead>Karyawan</TableHead>
                <TableHead className="w-28">Aksi</TableHead>
                <TableHead className="min-w-[260px]">Perubahan / masalah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.sourceRow} className="align-top">
                  <TableCell className="font-mono text-xs">{r.sourceRow}</TableCell>
                  <TableCell>
                    <p className="font-medium">{r.fullName ?? "—"}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {r.employeeNumber ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_BADGE[r.action]}>{ACTION_LABELS[r.action]}</Badge>
                  </TableCell>
                  <TableCell className="space-y-1 text-sm">
                    {r.action === "UPDATE" && r.changes.length > 0 ? (
                      <p className="text-muted-foreground">
                        Berubah: {r.changes.map(fieldLabel).join(", ")}
                      </p>
                    ) : null}
                    {r.action === "SKIP" && r.issues.length === 0 ? (
                      <p className="text-muted-foreground">Tidak ada perubahan</p>
                    ) : null}
                    {r.issues.map((i) => (
                      <p
                        key={`${i.field}-${i.code}`}
                        className={
                          i.severity === "ERROR"
                            ? "text-destructive"
                            : "text-warning-soft-foreground"
                        }
                      >
                        {issueText(i, columnOf)}
                      </p>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground py-10 text-center">
                    Tidak ada baris pada kategori ini.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Kembali ke pemetaan
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          {problems > 0 ? (
            <Button variant="outline" onClick={onDownloadIssues}>
              <Download /> Unduh baris bermasalah ({problems})
            </Button>
          ) : null}
          <Button variant="brand" onClick={onCommit} disabled={writable === 0 || busy}>
            <Save /> {busy ? "Menyimpan…" : `Simpan ${writable} karyawan`}
          </Button>
        </div>
      </div>
    </div>
  );
}
