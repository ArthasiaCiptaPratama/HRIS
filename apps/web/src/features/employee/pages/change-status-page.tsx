import { zodResolver } from "@hookform/resolvers/zod";
import {
  CONTRACT_STATUS_LABELS,
  type CreateContractInput,
  contractStageLabel,
  contractSummary,
  createContractInputSchema,
  EMPLOYMENT_CATEGORY_LABELS,
  type EmploymentCategory,
  EXIT_REASON_LABELS,
  EXIT_REASONS,
  type ExitReason,
  employmentStatusDisplay,
  employmentTier,
} from "@hris/shared";
import { ArrowLeft, ArrowRight, Power, TriangleAlert, UserRoundSearch } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { FEATURES } from "@/app/feature-flags";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { OpenHoldingsWarning } from "@/features/assets/components/holdings";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useChangeStatus,
  useDeactivateEmployee,
  useEmployee,
  useEmployeeContracts,
  useMasterData,
} from "../api";
import { ChoiceCard } from "../components/choice-card";
import {
  ContractPeriodFields,
  defaultContractEnd,
  validatePeriod,
} from "../components/contract-period-fields";
import { EmployeeAvatar } from "../components/employee-avatar";
import { EmployeePicker } from "../components/employee-picker";
import { ContractActionForm } from "../components/employment-contract-dialog";
import { StatusBadge } from "../components/status-badge";
import { ThlStreakChip } from "../components/thl-section";
import { tenure, todayIso } from "../labels";
import type { EmployeeDetail } from "../schemas";
import { CONTRACT_ACTION_OF, type StatusPageAction } from "../status-links";

const EXIT_HINTS: Record<ExitReason, string> = {
  RESIGNATION: "Karyawan mengajukan pengunduran diri.",
  TERMINATION: "Pemutusan hubungan kerja oleh perusahaan.",
  CONTRACT_ENDED: "Masa PKWT/magang selesai dan tidak diperpanjang.",
  RETIREMENT: "Mencapai usia pensiun.",
  DECEASED: "Karyawan meninggal dunia.",
  OTHER: "Alasan lain; jelaskan di catatan.",
  PROBATION_FAILED: "Karyawan tidak lulus masa percobaan.",
};

/**
 * KTR-D14 (2026-11-26, "ikutin best practice aja"): semua perubahan status — aksi kontrak, ubah
 * kategori, nonaktifkan — di halaman ini. Tautan dari profil membawa `aksi` + `kembali`.
 */
/** `kembali` hanya jalur relatif di origin aplikasi (cegah open redirect: `//host`, `\`, URL absolut). */
export function safeBack(raw: string | null): string | null {
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    // Validasi ulang hasil normalisasi (mis. "/.//host" → "//host") + hanya halaman Personal Management.
    const out = `${url.pathname}${url.search}${url.hash}`;
    if (out.startsWith("//") || out.includes("\\") || !out.startsWith("/personal/")) return null;
    return out;
  } catch {
    return null;
  }
}

