import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentType,
  EDUCATION_LEVELS,
  FAMILY_RELATIONSHIP_LABELS,
  FAMILY_RELATIONSHIPS,
  MARITAL_STATUS_LABELS,
  MARITAL_STATUSES,
  type OnboardingSection,
  RELIGION_LABELS,
  RELIGIONS,
  REQUIRED_DOCUMENTS,
  REVIEW_SECTION_LABELS,
  type ReviewSection,
} from "@hris/shared";
import { CheckCircle2, Clock, FileText, LogOut, Plus, Trash2, Upload } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { FormSelect } from "@/components/form-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/features/auth/api";
import { useAuth } from "@/features/auth/auth-provider";
import { EmployeePhotoControl } from "@/features/employee/components/employee-photo-control";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  useDeleteDocument,
  useMyOnboarding,
  useSaveOnboardingSection,
  useSubmitOnboarding,
  useUploadDocument,
} from "../api";
import type { MyOnboarding } from "../schemas";

// D-045 bagian b: wizard isi data karyawan oleh pemiliknya sendiri (design §7). Calon baru dikunci ke
// halaman ini sampai disetujui; karyawan existing hanya mengisi field yang masih kosong (D-046).

type StepKey = OnboardingSection | "documents" | "summary";
const STEPS: { key: StepKey; label: string }[] = [
  { key: "personal", label: "Data pribadi" },
  { key: "emergency", label: "Kontak darurat" },
  { key: "family", label: "Keluarga" },
  { key: "bank", label: "Rekening" },
  { key: "professional", label: "Pendidikan & pengalaman" },
  { key: "documents", label: "Dokumen" },
  { key: "summary", label: "Ringkasan & kirim" },
];

const GENDER_OPTIONS = [
  { value: "MALE", label: "Laki-laki" },
  { value: "FEMALE", label: "Perempuan" },
];
const EDUCATION_LABEL: Record<string, string> = { SMA: "SMA/SMK", OTHER: "Lainnya" };

