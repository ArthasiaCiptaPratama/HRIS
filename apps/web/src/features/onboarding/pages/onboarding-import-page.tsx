import {
  type ColumnSuggestion,
  cleanText,
  type DetectedSheet,
  type Gender,
  ONBOARDING_MAX_ROWS,
  type OnboardingCandidateInput,
  ORG_UNIT_TYPE_LABELS,
  parseEmail,
  parseGender,
  parsePhone,
  pickSheet,
  suggestMapping,
} from "@hris/shared";
import { CheckCircle2, FileUp, LoaderCircle, MailCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompanyScope, useMasterData } from "@/features/employee/api";
import { parseImportFile, serializeCell } from "@/features/employee/import/parse-file";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  useCreateOnboardingBatch,
  useOnboardingBatch,
  usePreviewOnboarding,
  useProcessInvitations,
} from "../api";
import type { OnboardingPreview } from "../schemas";

// D-045 bagian a: impor calon dari file portal. File diurai DI BROWSER dan tidak disimpan (UU PDP);
// server memvalidasi ulang setiap baris saat pratinjau & simpan.

type Step = "upload" | "mapping" | "select" | "work" | "confirm" | "progress";
const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Unggah" },
  { key: "mapping", label: "Pemetaan" },
  { key: "select", label: "Pilih yang lolos" },
  { key: "work", label: "Data kerja" },
  { key: "confirm", label: "Konfirmasi undangan" },
  { key: "progress", label: "Pengiriman" },
];

type FieldKey = "fullName" | "email" | "phone" | "gender";
const FIELDS: { key: FieldKey; label: string; required: boolean; from: string }[] = [
  { key: "fullName", label: "Nama lengkap", required: true, from: "fullName" },
  // Kolom "email" portal = email pribadi calon (login & undangan, D-045).
  { key: "email", label: "Email pribadi", required: true, from: "workEmail" },
  { key: "phone", label: "No. HP", required: false, from: "phoneNumber" },
  { key: "gender", label: "Jenis kelamin", required: false, from: "gender" },
];

interface SourceRow {
  sourceRow: number;
  fullName: string;
  email: string | null;
  emailRaw: string;
  phone: string | null;
  gender: Gender | null;
}

interface WorkData {
  companyId: string;
  employmentStatusId: string;
  departmentId: string;
  positionId: string;
  joinDate: string;
  workLocationId: string;
  gradeId: string;
}

interface CandidateState {
  row: SourceRow;
  /** Kosong = ikut data kerja bawaan. */
  positionId: string;
  /** Kosong = ikut tanggal masuk bawaan. */
  joinDate: string;
  employeeNumber: string;
  /** true = nomor induk hasil usulan pratinjau (dihapus bila tanggal/PT berubah). */
  numberSuggested: boolean;
  invite: boolean;
}