export function ChangeStatusPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedId = params.get("pegawai");
  const action = (params.get("aksi") as StatusPageAction | null) ?? null;
  const back = safeBack(params.get("kembali"));
  const employee = useEmployee(selectedId, "work");

  const update = (changes: { id?: string | null; action?: StatusPageAction | null }) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if ("id" in changes) {
          if (changes.id) next.set("pegawai", changes.id);
          else next.delete("pegawai");
          next.delete("kembali");
        }
        if ("action" in changes) {
          if (changes.action) next.set("aksi", changes.action);
          else next.delete("aksi");
        }
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <PageHeader
        title="Ubah Status Karyawan"
        description="Semua perubahan status kepegawaian dan kontrak: perpanjang PKWT, jadikan karyawan tetap, akhiri kontrak, ubah kategori, atau nonaktifkan. Setiap perubahan tercatat di riwayat dan audit log."
        actions={
          back ? (
            <Button variant="outline" asChild>
              <Link to={back}>
                <ArrowLeft /> Kembali ke profil
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(300px,380px)_1fr]">
        {/* HP/tablet: setelah karyawan dipilih, daftar disembunyikan supaya form langsung terlihat. */}
        <div className={cn(selectedId && "hidden lg:block")}>
          <EmployeePicker
            active
            title="Karyawan aktif"
            selectedId={selectedId}
            onSelect={(id) => update({ id, action: null })}
          />
        </div>
        {selectedId ? (
          <Button
            variant="outline"
            className="justify-self-start lg:hidden"
            onClick={() => update({ id: null, action: null })}
          >
            <UserRoundSearch /> Ganti karyawan
          </Button>
        ) : null}
        <section aria-label="Panel perubahan status" className="min-w-0">
          {!selectedId ? (
            <div className="bg-card grid h-full min-h-[420px] place-items-center rounded-2xl border border-dashed">
              <EmptyState
                icon={UserRoundSearch}
                title="Pilih karyawan terlebih dulu"
                description="Cari dan pilih karyawan di daftar sebelah kiri untuk mengubah status, kontrak, atau menonaktifkannya."
              />
            </div>
          ) : employee.isPending ? (
            <div className="bg-card space-y-5 rounded-2xl border p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="size-14 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : employee.isError ? (
            <div className="bg-card rounded-2xl border">
              <EmptyState
                icon={TriangleAlert}
                title="Gagal memuat karyawan"
                description={errorMessage(employee.error)}
              />
            </div>
          ) : !employee.data.isActive ? (
            <div className="bg-card rounded-2xl border">
              <EmptyState
                icon={Power}
                title={`${employee.data.fullName} sudah nonaktif`}
                description="Gunakan menu Pengaktifan Karyawan untuk mengaktifkan kembali."
              />
            </div>
          ) : (
            <ActionPanel
              key={employee.data.id}
              employee={employee.data}
              action={action}
              onActionChange={(next) => update({ action: next })}
              onDone={() => (back ? navigate(back) : update({ id: null, action: null }))}
              onCancel={() => (back ? navigate(back) : update({ action: null }))}
            />
          )}
        </section>
      </div>
    </>
  );
}

const ACTION_INFO: Record<StatusPageAction, { title: string; description: string }> = {
  "isi-tahap": {
    title: "Isi tahap kontrak",
    description: "Data lama: tahap & periode belum diisi",
  },
  perpanjang: { title: "Perpanjang", description: "Tahap berikutnya, maks 1 tahun" },
  tetap: { title: "Jadikan Karyawan Tetap", description: "Langsung PKWTT tanpa masa percobaan" },
  lulus: { title: "Lulus → Permanen", description: "Masa percobaan selesai, jadi Karyawan Tetap" },
  "tidak-lulus": { title: "Tidak lulus", description: "Karyawan & akun login nonaktif" },
  akhiri: { title: "Akhiri kontrak", description: "Karyawan & akun login nonaktif" },
  kategori: { title: "Ubah ke kategori lain", description: "Tetap, PKWT, THL, Magang, …" },
  nonaktif: { title: "Nonaktifkan (keluar)", description: "Resign, PHK, pensiun, meninggal, …" },
};