export function OnboardingWizardPage() {
  const me = useMe().data;
  const { signOut } = useAuth();
  const mine = useMyOnboarding();
  const [step, setStep] = useState<StepKey>("personal");

  const header = (
    <header className="bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <BrandLogo className="h-9" />
        <div className="flex items-center gap-2">
          {me?.onboarding?.locked ? null : (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Kembali ke aplikasi</Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            <LogOut /> Keluar
          </Button>
        </div>
      </div>
    </header>
  );

  if (mine.isPending) return <Shell header={header}>Memuat data…</Shell>;
  if (mine.isError) return <Shell header={header}>{errorMessage(mine.error)}</Shell>;
  const data = mine.data;
  if (!data.mode) {
    return (
      <Shell header={header}>
        <p>Tidak ada data yang perlu dilengkapi.</p>
      </Shell>
    );
  }
  if (!data.editable) {
    const approved = data.status === "APPROVED" && !data.submittedAt;
    return (
      <Shell header={header}>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          {approved ? (
            <CheckCircle2 className="text-success-soft-foreground size-10" />
          ) : (
            <Clock className="text-muted-foreground size-10" />
          )}
          <h1 className="text-xl font-semibold">
            {approved ? "Data Anda sudah disetujui" : "Data Anda sudah dikirim"}
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            {approved
              ? "Terima kasih. Anda bisa memakai aplikasi seperti biasa."
              : "HR sedang memeriksa data dan dokumen Anda. Anda akan menerima email bila disetujui atau perlu diperbaiki."}
          </p>
        </div>
      </Shell>
    );
  }

  // D-045 c: revisi — hanya bagian yang diberi catatan HR yang ditampilkan & bisa diubah.
  const revision = data.revision;
  const steps = revision
    ? STEPS.filter((s) => s.key === "summary" || revision.notes[s.key as ReviewSection])
    : STEPS;
  const current = steps.some((s) => s.key === step) ? step : (steps[0]?.key ?? "summary");
  const index = steps.findIndex((s) => s.key === current);
  const next = () => setStep(steps[Math.min(index + 1, steps.length - 1)]?.key ?? "summary");
  const back = () => setStep(steps[Math.max(index - 1, 0)]?.key ?? "summary");
  const note = revision?.notes[current as ReviewSection];
  const missingIn = (key: StepKey) =>
    data.missing.filter((m) => m.section === key || (key === "personal" && m.field === "photo"));

  return (
    <Shell header={header}>
      <h1 className="text-2xl font-semibold tracking-tight">Lengkapi data karyawan</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {data.mode === "completion"
          ? "Isi data yang masih kosong. Data yang sudah ada hanya bisa dikoreksi lewat HR."
          : "Isi semua data wajib, lalu kirim untuk diperiksa HR. Draf tersimpan setiap langkah."}
      </p>
      {revision ? (
        <Alert className="mt-4">
          <AlertDescription>
            HR meminta perbaikan pada:{" "}
            {Object.keys(revision.notes)
              .map((k) => REVIEW_SECTION_LABELS[k as ReviewSection])
              .join(", ")}
            . Bagian lain tidak perlu diubah.
          </AlertDescription>
        </Alert>
      ) : null}
      <ol
        className="my-5 flex gap-1 overflow-x-auto pb-1 text-xs sm:flex-wrap sm:overflow-visible"
        aria-label="Langkah pengisian"
      >
        {steps.map((s, i) => {
          const incomplete = missingIn(s.key).length > 0;
          return (
            <li key={s.key}>
              <button
                type="button"
                aria-current={s.key === current ? "step" : undefined}
                onClick={() => setStep(s.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 whitespace-nowrap",
                  s.key === current
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-muted",
                )}
              >
                <span className="tabular-nums">{i + 1}</span> {s.label}
                {s.key !== "summary" && !incomplete ? <CheckCircle2 className="size-3.5" /> : null}
              </button>
            </li>
          );
        })}
      </ol>
      {note ? (
        <Alert className="mb-4 border-amber-300">
          <AlertDescription>
            <span className="font-medium">Catatan HR:</span> {note}
          </AlertDescription>
        </Alert>
      ) : null}
      {current === "personal" ? <PersonalStep data={data} onDone={next} /> : null}
      {current === "emergency" ? <EmergencyStep data={data} onDone={next} onBack={back} /> : null}
      {current === "family" ? <FamilyStep data={data} onDone={next} onBack={back} /> : null}
      {current === "bank" ? <BankStep data={data} onDone={next} onBack={back} /> : null}
      {current === "professional" ? (
        <ProfessionalStep data={data} onDone={next} onBack={back} />
      ) : null}
      {current === "documents" ? <DocumentsStep data={data} onDone={next} onBack={back} /> : null}
      {current === "summary" ? <SummaryStep data={data} onBack={back} onGoTo={setStep} /> : null}
    </Shell>
  );
}

function Shell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-background min-h-svh">
      {header}
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}

// ── Bantuan form ─────────────────────────────────────────────────────────────────────────────────

/** Mode lengkapi: field yang sudah terisi dikunci (D-046). */
const lockedIn = (data: MyOnboarding, value: unknown) =>
  data.mode === "completion" && value !== null && value !== undefined && value !== "";

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: ReactNode;
  hint?: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function useSection(section: OnboardingSection, onDone: () => void) {
  const save = useSaveOnboardingSection();
  return {
    pending: save.isPending,
    submit: async (body: unknown) => {
      try {
        await save.mutateAsync({ section, body });
        toast.success("Draf tersimpan.");
        onDone();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
  };
}

function StepActions({
  onBack,
  pending,
  label = "Simpan & lanjut",
}: {
  onBack?: (() => void) | undefined;
  pending: boolean;
  label?: string;
}) {
  return (
    <div className="flex justify-between gap-2 pt-2">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          Kembali
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" variant="brand" disabled={pending}>
        {pending ? "Menyimpan…" : label}
      </Button>
    </div>
  );
}

const nn = (v: string) => (v.trim() === "" ? null : v.trim());

// ── Langkah 1: data pribadi ────────────────────────────────────────────────────────────────────

function PersonalStep({ data, onDone }: { data: MyOnboarding; onDone: () => void }) {
  const p = data.personal;
  const [v, setV] = useState({
    fullName: p.fullName,
    gender: p.gender ?? "",
    birthPlace: p.birthPlace ?? "",
    birthDate: p.birthDate ?? "",
    ktpNumber: p.ktpNumber ?? "",
    kkNumber: p.kkNumber ?? "",
    religion: p.religion ?? "",
    maritalStatus: p.maritalStatus ?? "",
    ktpAddress: p.ktpAddress ?? "",
    domicileAddress: p.domicileAddress ?? "",
    originCity: p.originCity ?? "",
    phoneNumber: p.phoneNumber ?? "",
    npwpNumber: p.npwpNumber ?? "",
    npwpAbsent: p.npwpAbsent,
    bpjsEmploymentNumber: p.bpjsEmploymentNumber ?? "",
    bpjsEmploymentAbsent: p.bpjsEmploymentAbsent,
    bpjsHealthNumber: p.bpjsHealthNumber ?? "",
    bpjsHealthAbsent: p.bpjsHealthAbsent,
  });
  const { submit, pending } = useSection("personal", onDone);
  const set = (key: keyof typeof v) => (value: string | boolean) =>
    setV((s) => ({ ...s, [key]: value }));
  const lock = (key: keyof typeof p) => lockedIn(data, p[key]) && p[key] !== false;
  const text = (
    key: keyof typeof v & keyof typeof p,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <Field id={`p-${key}`} label={label}>
      <Input
        id={`p-${key}`}
        value={String(v[key] ?? "")}
        disabled={lock(key)}
        onChange={(e) => set(key)(e.target.value)}
        {...props}
      />
    </Field>
  );
  const optionalNumber = (
    numberKey: "npwpNumber" | "bpjsEmploymentNumber" | "bpjsHealthNumber",
    absentKey: "npwpAbsent" | "bpjsEmploymentAbsent" | "bpjsHealthAbsent",
    label: string,
  ) => (
    <Field id={`p-${numberKey}`} label={label}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={`p-${numberKey}`}
          inputMode="numeric"
          value={v[numberKey]}
          disabled={v[absentKey] || lock(numberKey) || lock(absentKey)}
          onChange={(e) => set(numberKey)(e.target.value)}
        />
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand size-4"
            aria-label={`${label}: belum punya`}
            checked={v[absentKey]}
            disabled={lock(numberKey) || lock(absentKey)}
            onChange={(e) =>
              setV((s) => ({
                ...s,
                [absentKey]: e.target.checked,
                [numberKey]: e.target.checked ? "" : s[numberKey],
              }))
            }
          />
          Belum punya
        </label>
      </div>
    </Field>
  );
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit({
          fullName: nn(v.fullName) ?? undefined,
          gender: v.gender || null,
          birthPlace: nn(v.birthPlace),
          birthDate: v.birthDate || null,
          ktpNumber: nn(v.ktpNumber),
          kkNumber: nn(v.kkNumber),
          religion: v.religion || null,
          maritalStatus: v.maritalStatus || null,
          ktpAddress: nn(v.ktpAddress),
          domicileAddress: nn(v.domicileAddress),
          originCity: nn(v.originCity),
          phoneNumber: nn(v.phoneNumber),
          npwpNumber: nn(v.npwpNumber),
          npwpAbsent: v.npwpAbsent,
          bpjsEmploymentNumber: nn(v.bpjsEmploymentNumber),
          bpjsEmploymentAbsent: v.bpjsEmploymentAbsent,
          bpjsHealthNumber: nn(v.bpjsHealthNumber),
          bpjsHealthAbsent: v.bpjsHealthAbsent,
        });
      }}
    >
      <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
        <EmployeePhotoControl
          employeeId={data.employeeId}
          name={data.personal.fullName}
          photoUrl={data.photoUrl}
          canEdit={!lockedIn(data, data.photoUrl)}
        />
        <p className="text-muted-foreground text-xs">Foto profil (wajib, rasio 3:4)</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {text("fullName", "Nama lengkap (sesuai KTP)")}
        <Field id="p-gender" label="Jenis kelamin">
          <FormSelect
            id="p-gender"
            value={v.gender}
            onChange={set("gender")}
            disabled={lock("gender")}
            placeholder="Pilih"
            options={GENDER_OPTIONS}
          />
        </Field>
        {text("birthPlace", "Tempat lahir")}
        {text("birthDate", "Tanggal lahir", { type: "date" })}
        {text("ktpNumber", "NIK KTP (16 digit)", { inputMode: "numeric", maxLength: 16 })}
        {text("kkNumber", "Nomor KK (16 digit)", { inputMode: "numeric", maxLength: 16 })}
        <Field id="p-religion" label="Agama">
          <FormSelect
            id="p-religion"
            value={v.religion}
            onChange={set("religion")}
            disabled={lock("religion")}
            placeholder="Pilih"
            options={RELIGIONS.map((r) => ({ value: r, label: RELIGION_LABELS[r] }))}
          />
        </Field>
        <Field id="p-maritalStatus" label="Status pernikahan">
          <FormSelect
            id="p-maritalStatus"
            value={v.maritalStatus}
            onChange={set("maritalStatus")}
            disabled={lock("maritalStatus")}
            placeholder="Pilih"
            options={MARITAL_STATUSES.map((m) => ({ value: m, label: MARITAL_STATUS_LABELS[m] }))}
          />
        </Field>
        {text("originCity", "Kota asal")}
        {text("phoneNumber", "No. HP", { inputMode: "tel", placeholder: "08…" })}
      </div>
      <Field id="p-ktpAddress" label="Alamat sesuai KTP">
        <Textarea
          id="p-ktpAddress"
          rows={2}
          value={v.ktpAddress}
          disabled={lock("ktpAddress")}
          onChange={(e) => set("ktpAddress")(e.target.value)}
        />
      </Field>
      <Field id="p-domicileAddress" label="Alamat domisili">
        <Textarea
          id="p-domicileAddress"
          rows={2}
          value={v.domicileAddress}
          disabled={lock("domicileAddress")}
          onChange={(e) => set("domicileAddress")(e.target.value)}
        />
      </Field>
      {optionalNumber("npwpNumber", "npwpAbsent", "NPWP")}
      {optionalNumber("bpjsEmploymentNumber", "bpjsEmploymentAbsent", "BPJS Ketenagakerjaan")}
      {optionalNumber("bpjsHealthNumber", "bpjsHealthAbsent", "BPJS Kesehatan")}
      <StepActions pending={pending} />
    </form>
  );
}

