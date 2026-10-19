import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, Save } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { ACTIVE_BASE, ALL_ACTIVE_VIEW, findActiveView } from "../active-views";
import { useCompanyScope, useCreateEmployee, useMasterData } from "../api";
import {
  EMPTY_EMPLOYEE_FORM,
  EmployeeWorkFields,
  toEmployeeWriteBody,
} from "../components/employee-work-fields";
import { type EmployeeForm, employeeFormSchema } from "../schemas";
import {
  emptyProfile,
  type ProfileState,
  type StepKey,
  toProfileInput,
  validateProfile,
} from "./profile-form";
import { BankStep, EducationStep, EmergencyStep, FamilyStep, PersonalStep } from "./profile-steps";

// EMP-D2: Personal Management › Tambah karyawan — form bertahap dengan urutan & bagian sama dengan
// Google Form "Formulir Data Karyawan" (Import, D-059/D-061). Yang wajib tetap data kerja inti; bagian
// lain opsional. Disimpan sekali di akhir (POST /employees + profil, satu transaksi di API).

const STEPS: { key: StepKey; label: string; description: string }[] = [
  {
    key: "work",
    label: "Data kepegawaian",
    description:
      "NIP, nama, penempatan, dan kontak kerja. Kolom tanpa tanda (opsional) wajib diisi.",
  },
  {
    key: "personal",
    label: "Data pribadi & alamat",
    description: "Identitas, nomor dokumen, SIM, dan alamat domisili/KTP.",
  },
  {
    key: "emergency",
    label: "Kontak darurat",
    description: "Orang yang dapat dihubungi dalam keadaan darurat.",
  },
  {
    key: "family",
    label: "Data keluarga",
    description: "Pasangan, anak, orang tua, dan saudara kandung.",
  },
  { key: "bank", label: "Data rekening", description: "Rekening untuk pembayaran gaji." },
  {
    key: "education",
    label: "Pendidikan & sertifikasi",
    description: "Riwayat pendidikan dan sertifikasi.",
  },
  {
    key: "summary",
    label: "Ringkasan & simpan",
    description: "Periksa lalu simpan data karyawan.",
  },
];