/** Aturan yang ditampilkan di samping form aksi kontrak (KTR-D4/D6/D7, PP 35/2021). */
function actionRules(action: StatusPageAction, category: EmploymentCategory | null): string[] {
  switch (action) {
    case "perpanjang":
      return [
        "PKWT 2 dan PKWT 3 maks 1 tahun; total PKWT maks 4 tahun — diblokir bila lewat.",
        "Mulai bawaan H+1 setelah tahap sebelumnya berakhir — jeda/tanggal lain hanya peringatan.",
        "Setelah PKWT 3 tidak bisa diperpanjang: Jadikan Karyawan Tetap atau Akhiri kontrak.",
      ];
    case "isi-tahap":
      return category === "PROBATION"
        ? ["Masa percobaan maks 3 bulan."]
        : [
            "PKWT 1 maks 2 tahun; PKWT 2/3 maks 1 tahun; total maks 4 tahun.",
            "Tahap 2/3 untuk data lama membutuhkan tanggal mulai PKWT 1.",
          ];
    case "tetap":
      return [
        "Status langsung Karyawan Tetap (PKWTT) tanpa masa percobaan.",
        "Masa kerja di perusahaan tetap dihitung sejak tanggal masuk; masa kerja PKWTT mulai tanggal efektif.",
        ...(category === "DAILY_WORKER"
          ? ["THL yang hadir ≥ 21 hari 3 bulan berturut-turut wajib diangkat (PP 35/2021 Ps. 10)."]
          : []),
      ];
    case "lulus":
      return ["Status menjadi Karyawan Tetap; masa kerja PKWTT mulai tanggal efektif."];
    case "akhiri":
    case "tidak-lulus":
      return ["Karyawan pindah ke Data Karyawan Tidak Aktif dan akun login ikut nonaktif."];
    default:
      return [];
  }
}