// ── Langkah 2–4 ─────────────────────────────────────────────────────────────────────────────────

function EmergencyStep({
  data,
  onDone,
  onBack,
}: {
  data: MyOnboarding;
  onDone: () => void;
  onBack: () => void;
}) {
  const e = data.emergency;
  const [v, setV] = useState({
    name: e.name ?? "",
    relationship: e.relationship ?? "",
    phone: e.phone ?? "",
  });
  const { submit, pending } = useSection("emergency", onDone);
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        void submit({ name: nn(v.name), relationship: nn(v.relationship), phone: nn(v.phone) });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="e-name" label="Nama">
          <Input
            id="e-name"
            value={v.name}
            disabled={lockedIn(data, e.name)}
            onChange={(x) => setV({ ...v, name: x.target.value })}
          />
        </Field>
        <Field id="e-rel" label="Hubungan">
          <Input
            id="e-rel"
            value={v.relationship}
            placeholder="Ayah, Ibu, Suami…"
            disabled={lockedIn(data, e.relationship)}
            onChange={(x) => setV({ ...v, relationship: x.target.value })}
          />
        </Field>
        <Field id="e-phone" label="No. HP">
          <Input
            id="e-phone"
            inputMode="tel"
            value={v.phone}
            disabled={lockedIn(data, e.phone)}
            onChange={(x) => setV({ ...v, phone: x.target.value })}
          />
        </Field>
      </div>
      <StepActions pending={pending} onBack={onBack} />
    </form>
  );
}