export function EmployeeCreatePage() {
  const me = useMe().data as Me;
  const canPersonal = access.writePersonalOnCreate(me);
  const canBank = access.writeBankOnCreate(me);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const from = findActiveView(params.get("dari") ?? "") ?? ALL_ACTIVE_VIEW;
  const listUrl = `${ACTIVE_BASE}/${from.slug}`;
  const scope = useCompanyScope();
  const master = useMasterData();
  const create = useCreateEmployee();
  const [step, setStep] = useState<StepKey>("work");
  const [profile, setProfile] = useState<ProfileState>(emptyProfile);
  // Pesan validasi terakhir, tampil di langkah yang perlu diperbaiki.
  const [problem, setProblem] = useState<{ step: StepKey; message: string } | null>(null);
  const form = useForm<EmployeeForm>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: EMPTY_EMPLOYEE_FORM,
    mode: "onTouched",
  });

  // Status bawaan dari kategori daftar asal; PT dari pemilih top bar / satu-satunya PT (D-040).
  const defaultStatusId = from.filter.category
    ? master.data?.employmentStatuses.find((s) => s.category === from.filter.category)?.id
    : undefined;
  useEffect(() => {
    if (defaultStatusId && !form.getValues("employmentStatusId"))
      form.setValue("employmentStatusId", defaultStatusId);
  }, [defaultStatusId, form]);
  useEffect(() => {
    if (form.getValues("companyId")) return;
    const id =
      scope.selectedId ?? (scope.companies.length === 1 ? scope.companies[0]?.id : undefined);
    if (id) form.setValue("companyId", id);
  }, [scope.selectedId, scope.companies, form]);

  const locked = (key: StepKey) =>
    (key === "personal" || key === "family") && !canPersonal ? true : key === "bank" && !canBank;
  const index = STEPS.findIndex((s) => s.key === step);
  const current = STEPS[index];
  const go = async (target: StepKey) => {
    // Data kepegawaian harus valid sebelum pindah ke langkah lain.
    if (step === "work" && target !== "work" && !(await form.trigger())) {
      toast.error("Lengkapi data kepegawaian dulu.");
      return;
    }
    setStep(target);
    document.getElementById("main")?.scrollTo?.({ top: 0 });
  };
  const nextKey = STEPS[index + 1]?.key;
  const prevKey = STEPS[index - 1]?.key;

  const save = async () => {
    setProblem(null);
    if (!(await form.trigger())) {
      setStep("work");
      setProblem({ step: "work", message: "Lengkapi data kepegawaian dulu." });
      return;
    }
    const profileInput = toProfileInput(profile, { personal: canPersonal, bank: canBank });
    const invalid = validateProfile(profileInput);
    if (invalid) {
      setStep(invalid.step);
      setProblem({ step: invalid.step, message: invalid.message });
      toast.error(invalid.message);
      return;
    }
    const values = form.getValues();
    try {
      const created = (await create.mutateAsync({
        ...toEmployeeWriteBody(values),
        employmentStatusId: values.employmentStatusId,
        profile: profileInput,
      })) as { data: { id: string } };
      toast.success(`${values.fullName.trim()} ditambahkan.`);
      navigate(`${listUrl}?pegawai=${created.data.id}`);
    } catch (error) {
      setProblem({ step, message: errorMessage(error) });
      toast.error(errorMessage(error));
    }
  };

  const set =
    <K extends keyof ProfileState>(key: K) =>
    (value: ProfileState[K]) =>
      setProfile((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      <PageHeader
        title="Tambah karyawan"
        description="Urutan sama dengan Formulir Data Karyawan (Google Form). Hanya data kepegawaian yang wajib; bagian lain bisa dilengkapi nanti."
        actions={
          <Button variant="ghost" asChild>
            <Link to={listUrl}>
              <ArrowLeft /> Kembali ke {from.label}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Langkah tambah karyawan" className="lg:sticky lg:top-0 lg:self-start">
          <ol className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0">
            {STEPS.map((s, i) => {
              const active = s.key === step;
              const done = i < index;
              return (
                <li key={s.key} className="shrink-0">
                  <button
                    type="button"
                    aria-current={active ? "step" : undefined}
                    onClick={() => void go(s.key)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm whitespace-nowrap transition-colors",
                      active
                        ? "bg-brand-soft text-brand-soft-foreground font-medium"
                        : "hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold tabular-nums",
                        active && "border-brand bg-brand text-brand-foreground",
                        !active && done && "border-success/40 text-success-soft-foreground",
                      )}
                    >
                      {locked(s.key) ? (
                        <Lock className="size-3" />
                      ) : !active && done ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section aria-labelledby="step-title" className="bg-card min-w-0 rounded-2xl border">
          <header className="border-b px-5 py-4 sm:px-6">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Langkah {index + 1} dari {STEPS.length}
            </p>
            <h2 id="step-title" className="mt-0.5 text-lg font-semibold">
              {current?.label}
            </h2>
            <p className="text-muted-foreground mt-0.5 text-sm">{current?.description}</p>
          </header>
          <div className="px-5 py-6 sm:px-6">
            {problem && problem.step === step ? (
              <p
                role="alert"
                className="border-destructive/30 bg-destructive/5 text-destructive mb-5 rounded-xl border px-4 py-3 text-sm"
              >
                {problem.message}
              </p>
            ) : null}
            {locked(step) ? (
              <LockedNotice
                permission={step === "bank" ? "employee.bank.write" : "employee.personal.write"}
              />
            ) : null}
            {step === "work" ? <EmployeeWorkFields form={form} showEmergency={false} /> : null}
            {step === "personal" && canPersonal ? (
              <PersonalStep value={profile.personal} onChange={set("personal")} />
            ) : null}
            {step === "emergency" ? (
              <EmergencyStep
                form={form}
                value={profile.emergency}
                onChange={set("emergency")}
                canPersonal={canPersonal}
              />
            ) : null}
            {step === "family" && canPersonal ? (
              <FamilyStep value={profile.family} onChange={set("family")} />
            ) : null}
            {step === "bank" && canBank ? (
              <BankStep value={profile.bank} onChange={set("bank")} />
            ) : null}
            {step === "education" ? (
              <EducationStep
                educations={profile.educations}
                certifications={profile.certifications}
                onChange={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
              />
            ) : null}
            {step === "summary" ? (
              <Summary
                form={form}
                profile={profile}
                can={{ personal: canPersonal, bank: canBank }}
                onGoTo={(k) => void go(k)}
              />
            ) : null}
          </div>
          <footer className="bg-muted/30 flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4 sm:px-6">
            {prevKey ? (
              <Button type="button" variant="ghost" onClick={() => void go(prevKey)}>
                <ArrowLeft /> Sebelumnya
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {step !== "summary" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void save()}
                  disabled={create.isPending}
                >
                  Simpan sekarang
                </Button>
              ) : null}
              {nextKey ? (
                <Button type="button" onClick={() => void go(nextKey)}>
                  Berikutnya <ArrowRight />
                </Button>
              ) : (
                <Button type="button" onClick={() => void save()} disabled={create.isPending}>
                  <Save /> {create.isPending ? "Menyimpan…" : "Simpan karyawan"}
                </Button>
              )}
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

function LockedNotice({ permission }: { permission: string }) {
  return (
    <div className="bg-muted text-muted-foreground mb-5 flex gap-3 rounded-xl px-4 py-3 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        Bagian ini butuh izin <span className="font-mono">{permission}</span>. Lewati saja — data
        bisa dilengkapi pengguna yang berhak setelah karyawan disimpan.
      </p>
    </div>
  );
}

function Summary({
  form,
  profile,
  can,
  onGoTo,
}: {
  form: ReturnType<typeof useForm<EmployeeForm>>;
  profile: ProfileState;
  can: { personal: boolean; bank: boolean };
  onGoTo: (step: StepKey) => void;
}) {
  const master = useMasterData();
  const v = form.getValues();
  const input = toProfileInput(profile, can);
  const position = master.data?.positions.find((p) => p.id === v.positionId)?.name;
  const company = master.data?.companies.find((c) => c.id === v.companyId)?.name;
  const p = input.personal;
  const rows: { step: StepKey; label: string; value: ReactNode }[] = [
    {
      step: "work",
      label: "Nama · NIP",
      value: `${v.fullName || "—"} · ${v.employeeNumber || "NIP belum ada"}`,
    },
    {
      step: "work",
      label: "Penempatan",
      value: [position, company].filter(Boolean).join(" · ") || "—",
    },
    { step: "work", label: "Tanggal masuk", value: v.joinDate || "—" },
    {
      step: "personal",
      label: "Data pribadi",
      value: !can.personal
        ? "Butuh izin"
        : p
          ? [p.birthPlace, p.birthDate, p.ktpNumber ? `NIK ${p.ktpNumber}` : null]
              .filter(Boolean)
              .join(" · ") || "Sebagian terisi"
          : "Belum diisi",
    },
    {
      step: "emergency",
      label: "Kontak darurat",
      value:
        [v.emergencyContactName, profile.emergency.name2].filter(Boolean).join(", ") ||
        "Belum diisi",
    },
    {
      step: "family",
      label: "Keluarga",
      value: !can.personal
        ? "Butuh izin"
        : input.family?.length
          ? `${input.family.length} anggota`
          : "Belum diisi",
    },
    {
      step: "bank",
      label: "Rekening",
      value: !can.bank
        ? "Butuh izin"
        : input.bank
          ? `${input.bank.bankName} · ${input.bank.accountNumber}`
          : "Belum diisi",
    },
    {
      step: "education",
      label: "Pendidikan · sertifikasi",
      value: `${input.educations?.length ?? 0} pendidikan · ${input.certifications?.length ?? 0} sertifikasi`,
    },
  ];
  return (
    <dl className="divide-y rounded-xl border">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <dt className="text-muted-foreground w-44 shrink-0 text-sm">{r.label}</dt>
          <dd className="min-w-0 flex-1 text-sm font-medium break-words">{r.value}</dd>
          <Button type="button" size="sm" variant="ghost" onClick={() => onGoTo(r.step)}>
            Ubah
          </Button>
        </div>
      ))}
    </dl>
  );
}