function Stepper({ current }: { current: Step }) {
  const index = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm" aria-label="Langkah penerimaan">
      {STEPS.map((step, i) => (
        <li
          key={step.key}
          className="flex items-center gap-2"
          aria-current={i === index ? "step" : undefined}
        >
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full border text-xs font-medium",
              i < index && "bg-brand border-brand text-brand-foreground",
              i === index && "border-foreground bg-foreground text-background",
              i > index && "text-muted-foreground",
            )}
          >
            {i + 1}
          </span>
          <span className={i === index ? "font-medium" : "text-muted-foreground"}>
            {step.label}
          </span>
          {i < STEPS.length - 1 ? (
            <span className="bg-border mx-1 hidden h-px w-6 sm:block" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

export function OnboardingImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [batchName, setBatchName] = useState(`Penerimaan ${todayIso()}`);
  const [file, setFile] = useState<{ name: string; sha256: string } | null>(null);
  const [detected, setDetected] = useState<DetectedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    fullName: "",
    email: "",
    phone: "",
    gender: "",
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [work, setWork] = useState<WorkData>({
    companyId: "",
    employmentStatusId: "",
    departmentId: "",
    positionId: "",
    joinDate: todayIso(),
    workLocationId: "",
    gradeId: "",
  });
  const [candidates, setCandidates] = useState<CandidateState[]>([]);
  const [preview, setPreview] = useState<OnboardingPreview | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  // ── Langkah 1: unggah & deteksi ────────────────────────────────────────────
  const onFile = async (input: File) => {
    setParsing(true);
    try {
      const book = await parseImportFile(input);
      const picked = pickSheet(book.sheets);
      if (!picked) throw new Error("Tidak menemukan tabel berisi header di file ini.");
      const suggestions: ColumnSuggestion[] = suggestMapping(picked.detected);
      const pick = (field: string) =>
        String(suggestions.find((s) => s.field === field)?.column ?? "");
      setDetected(picked.detected);
      setFile({ name: book.fileName, sha256: book.sha256 });
      setMapping({
        fullName: pick("fullName"),
        email: pick("workEmail"),
        phone: pick("phoneNumber"),
        gender: pick("gender"),
      });
      setSelected(new Set());
      setStep("mapping");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "File tidak bisa dibaca.");
    } finally {
      setParsing(false);
    }
  };

  // ── Langkah 2: baris sumber dari pemetaan ──────────────────────────────────
  const rows: SourceRow[] = useMemo(() => {
    if (!detected) return [];
    const cell = (cells: unknown[], key: FieldKey) => {
      const index = mapping[key] === "" ? -1 : Number(mapping[key]);
      return index >= 0 ? serializeCell((cells[index] ?? null) as never) : null;
    };
    const result: SourceRow[] = [];
    for (const row of detected.rows) {
      const fullName = cleanText(cell(row.cells, "fullName")) ?? "";
      const emailRaw = cleanText(cell(row.cells, "email")) ?? "";
      if (!fullName && !emailRaw) continue;
      const email = parseEmail(emailRaw);
      const phone = parsePhone(cell(row.cells, "phone"));
      const gender = parseGender(cell(row.cells, "gender"));
      result.push({
        sourceRow: row.sourceRow,
        fullName,
        emailRaw,
        email: email && "value" in email ? email.value : null,
        phone: phone && "value" in phone ? phone.value : null,
        gender: gender && "value" in gender ? gender.value : null,
      });
    }
    return result.slice(0, ONBOARDING_MAX_ROWS);
  }, [detected, mapping]);

  const mappingReady = mapping.fullName !== "" && mapping.email !== "";

  // ── Langkah 4: data kerja ──────────────────────────────────────────────────
  const master = useMasterData();
  const scope = useCompanyScope();
  const positionsIn = (departmentId: string) =>
    (master.data?.positions ?? []).filter((p) => p.departmentId === departmentId);
  const departmentOf = (positionId: string) =>
    master.data?.positions.find((p) => p.id === positionId)?.departmentId ?? "";
  useEffect(() => {
    if (!work.companyId && scope.companies.length === 1) {
      setWork((w) => ({ ...w, companyId: scope.companies[0]?.id ?? "" }));
    }
  }, [scope.companies, work.companyId]);

  const goToWork = () => {
    const chosen = rows.filter((r) => selected.has(r.sourceRow));
    setCandidates(
      chosen.map((row) => ({
        row,
        positionId: "",
        joinDate: "",
        employeeNumber: "",
        numberSuggested: false,
        invite: true,
      })),
    );
    setPreview(null);
    setStep("work");
  };

  const toInput = (c: CandidateState, withNumber: boolean): OnboardingCandidateInput => ({
    sourceRow: c.row.sourceRow,
    fullName: c.row.fullName,
    personalEmail: c.row.email ?? c.row.emailRaw,
    phoneNumber: c.row.phone,
    gender: c.row.gender,
    companyId: work.companyId,
    employmentStatusId: work.employmentStatusId,
    positionId: c.positionId || work.positionId,
    joinDate: c.joinDate || work.joinDate,
    workLocationId: work.workLocationId || null,
    gradeId: work.gradeId || null,
    ...(withNumber && c.employeeNumber ? { employeeNumber: c.employeeNumber } : {}),
    invite: c.invite,
  });

  const runPreview = usePreviewOnboarding();
  const workReady =
    Boolean(work.companyId && work.employmentStatusId && work.joinDate) &&
    candidates.every((c) => c.positionId || work.positionId);
  const doPreview = async () => {
    try {
      const result = await runPreview.mutateAsync(candidates.map((c) => toInput(c, true)));
      setPreview(result);
      setCandidates((list) =>
        list.map((c) => {
          const row = result.rows.find((r) => r.sourceRow === c.row.sourceRow);
          return row?.employeeNumber && !c.employeeNumber
            ? { ...c, employeeNumber: row.employeeNumber, numberSuggested: true }
            : c;
        }),
      );
      if (result.valid) toast.success("Semua calon valid. Lanjut ke konfirmasi undangan.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  /**
   * Data kerja berubah → pratinjau lama tidak berlaku lagi. Nomor induk usulan bergantung pada tanggal
   * masuk & PT, jadi ikut dihapus (nomor ketikan pengguna dipertahankan).
   */
  const changeWork = (patch: Partial<WorkData>) => {
    setWork((w) => ({ ...w, ...patch }));
    setPreview(null);
    if ("joinDate" in patch || "companyId" in patch) {
      setCandidates((list) =>
        list.map((c) =>
          c.numberSuggested ? { ...c, employeeNumber: "", numberSuggested: false } : c,
        ),
      );
    }
  };
  const issuesOf = (sourceRow: number) =>
    preview?.rows.find((r) => r.sourceRow === sourceRow)?.issues ?? [];

  // ── Langkah 5–6: simpan & progres ─────────────────────────────────────────
  const create = useCreateOnboardingBatch();
  const inviteCount = candidates.filter((c) => c.invite).length;
  const save = async () => {
    try {
      const batch = await create.mutateAsync({
        name: batchName.trim() || `Penerimaan ${todayIso()}`,
        sourceFileName: file?.name ?? null,
        sourceFileSha256: file?.sha256 ?? null,
        candidates: candidates.map((c) => toInput(c, true)),
      });
      setBatchId(batch.id);
      setStep("progress");
    } catch (error) {
      toast.error(errorMessage(error), {
        description: "Muat ulang pratinjau di langkah Data kerja lalu coba lagi.",
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="Impor calon karyawan"
        description="File diurai di browser dan tidak disimpan. Hanya calon yang dicentang yang disimpan."
      />
      <Stepper current={step} />

      {step === "upload" ? (
        <section className="max-w-xl space-y-4">
          <div className="space-y-2">
            <Label htmlFor="batch-name">Nama penerimaan</Label>
            <Input
              id="batch-name"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
            />
          </div>
          <label
            htmlFor="onboarding-file"
            className="hover:bg-muted/40 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center"
          >
            {parsing ? <LoaderCircle className="animate-spin" /> : <FileUp />}
            <span className="font-medium">Pilih file ekspor portal (.xlsx atau .csv)</span>
            <span className="text-muted-foreground text-xs">
              Maks {ONBOARDING_MAX_ROWS} baris. Kolom nama & email wajib ada.
            </span>
            <input
              id="onboarding-file"
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              onChange={(e) => {
                const input = e.target.files?.[0];
                if (input) void onFile(input);
                e.target.value = "";
              }}
            />
          </label>
          <p className="text-muted-foreground text-sm">
            Contoh format (data dummy):{" "}
            <a
              className="underline underline-offset-4"
              href="/template/Template-calon-karyawan.csv"
              download
            >
              Template-calon-karyawan.csv
            </a>
          </p>
        </section>
      ) : null}

      {step === "mapping" && detected ? (
        <section className="max-w-xl space-y-4">
          <p className="text-muted-foreground text-sm">
            {file?.name} · {detected.rows.length} baris data. Periksa kolom yang dikenali otomatis.
          </p>
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`map-${field.key}`}>
                {field.label}
                {field.required ? null : (
                  <span className="text-muted-foreground font-normal"> (opsional)</span>
                )}
              </Label>
              <FormSelect
                id={`map-${field.key}`}
                value={mapping[field.key]}
                onChange={(value) => setMapping((m) => ({ ...m, [field.key]: value }))}
                placeholder="Pilih kolom"
                noneLabel={field.required ? undefined : "Tidak ada"}
                options={detected.headers.map((header, index) => ({
                  value: String(index),
                  label: header || `Kolom ${index + 1}`,
                }))}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("upload")}>
              Kembali
            </Button>
            <Button variant="brand" disabled={!mappingReady} onClick={() => setStep("select")}>
              Lanjut ({rows.length} calon)
            </Button>
          </div>
        </section>
      ) : null}

      {step === "select" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-brand size-4"
                checked={selected.size > 0 && selected.size === rows.filter((r) => r.email).length}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? new Set(rows.filter((r) => r.email).map((r) => r.sourceRow))
                      : new Set(),
                  )
                }
              />
              Pilih semua yang emailnya valid
            </label>
            <span className="text-muted-foreground">
              {selected.size} dari {rows.length} dipilih lolos
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" aria-label="Calon dari file">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="w-10 p-2">
                    <span className="sr-only">Lolos</span>
                  </th>
                  <th className="p-2">Baris</th>
                  <th className="p-2">Nama</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">No. HP</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.sourceRow} className={cn(!row.email && "text-muted-foreground")}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={`Lolos: ${row.fullName}`}
                        className="accent-brand size-4"
                        disabled={!row.email}
                        checked={selected.has(row.sourceRow)}
                        onChange={(e) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (e.target.checked) next.add(row.sourceRow);
                            else next.delete(row.sourceRow);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="p-2 tabular-nums">{row.sourceRow}</td>
                    <td className="p-2">{row.fullName || "—"}</td>
                    <td className="p-2">
                      {row.email ?? (
                        <span className="text-destructive">
                          {row.emailRaw || "kosong"} (tidak valid)
                        </span>
                      )}
                    </td>
                    <td className="p-2">{row.phone ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("mapping")}>
              Kembali
            </Button>
            <Button variant="brand" disabled={selected.size === 0} onClick={goToWork}>
              Lanjut ({selected.size} calon lolos)
            </Button>
          </div>
        </section>
      ) : null}

      {step === "work" ? (
        <section className="space-y-5">
          <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
            <p className="text-sm font-medium sm:col-span-3">
              Data kerja bawaan (berlaku untuk semua calon; jabatan & tanggal masuk bisa diubah per
              baris)
            </p>
            <SelectField
              id="w-company"
              label="Perusahaan"
              value={work.companyId}
              onChange={(v) => changeWork({ companyId: v })}
              options={scope.companies.map((c) => ({ value: c.id, label: c.code, hint: c.name }))}
            />
            <SelectField
              id="w-status"
              label="Status kepegawaian"
              value={work.employmentStatusId}
              onChange={(v) => changeWork({ employmentStatusId: v })}
              options={(master.data?.employmentStatuses ?? []).map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />
            <div className="space-y-2">
              <Label htmlFor="w-join">Tanggal masuk</Label>
              <Input
                id="w-join"
                type="date"
                value={work.joinDate}
                onChange={(e) => changeWork({ joinDate: e.target.value })}
              />
            </div>
            <SelectField
              id="w-unit"
              label="Unit organisasi"
              value={work.departmentId}
              onChange={(v) => changeWork({ departmentId: v, positionId: "" })}
              options={(master.data?.departments ?? []).map((d) => ({
                value: d.id,
                label: d.name,
                hint: ORG_UNIT_TYPE_LABELS[d.unitType],
              }))}
            />
            <SelectField
              id="w-position"
              label="Jabatan"
              value={work.positionId}
              onChange={(v) => changeWork({ positionId: v })}
              options={positionsIn(work.departmentId).map((p) => ({ value: p.id, label: p.name }))}
            />
            <SelectField
              id="w-location"
              label="Lokasi kerja"
              optional
              value={work.workLocationId}
              onChange={(v) => changeWork({ workLocationId: v })}
              options={(master.data?.workLocations ?? []).map((l) => ({
                value: l.id,
                label: l.name,
              }))}
            />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" aria-label="Data kerja per calon">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2">Calon</th>
                  <th className="p-2">Jabatan</th>
                  <th className="p-2">Tanggal masuk</th>
                  <th className="p-2">Nomor induk</th>
                  <th className="p-2">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {candidates.map((c, i) => {
                  const issues = issuesOf(c.row.sourceRow);
                  const update = (patch: Partial<CandidateState>) => {
                    setPreview(null);
                    setCandidates((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  };
                  const dept = departmentOf(c.positionId || work.positionId) || work.departmentId;
                  return (
                    <tr key={c.row.sourceRow}>
                      <td className="p-2">
                        <p className="font-medium">{c.row.fullName}</p>
                        <p className="text-muted-foreground text-xs">{c.row.email}</p>
                      </td>
                      <td className="min-w-48 p-2">
                        <FormSelect
                          aria-label={`Jabatan ${c.row.fullName}`}
                          value={c.positionId || work.positionId}
                          onChange={(v) => update({ positionId: v })}
                          placeholder="Ikuti bawaan"
                          options={positionsIn(dept).map((p) => ({ value: p.id, label: p.name }))}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="date"
                          aria-label={`Tanggal masuk ${c.row.fullName}`}
                          value={c.joinDate || work.joinDate}
                          onChange={(e) =>
                            update({
                              joinDate: e.target.value,
                              ...(c.numberSuggested
                                ? { employeeNumber: "", numberSuggested: false }
                                : {}),
                            })
                          }
                        />
                      </td>
                      <td className="min-w-44 p-2">
                        <Input
                          aria-label={`Nomor induk ${c.row.fullName}`}
                          className="font-mono"
                          placeholder="Otomatis saat pratinjau"
                          value={c.employeeNumber}
                          onChange={(e) =>
                            update({ employeeNumber: e.target.value, numberSuggested: false })
                          }
                        />
                      </td>
                      <td className="p-2 text-xs">
                        {issues.length === 0 ? (
                          preview ? (
                            <span className="text-success-soft-foreground">OK</span>
                          ) : null
                        ) : (
                          <ul className="text-destructive space-y-0.5">
                            {issues.map((issue) => (
                              <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setStep("select")}>
              Kembali
            </Button>
            <Button
              variant="outline"
              disabled={!workReady || runPreview.isPending}
              onClick={doPreview}
            >
              {runPreview.isPending ? "Memeriksa…" : "Pratinjau & isi nomor induk"}
            </Button>
            <Button
              variant="brand"
              disabled={!preview?.valid || candidates.some((c) => !c.employeeNumber)}
              onClick={() => setStep("confirm")}
            >
              Lanjut ke konfirmasi
            </Button>
          </div>
        </section>
      ) : null}

      {step === "confirm" ? (
        <section className="space-y-4">
          <Alert>
            <TriangleAlert />
            <AlertDescription>
              Periksa alamat email sebelum mengirim. Undangan dikirim bertahap (± 25 per jam). Calon
              yang tidak dicentang tetap disimpan dengan status "Belum diundang".
            </AlertDescription>
          </Alert>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" aria-label="Konfirmasi undangan">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="w-10 p-2">
                    <span className="sr-only">Kirim undangan</span>
                  </th>
                  <th className="p-2">Nama</th>
                  <th className="p-2">Email tujuan</th>
                  <th className="p-2">Nomor induk</th>
                  <th className="p-2">Tanggal masuk</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {candidates.map((c, i) => (
                  <tr key={c.row.sourceRow} className={cn(!c.invite && "text-muted-foreground")}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={`Undang ${c.row.fullName}`}
                        className="accent-brand size-4"
                        checked={c.invite}
                        onChange={(e) =>
                          setCandidates((list) =>
                            list.map((x, j) => (j === i ? { ...x, invite: e.target.checked } : x)),
                          )
                        }
                      />
                    </td>
                    <td className="p-2 font-medium">{c.row.fullName}</td>
                    <td className="p-2">{c.row.email}</td>
                    <td className="p-2 font-mono">{c.employeeNumber}</td>
                    <td className="p-2 tabular-nums">{c.joinDate || work.joinDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("work")}>
              Kembali
            </Button>
            <Button variant="brand" disabled={create.isPending} onClick={save}>
              {create.isPending
                ? "Menyimpan…"
                : inviteCount === 0
                  ? "Simpan tanpa mengirim undangan"
                  : `Simpan & kirim ${inviteCount} undangan`}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "progress" && batchId ? <ProgressStep batchId={batchId} /> : null}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  optional,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; hint?: string }[];
  optional?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="text-muted-foreground font-normal"> (opsional)</span> : null}
      </Label>
      <FormSelect
        id={id}
        value={value}
        onChange={onChange}
        placeholder={`Pilih ${label.toLowerCase()}`}
        {...(optional ? { noneLabel: "Tidak diisi" } : {})}
        options={options}
      />
    </div>
  );
}

/** Langkah 6: proses antrean bertahap selama halaman terbuka (cron harian sebagai cadangan). */
function ProgressStep({ batchId }: { batchId: string }) {
  const batch = useOnboardingBatch(batchId);
  const process = useProcessInvitations();
  const [paused, setPaused] = useState<"rate" | "error" | null>(null);
  const running = useRef(false);
  const queued = batch.data?.invitations.queued ?? 0;

  useEffect(() => {
    if (paused || queued === 0 || running.current) return;
    running.current = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await process.mutateAsync();
        if (result.rateLimited) setPaused("rate");
      } catch {
        setPaused("error");
      } finally {
        running.current = false;
        void batch.refetch();
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [queued, paused, process, batch]);

  if (!batch.data) return <LoaderCircle className="animate-spin" />;
  const { invitations, createdCount, invitedCount } = batch.data;
  const done = invitations.sent + invitations.failed;
  const percent = invitedCount === 0 ? 100 : Math.round((done / invitedCount) * 100);
  return (
    <section className="max-w-xl space-y-4">
      <div className="flex items-center gap-2 text-lg font-semibold">
        {queued === 0 ? <CheckCircle2 className="text-success-soft-foreground" /> : <MailCheck />}
        {createdCount} calon disimpan
      </div>
      {invitedCount === 0 ? (
        <p className="text-muted-foreground text-sm">
          Tidak ada undangan yang dikirim. Calon tersimpan dengan status "Belum diundang"; kirim
          undangan kapan saja dari daftar penerimaan (tombol Undang).
        </p>
      ) : (
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>Undangan terkirim</span>
            <span className="tabular-nums">
              {invitations.sent}/{invitedCount}
            </span>
          </div>
          <div
            className="bg-muted h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-label="Progres pengiriman undangan"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="bg-brand h-full transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            Antre {invitations.queued} · Gagal {invitations.failed}
            {paused && queued > 0
              ? paused === "rate"
                ? " · Batas kirim per jam tercapai; sisa dikirim otomatis nanti (boleh tinggalkan halaman)."
                : " · Pengiriman tertunda karena gangguan; sisa dikirim otomatis nanti (boleh tinggalkan halaman)."
              : ""}
          </p>
        </div>
      )}
      <Button variant="brand" asChild>
        <Link to="/penerimaan">Ke daftar penerimaan</Link>
      </Button>
    </section>
  );
}