function FamilyStep({
  data,
  onDone,
  onBack,
}: {
  data: MyOnboarding;
  onDone: () => void;
  onBack: () => void;
}) {
  const locked = data.mode === "completion" && data.family.length > 0;
  const [members, setMembers] = useState(
    data.family.map((m) => ({
      uid: crypto.randomUUID(),
      name: m.name,
      relationship: m.relationship,
      birthDate: m.birthDate ?? "",
      phoneNumber: m.phoneNumber ?? "",
    })),
  );
  const { submit, pending } = useSection("family", onDone);
  const married = data.personal.maritalStatus === "MARRIED";
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (locked) return onDone();
        void submit({
          members: members.map((m) => ({
            name: m.name,
            relationship: m.relationship,
            birthDate: m.birthDate || null,
            phoneNumber: nn(m.phoneNumber),
          })),
        });
      }}
    >
      {married ? (
        <Alert>
          <AlertDescription>Status Anda menikah: data suami/istri wajib diisi.</AlertDescription>
        </Alert>
      ) : null}
      {locked ? (
        <p className="text-muted-foreground text-sm">
          Data keluarga sudah terisi; koreksi lewat HR.
        </p>
      ) : null}
      {members.map((m, i) => (
        <div
          key={m.uid}
          className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end"
        >
          <Field id={`f-name-${i}`} label="Nama">
            <Input
              id={`f-name-${i}`}
              value={m.name}
              disabled={locked}
              onChange={(e) =>
                setMembers((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
            />
          </Field>
          <Field id={`f-rel-${i}`} label="Hubungan">
            <FormSelect
              id={`f-rel-${i}`}
              value={m.relationship}
              disabled={locked}
              onChange={(value) =>
                setMembers((l) => l.map((x, j) => (j === i ? { ...x, relationship: value } : x)))
              }
              placeholder="Pilih"
              options={FAMILY_RELATIONSHIPS.map((r) => ({
                value: r,
                label: FAMILY_RELATIONSHIP_LABELS[r],
              }))}
            />
          </Field>
          <Field id={`f-birth-${i}`} label="Tanggal lahir">
            <Input
              id={`f-birth-${i}`}
              type="date"
              value={m.birthDate}
              disabled={locked}
              onChange={(e) =>
                setMembers((l) =>
                  l.map((x, j) => (j === i ? { ...x, birthDate: e.target.value } : x)),
                )
              }
            />
          </Field>
          {locked ? null : (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Hapus anggota keluarga ${i + 1}`}
              onClick={() => setMembers((l) => l.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      ))}
      {locked ? null : (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setMembers((l) => [
              ...l,
              {
                uid: crypto.randomUUID(),
                name: "",
                relationship:
                  married && !l.some((x) => x.relationship === "SPOUSE") ? "SPOUSE" : "CHILD",
                birthDate: "",
                phoneNumber: "",
              },
            ])
          }
        >
          <Plus /> Tambah anggota keluarga
        </Button>
      )}
      <StepActions pending={pending} onBack={onBack} />
    </form>
  );
}

function BankStep({
  data,
  onDone,
  onBack,
}: {
  data: MyOnboarding;
  onDone: () => void;
  onBack: () => void;
}) {
  const b = data.bank;
  const locked = data.mode === "completion" && Boolean(b.accountNumber);
  const [v, setV] = useState({
    bankName: b.bankName ?? "",
    accountNumber: b.accountNumber ?? "",
    accountHolder: b.accountHolder ?? data.personal.fullName,
  });
  const { submit, pending } = useSection("bank", onDone);
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (locked) return onDone();
        void submit({
          bankName: nn(v.bankName),
          accountNumber: nn(v.accountNumber),
          accountHolder: nn(v.accountHolder),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="b-bank" label="Nama bank">
          <Input
            id="b-bank"
            value={v.bankName}
            disabled={locked}
            placeholder="BRI, BCA, Mandiri…"
            onChange={(e) => setV({ ...v, bankName: e.target.value })}
          />
        </Field>
        <Field id="b-number" label="Nomor rekening">
          <Input
            id="b-number"
            inputMode="numeric"
            value={v.accountNumber}
            disabled={locked}
            onChange={(e) => setV({ ...v, accountNumber: e.target.value })}
          />
        </Field>
        <Field id="b-holder" label="Nama pemilik rekening">
          <Input
            id="b-holder"
            value={v.accountHolder}
            disabled={locked}
            onChange={(e) => setV({ ...v, accountHolder: e.target.value })}
          />
        </Field>
      </div>
      <StepActions pending={pending} onBack={onBack} />
    </form>
  );
}

// ── Langkah 5: pendidikan & pengalaman ─────────────────────────────────────────────────────────

function ProfessionalStep({
  data,
  onDone,
  onBack,
}: {
  data: MyOnboarding;
  onDone: () => void;
  onBack: () => void;
}) {
  const locked = data.mode === "completion" && data.educations.length > 0;
  const [educations, setEducations] = useState(
    data.educations.length > 0
      ? data.educations.map((e) => ({
          uid: crypto.randomUUID(),
          level: e.level ?? "",
          schoolName: e.schoolName,
          major: e.major ?? "",
          graduationYear: e.graduationYear ? String(e.graduationYear) : "",
        }))
      : [{ uid: crypto.randomUUID(), level: "", schoolName: "", major: "", graduationYear: "" }],
  );
  const [jobs, setJobs] = useState(
    data.workExperiences.map((w) => ({
      uid: crypto.randomUUID(),
      companyName: w.companyName,
      position: w.position,
      startYear: String(w.startYear),
      endYear: w.endYear ? String(w.endYear) : "",
    })),
  );
  const { submit, pending } = useSection("professional", onDone);
  const year = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (locked) return onDone();
        void submit({
          educations: educations
            .filter((x) => x.schoolName.trim() !== "")
            .map((x) => ({
              level: x.level || "OTHER",
              schoolName: x.schoolName,
              major: nn(x.major),
              graduationYear: year(x.graduationYear),
            })),
          trainings: data.trainings,
          workExperiences: jobs
            .filter((j) => j.companyName.trim() !== "")
            .map((j) => ({
              companyName: j.companyName,
              position: j.position,
              startYear: Number(j.startYear),
              endYear: year(j.endYear),
            })),
        });
      }}
    >
      <section className="space-y-3">
        <h2 className="font-medium">Pendidikan (yang pertama = pendidikan terakhir, wajib)</h2>
        {educations.map((x, i) => (
          <div key={x.uid} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4">
            <Field id={`ed-level-${i}`} label="Jenjang">
              <FormSelect
                id={`ed-level-${i}`}
                value={x.level}
                disabled={locked}
                onChange={(value) =>
                  setEducations((l) => l.map((y, j) => (j === i ? { ...y, level: value } : y)))
                }
                placeholder="Pilih"
                options={EDUCATION_LEVELS.map((lv) => ({
                  value: lv,
                  label: EDUCATION_LABEL[lv] ?? lv,
                }))}
              />
            </Field>
            <Field id={`ed-school-${i}`} label="Sekolah / kampus">
              <Input
                id={`ed-school-${i}`}
                value={x.schoolName}
                disabled={locked}
                onChange={(e) =>
                  setEducations((l) =>
                    l.map((y, j) => (j === i ? { ...y, schoolName: e.target.value } : y)),
                  )
                }
              />
            </Field>
            <Field id={`ed-major-${i}`} label="Jurusan">
              <Input
                id={`ed-major-${i}`}
                value={x.major}
                disabled={locked}
                onChange={(e) =>
                  setEducations((l) =>
                    l.map((y, j) => (j === i ? { ...y, major: e.target.value } : y)),
                  )
                }
              />
            </Field>
            <Field id={`ed-year-${i}`} label="Tahun lulus">
              <Input
                id={`ed-year-${i}`}
                inputMode="numeric"
                value={x.graduationYear}
                disabled={locked}
                onChange={(e) =>
                  setEducations((l) =>
                    l.map((y, j) => (j === i ? { ...y, graduationYear: e.target.value } : y)),
                  )
                }
              />
            </Field>
          </div>
        ))}
        {locked ? null : (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setEducations((l) => [
                ...l,
                {
                  uid: crypto.randomUUID(),
                  level: "",
                  schoolName: "",
                  major: "",
                  graduationYear: "",
                },
              ])
            }
          >
            <Plus /> Tambah pendidikan
          </Button>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-medium">Riwayat kerja (opsional)</h2>
        {jobs.map((j, i) => (
          <div key={j.uid} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4">
            <Field id={`job-co-${i}`} label="Perusahaan">
              <Input
                id={`job-co-${i}`}
                value={j.companyName}
                disabled={locked}
                onChange={(e) =>
                  setJobs((l) =>
                    l.map((y, k) => (k === i ? { ...y, companyName: e.target.value } : y)),
                  )
                }
              />
            </Field>
            <Field id={`job-pos-${i}`} label="Jabatan">
              <Input
                id={`job-pos-${i}`}
                value={j.position}
                disabled={locked}
                onChange={(e) =>
                  setJobs((l) =>
                    l.map((y, k) => (k === i ? { ...y, position: e.target.value } : y)),
                  )
                }
              />
            </Field>
            <Field id={`job-start-${i}`} label="Tahun mulai">
              <Input
                id={`job-start-${i}`}
                inputMode="numeric"
                value={j.startYear}
                disabled={locked}
                onChange={(e) =>
                  setJobs((l) =>
                    l.map((y, k) => (k === i ? { ...y, startYear: e.target.value } : y)),
                  )
                }
              />
            </Field>
            <Field id={`job-end-${i}`} label="Tahun selesai">
              <Input
                id={`job-end-${i}`}
                inputMode="numeric"
                value={j.endYear}
                disabled={locked}
                onChange={(e) =>
                  setJobs((l) => l.map((y, k) => (k === i ? { ...y, endYear: e.target.value } : y)))
                }
              />
            </Field>
          </div>
        ))}
        {locked ? null : (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setJobs((l) => [
                ...l,
                {
                  uid: crypto.randomUUID(),
                  companyName: "",
                  position: "",
                  startYear: "",
                  endYear: "",
                },
              ])
            }
          >
            <Plus /> Tambah riwayat kerja
          </Button>
        )}
      </section>
      <StepActions pending={pending} onBack={onBack} />
    </form>
  );
}

// ── Langkah 6: dokumen ─────────────────────────────────────────────────────────────────────────

function DocumentsStep({
  data,
  onDone,
  onBack,
}: {
  data: MyOnboarding;
  onDone: () => void;
  onBack: () => void;
}) {
  const upload = useUploadDocument();
  const remove = useDeleteDocument();
  const [busyType, setBusyType] = useState<DocumentType | null>(null);
  const required = new Set<DocumentType>(REQUIRED_DOCUMENTS);
  if (data.personal.npwpNumber) required.add("NPWP");
  if (data.personal.bpjsEmploymentNumber) required.add("BPJS_EMPLOYMENT");
  if (data.personal.bpjsHealthNumber) required.add("BPJS_HEALTH");
  const onFile = async (type: DocumentType, file: File) => {
    setBusyType(type);
    try {
      await upload.mutateAsync({ type, file });
      toast.success(`${DOCUMENT_TYPE_LABELS[type]} terunggah.`);
    } catch (error) {
      toast.error(
        error instanceof Error && !("status" in error) ? error.message : errorMessage(error),
      );
    } finally {
      setBusyType(null);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        PDF, JPG, atau PNG, maksimal 5 MB per dokumen.
      </p>
      <ul className="divide-y rounded-lg border">
        {DOCUMENT_TYPES.filter((t) => t !== "OTHER").map((type) => {
          const docs = data.documents.filter((d) => d.type === type);
          return (
            <li
              key={type}
              className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium">
                  {DOCUMENT_TYPE_LABELS[type]}{" "}
                  <span className="text-muted-foreground font-normal">
                    {required.has(type) ? "(wajib)" : "(opsional)"}
                  </span>
                </p>
                {docs.map((d) => (
                  <p key={d.id} className="text-muted-foreground flex items-center gap-2 text-xs">
                    <FileText className="size-3.5" />
                    {d.url ? (
                      <a
                        className="underline underline-offset-4"
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Lihat ({Math.ceil(d.sizeBytes / 1024)} KB)
                      </a>
                    ) : (
                      `${Math.ceil(d.sizeBytes / 1024)} KB`
                    )}
                    {d.removable ? (
                      <button
                        type="button"
                        className="text-destructive"
                        aria-label={`Hapus ${DOCUMENT_TYPE_LABELS[type]}`}
                        onClick={() => remove.mutate(d.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </p>
                ))}
              </div>
              <label
                className={cn(
                  "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                  busyType && "pointer-events-none opacity-60",
                )}
              >
                <Upload className="size-4" />
                {busyType === type ? "Mengunggah…" : docs.length > 0 ? "Ganti" : "Unggah"}
                <input
                  type="file"
                  className="sr-only"
                  aria-label={`Unggah ${DOCUMENT_TYPE_LABELS[type]}`}
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFile(type, file);
                    e.target.value = "";
                  }}
                />
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Kembali
        </Button>
        <Button type="button" variant="brand" onClick={onDone}>
          Lanjut
        </Button>
      </div>
    </div>
  );
}

// ── Langkah 7: ringkasan & kirim ───────────────────────────────────────────────────────────────

function SummaryStep({
  data,
  onBack,
  onGoTo,
}: {
  data: MyOnboarding;
  onBack: () => void;
  onGoTo: (step: StepKey) => void;
}) {
  const submit = useSubmitOnboarding();
  const [agreed, setAgreed] = useState(false);
  useEffect(() => setAgreed(false), []);
  const labelOf = (section: string) => STEPS.find((s) => s.key === section)?.label ?? "Dokumen";
  return (
    <div className="space-y-4">
      {data.missing.length > 0 ? (
        <div className="rounded-lg border p-4">
          <p className="mb-2 font-medium">Masih perlu dilengkapi ({data.missing.length})</p>
          <ul className="space-y-1 text-sm">
            {data.missing.map((m) => (
              <li key={`${m.section}-${m.field}`}>
                <button
                  type="button"
                  className="text-left underline underline-offset-4"
                  onClick={() => onGoTo(m.section as StepKey)}
                >
                  {labelOf(m.section)}
                </button>
                : {m.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>Semua data wajib sudah lengkap.</AlertDescription>
        </Alert>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-brand mt-0.5 size-4"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        Saya menyatakan data dan dokumen yang saya isi benar dan sesuai aslinya.
      </label>
      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Kembali
        </Button>
        <Button
          type="button"
          variant="brand"
          disabled={!agreed || data.missing.length > 0 || submit.isPending}
          onClick={async () => {
            try {
              await submit.mutateAsync();
              toast.success("Data terkirim. HR akan memeriksanya.");
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          {submit.isPending ? "Mengirim…" : "Kirim untuk diperiksa HR"}
        </Button>
      </div>
    </div>
  );
}