function ActionPanel({
  employee,
  action,
  onActionChange,
  onDone,
  onCancel,
}: {
  employee: EmployeeDetail;
  action: StatusPageAction | null;
  onActionChange: (action: StatusPageAction | null) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const category = employee.employmentStatus.category;
  const tier = employmentTier(category);
  const contracts = useEmployeeContracts(employee.id, tier !== null);
  // Mobile/tablet: panel ada di bawah daftar karyawan → gulir ke panel setelah karyawan dipilih.
  useEffect(() => {
    if (window.matchMedia?.("(max-width: 1023px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);
  const data = contracts.data;
  const active = data?.contracts.find((c) => c.status === "ACTIVE");
  const contractCategory = category === "PKWT" || category === "PROBATION";
  const manageContracts = Boolean(data?.access.manage);

  // Hanya aksi yang sah untuk status sekarang (aturan KTR-D4 tetap; tanpa jalan pintas).
  const contractActions: StatusPageAction[] = !manageContracts
    ? []
    : category === "PKWT"
      ? active
        ? [
            ...(active.sequence !== null && active.sequence < 3 ? (["perpanjang"] as const) : []),
            "tetap",
            "akhiri",
          ]
        : ["isi-tahap"]
      : category === "PROBATION"
        ? active
          ? ["lulus", "tidak-lulus"]
          : ["isi-tahap"]
        : category === "DAILY_WORKER"
          ? ["tetap"]
          : [];
  const available: StatusPageAction[] = [
    ...contractActions,
    ...(contractCategory || !employee.access.manage ? [] : (["kategori"] as const)),
    ...(employee.access.deactivate ? (["nonaktif"] as const) : []),
  ];
  const selected = action && available.includes(action) ? action : null;
  const contractAction = selected ? CONTRACT_ACTION_OF[selected] : undefined;
  const summary = data ? contractSummary(data.contracts, todayIso()) : null;
  const rules = selected ? actionRules(selected, category) : [];
  const actionTitle = (key: StatusPageAction) =>
    key === "perpanjang" && active?.sequence
      ? `Perpanjang ke PKWT ${active.sequence + 1}`
      : ACTION_INFO[key].title;

  return (
    <div
      ref={panelRef}
      className="bg-card animate-fade-up scroll-mt-4 overflow-hidden rounded-2xl border"
    >
      <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:p-6">
        <EmployeeAvatar name={employee.fullName} photoUrl={employee.photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold tracking-tight">{employee.fullName}</p>
          <p className="text-muted-foreground truncate text-sm">
            <span className="font-mono text-xs">{employee.employeeNumber ?? "—"}</span> ·{" "}
            {employee.position.name}
            {employee.department ? ` · ${employee.department.name}` : ""}
          </p>
        </div>
        <span className="text-muted-foreground text-xs">
          Masuk {formatDate(employee.joinDate)} · {tenure(employee.joinDate)}
        </span>
      </div>
      <div className="space-y-6 p-5 sm:p-6">
        <section aria-label="Status sekarang" className="space-y-2">
          <h3 className={STEP_TITLE}>1 · Status sekarang</h3>
          <div className="bg-muted/60 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg p-3">
            <StatusBadge
              name={employee.employmentStatus.name}
              category={category}
              stage={category === "PKWT" ? (active?.sequence ?? null) : undefined}
              label={tier ? employmentStatusDisplay(category, active?.sequence ?? null) : undefined}
              className="px-2 py-0.5 text-sm font-semibold"
            />
            {contractCategory && summary ? (
              <>
                <span className="text-sm whitespace-nowrap">
                  {formatDate(summary.startDate)} – {formatDate(summary.endDate)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {summary.remainingDays < 0
                    ? `lewat ${Math.abs(summary.remainingDays)} hari`
                    : `${summary.remainingDays} hari lagi`}
                </span>
              </>
            ) : null}
            {data?.thl ? <ThlStreakChip thl={data.thl} /> : null}
          </div>
          {data?.contracts.length ? (
            <p className="text-muted-foreground text-xs">
              Riwayat kontrak:{" "}
              {[...data.contracts]
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .slice(0, 3)
                .map(
                  (c) =>
                    `${contractStageLabel(c.kind, c.sequence)} (${formatDate(c.startDate)} – ${formatDate(c.endDate)}, ${CONTRACT_STATUS_LABELS[c.status]})`,
                )
                .join(" · ")}{" "}
              ·{" "}
              <Link
                className="text-brand font-medium"
                to={`/personal/pegawai-aktif/semua?pegawai=${encodeURIComponent(employee.id)}&tab=history`}
              >
                Lihat semua →
              </Link>
            </p>
          ) : null}
        </section>

        <section aria-label="Pilih aksi" className="space-y-2">
          <h3 className={STEP_TITLE}>2 · Pilih aksi</h3>
          {contracts.isPending && tier ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div
              role="radiogroup"
              aria-label="Aksi"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {available.map((key) => (
                <ChoiceCard
                  key={key}
                  tone={
                    key === "akhiri" || key === "tidak-lulus" || key === "nonaktif"
                      ? "destructive"
                      : "brand"
                  }
                  selected={selected === key}
                  onSelect={() => onActionChange(key)}
                  title={actionTitle(key)}
                  description={ACTION_INFO[key].description}
                />
              ))}
            </div>
          )}
          {data?.access.missingGrant && tier ? (
            <p className="text-muted-foreground text-sm">
              Aksi kontrak butuh izin <strong>Kelola kontrak</strong> dari Super Admin.
            </p>
          ) : null}
          {contractCategory && manageContracts && active ? (
            <p className="text-muted-foreground text-xs">
              Salah input tanggal kontrak? Gunakan <strong>Koreksi data kontrak</strong> di tab
              Kepegawaian profil.
            </p>
          ) : null}
        </section>

        {selected ? (
          <section aria-label={`Form ${actionTitle(selected)}`} className="space-y-3">
            <h3 className={STEP_TITLE}>3 · {actionTitle(selected)}</h3>
            {rules.length ? (
              <div className="bg-muted/40 rounded-md border px-3 py-2 text-xs">
                <p className="mb-1 font-semibold">Aturan yang berlaku</p>
                <ul className="text-muted-foreground list-disc space-y-0.5 pl-4">
                  {rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {contractAction && data ? (
              <ContractActionForm
                key={selected}
                employeeId={employee.id}
                action={contractAction}
                data={data}
                active={active}
                firstStart={summary?.totalPkwt?.firstStartDate}
                onDone={onDone}
                onCancel={onCancel}
                submitLabel={actionTitle(selected)}
              />
            ) : selected === "kategori" ? (
              <ChangeCategoryForm employee={employee} onDone={onDone} />
            ) : selected === "nonaktif" ? (
              <DeactivateForm employee={employee} onDone={onDone} />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

const STEP_TITLE = "text-muted-foreground text-[11px] font-medium tracking-wider uppercase";

export function ChangeCategoryForm({
  employee,
  onDone,
}: {
  employee: EmployeeDetail;
  onDone: () => void;
}) {
  const master = useMasterData();
  const mutation = useChangeStatus();
  const [statusId, setStatusId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const target = master.data?.employmentStatuses.find((s) => s.id === statusId);
  const blocked =
    employee.employmentStatus.category === "PKWT" ||
    employee.employmentStatus.category === "PROBATION";
  const needsContract = target?.category === "PKWT" || target?.category === "PROBATION";
  const contractForm = useForm<CreateContractInput>({
    resolver: zodResolver(createContractInputSchema),
    mode: "onChange",
    defaultValues: {
      kind: "PKWT",
      sequence: 1,
      startDate: todayIso(),
      endDate: defaultContractEnd(todayIso(), "PKWT"),
    },
  });
  const contractValues = contractForm.watch();
  const contractValidation = validatePeriod(contractValues);
  if (contractValues.startDate < employee.joinDate)
    contractValidation.errors.push("Mulai kontrak tidak boleh sebelum tanggal masuk.");
  const contractValid =
    createContractInputSchema.safeParse(contractValues).success &&
    !contractValidation.errors.length;
  function selectStatus(id: string) {
    setStatusId(id);
    const kind =
      master.data?.employmentStatuses.find((s) => s.id === id)?.category === "PROBATION"
        ? "PROBATION"
        : "PKWT";
    contractForm.reset({
      kind,
      ...(kind === "PKWT" ? { sequence: 1 } : {}),
      startDate: effectiveDate,
      endDate: defaultContractEnd(effectiveDate, kind),
    });
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !statusId ||
      blocked ||
      (needsContract && (!contractValid || !(await contractForm.trigger())))
    )
      return;
    try {
      const result = await mutation.mutateAsync({
        id: employee.id,
        employmentStatusId: statusId,
        ...(needsContract
          ? {
              contract: {
                startDate: contractValues.startDate,
                endDate: contractValues.endDate,
                ...(contractValues.kind === "PKWT"
                  ? {
                      sequence: contractValues.sequence,
                      ...((contractValues.sequence ?? 1) > 1
                        ? { firstPkwtStartDate: contractValues.firstPkwtStartDate }
                        : {}),
                    }
                  : {}),
              },
            }
          : {}),
        effectiveDate,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(
        `Status ${employee.fullName} menjadi ${target?.category ? EMPLOYMENT_CATEGORY_LABELS[target.category] : target?.name}.`,
      );
      for (const warning of result.data.warnings) toast.warning(warning);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {blocked ? (
        <Alert>
          <AlertTitle>Gunakan tab Kepegawaian di detail karyawan</AlertTitle>
          <AlertDescription>
            <Link
              className="underline"
              to={`/personal/pegawai-aktif/semua?pegawai=${encodeURIComponent(employee.id)}&tab=work`}
            >
              Buka detail karyawan
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-3">
        <Label>Status baru</Label>
        <div
          role="radiogroup"
          aria-label="Status baru"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {(master.data?.employmentStatuses ?? []).map((status) => {
            const current = status.id === employee.employmentStatus.id;
            return (
              <ChoiceCard
                key={status.id}
                selected={status.id === statusId}
                disabled={current}
                onSelect={() => selectStatus(status.id)}
                title={status.category ? EMPLOYMENT_CATEGORY_LABELS[status.category] : status.name}
                description={current ? "Status saat ini" : undefined}
              />
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="status-date">Tanggal efektif</Label>
          <Input
            id="status-date"
            type="date"
            required
            min={employee.joinDate}
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:row-span-2">
          <Label htmlFor="status-note">
            Catatan <span className="text-muted-foreground font-normal">(opsional)</span>
          </Label>
          <Textarea
            id="status-note"
            maxLength={500}
            rows={3}
            placeholder="Mis. nomor SK pengangkatan"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
      {needsContract ? (
        <section aria-label="Periode kontrak" className="space-y-3">
          <ContractPeriodFields form={contractForm} id="status-contract" />
          {contractValidation.errors.map((message) => (
            <p role="alert" className="text-destructive text-sm" key={message}>
              {message}
            </p>
          ))}
          {contractValidation.warnings.map((message) => (
            <p className="text-amber-700 text-sm" key={message}>
              {message}
            </p>
          ))}
        </section>
      ) : null}
      <div className="bg-muted/40 flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge
            name={employee.employmentStatus.name}
            category={employee.employmentStatus.category}
          />
          <ArrowRight className="text-muted-foreground size-4" aria-hidden />
          {target ? (
            <StatusBadge name={target.name} category={target.category} />
          ) : (
            <span className="text-muted-foreground">pilih status baru</span>
          )}
        </div>
        <Button
          type="submit"
          variant="brand"
          disabled={blocked || !statusId || (needsContract && !contractValid) || mutation.isPending}
        >
          {mutation.isPending ? "Menyimpan…" : "Simpan perubahan"}
        </Button>
      </div>
    </form>
  );
}

function DeactivateForm({ employee, onDone }: { employee: EmployeeDetail; onDone: () => void }) {
  const mutation = useDeactivateEmployee();
  const [reason, setReason] = useState<ExitReason | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason || !confirmed) return;
    try {
      await mutation.mutateAsync({
        id: employee.id,
        effectiveDate,
        exitReason: reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(`${employee.fullName} dinonaktifkan.`);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-3">
        <Label>Alasan keluar</Label>
        <div
          role="radiogroup"
          aria-label="Alasan keluar"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {EXIT_REASONS.map((value) => (
            <ChoiceCard
              key={value}
              tone="destructive"
              selected={reason === value}
              onSelect={() => setReason(value)}
              title={EXIT_REASON_LABELS[value]}
              description={EXIT_HINTS[value]}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="exit-date">Tanggal efektif keluar</Label>
          <Input
            id="exit-date"
            type="date"
            required
            min={employee.joinDate}
            max={todayIso()}
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Paling lambat hari ini — akun login langsung nonaktif.
          </p>
        </div>
        <div className="grid gap-2 sm:row-span-2">
          <Label htmlFor="exit-note">
            Catatan <span className="text-muted-foreground font-normal">(opsional)</span>
          </Label>
          <Textarea
            id="exit-note"
            maxLength={500}
            rows={3}
            placeholder="Mis. nomor surat resign"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
      {/* ARS-D6: aset & APD wajib kembali yang belum dikembalikan (peringatan, tidak memblokir). */}
      {FEATURES.assets ? <OpenHoldingsWarning employeeId={employee.id} /> : null}
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>Yang akan terjadi</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Karyawan pindah ke Data Karyawan Tidak Aktif (data tetap diarsip).</li>
            {employee.account?.isActive ? (
              <li>Akun loginnya ikut dinonaktifkan dan tidak bisa masuk lagi.</li>
            ) : null}
            <li>Bawahan langsung perlu diberi atasan baru secara terpisah.</li>
          </ul>
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-destructive size-4"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Saya yakin menonaktifkan {employee.fullName}
        </label>
        <Button
          type="submit"
          variant="destructive"
          disabled={!reason || !confirmed || mutation.isPending}
        >
          <Power /> {mutation.isPending ? "Memproses…" : "Nonaktifkan karyawan"}
        </Button>
      </div>
    </form>
  );
}
