import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  FAMILY_RELATIONSHIP_LABELS,
  MARITAL_STATUS_LABELS,
  ONBOARDING_STATUS_LABELS,
  type OnboardingDecisionInput,
  PTKP_LABELS,
  PTKP_STATUSES,
  type PtkpStatus,
  RELIGION_LABELS,
  REQUIRED_DOCUMENTS,
  REVIEW_SECTION_LABELS,
  REVIEW_SECTIONS,
  type ReviewSection,
} from "@hris/shared";
import {
  ArrowLeft,
  Banknote,
  Briefcase,
  Check,
  ExternalLink,
  FileText,
  GraduationCap,
  History,
  PencilLine,
  PhoneCall,
  TriangleAlert,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { useMasterData } from "@/features/employee/api";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDecideOnboarding, useOnboardingReview } from "../api";
import type { OnboardingReview } from "../schemas";

// D-045 c / D-047: halaman review isian onboarding (SA, atau HR dengan grant review di PT calon).
// Reviewer hanya membaca isian calon; yang bisa ditetapkan/dikoreksi: PTKP & data kerja.

const DECISION_LABELS = {
  APPROVED: "Disetujui",
  REVISION_REQUESTED: "Diminta revisi",
  CANCELLED: "Dibatalkan",
} as const;
const GENDER_LABELS: Record<string, string> = { MALE: "Laki-laki", FEMALE: "Perempuan" };

type DialogKind = "approve" | "revise" | "cancel" | null;

export function OnboardingReviewPage() {
  const { employeeId = "" } = useParams();
  const review = useOnboardingReview(employeeId);
  const [dialog, setDialog] = useState<DialogKind>(null);

  if (review.isPending) return <p className="text-muted-foreground text-sm">Memuat data…</p>;
  if (review.isError) {
    return (
      <div className="space-y-3">
        <p>
          {review.error instanceof ApiError && review.error.status === 404
            ? "Data ini tidak sedang dalam proses onboarding (mungkin sudah disetujui atau di luar cakupan Anda). Karyawan yang sudah disetujui ada di Data Karyawan."
            : errorMessage(review.error)}
        </p>
        <BackLink />
      </div>
    );
  }
  const data = review.data;
  const docTypes = new Set(data.documents.map((d) => d.type));
  const missingDocs = REQUIRED_DOCUMENTS.filter((t) => !docTypes.has(t));

  return (
    <div className="space-y-5">
      <BackLink />
      <ProfileHeader data={data} />
      {!data.canDecide ? (
        <Alert>
          <AlertDescription>
            Belum ada kiriman yang menunggu keputusan. Data di bawah hanya untuk dilihat.
          </AlertDescription>
        </Alert>
      ) : null}
      {data.missing.length > 0 ? (
        <div className="border-warning/40 bg-warning-soft/60 rounded-xl border">
          <div className="text-warning-soft-foreground flex items-center gap-2 px-4 py-3 text-sm">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <p className="font-medium">
              {data.canDecide
                ? `Belum bisa disetujui — ${data.missing.length} data wajib masih kurang`
                : `Calon belum selesai mengisi — ${data.missing.length} data wajib belum diisi`}
            </p>
          </div>
          <ul className="border-warning/30 grid gap-x-6 gap-y-1 border-t px-4 py-3 text-sm sm:grid-cols-2">
            {data.missing.map((m) => (
              <li key={`${m.section}-${m.field}`} className="flex gap-2">
                <span className="text-warning-soft-foreground" aria-hidden>
                  •
                </span>
                {m.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <PersonalCard data={data} />
          <div className="grid gap-5 md:grid-cols-2">
            <SectionCard title="Kontak darurat" icon={PhoneCall}>
              <Facts
                items={[
                  ["Nama", data.emergency.name],
                  ["Hubungan", data.emergency.relationship],
                  ["Telepon", data.emergency.phone],
                ]}
              />
            </SectionCard>
            <SectionCard title="Rekening" icon={Banknote}>
              <Facts
                items={[
                  ["Bank", data.bank.bankName],
                  ["Nomor rekening", data.bank.accountNumber],
                  ["Atas nama", data.bank.accountHolder],
                ]}
              />
            </SectionCard>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <SectionCard title="Keluarga" icon={Users}>
              {data.family.length === 0 ? (
                <Empty>Tidak ada anggota keluarga.</Empty>
              ) : (
                <ul className="divide-y">
                  {data.family.map((m) => (
                    <li key={`${m.name}-${m.relationship}`} className="py-2.5 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {FAMILY_RELATIONSHIP_LABELS[
                          m.relationship as keyof typeof FAMILY_RELATIONSHIP_LABELS
                        ] ?? m.relationship}
                        {m.birthDate ? ` · lahir ${formatDate(m.birthDate)}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Pendidikan & pengalaman" icon={GraduationCap}>
              {data.educations.length + data.workExperiences.length + data.trainings.length ===
              0 ? (
                <Empty>Belum diisi.</Empty>
              ) : null}
              <ul className="divide-y">
                {data.educations.map((e, i) => (
                  <li key={`${e.level}-${e.schoolName}`} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">
                      {e.schoolName}
                      {i === 0 ? (
                        <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                          (terakhir)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {e.level ?? "—"}
                      {e.major ? ` · ${e.major}` : ""}
                      {e.graduationYear ? ` · lulus ${e.graduationYear}` : ""}
                    </p>
                  </li>
                ))}
                {data.workExperiences.map((w) => (
                  <li
                    key={`${w.companyName}-${w.startYear}`}
                    className="py-2.5 first:pt-0 last:pb-0"
                  >
                    <p className="text-sm font-medium">
                      {w.position} · {w.companyName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Riwayat kerja · {w.startYear}–{w.endYear ?? "sekarang"}
                    </p>
                  </li>
                ))}
                {data.trainings.map((t) => (
                  <li
                    key={`${t.trainingField}-${t.trainingYear}`}
                    className="py-2.5 first:pt-0 last:pb-0"
                  >
                    <p className="text-sm font-medium">{t.trainingField}</p>
                    <p className="text-muted-foreground text-xs">
                      Pelatihan
                      {t.organizer ? ` · ${t.organizer}` : ""}
                      {t.trainingYear ? ` · ${t.trainingYear}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        </div>

        <div className="space-y-5 xl:sticky xl:top-20">
          <WorkCard data={data} />
          <SectionCard
            title="Dokumen"
            icon={FileText}
            aside={
              <span className="text-muted-foreground text-xs">
                {REQUIRED_DOCUMENTS.length - missingDocs.length}/{REQUIRED_DOCUMENTS.length} wajib
              </span>
            }
          >
            <ul className="space-y-1.5">
              {data.documents.map((d) => {
                const label = DOCUMENT_TYPE_LABELS[d.type as DocumentType] ?? d.type;
                const required = (REQUIRED_DOCUMENTS as readonly string[]).includes(d.type);
                const body = (
                  <>
                    <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md">
                      <FileText className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{label}</span>
                      <span className="text-muted-foreground block text-xs">
                        {required ? "Wajib" : "Opsional"} · {Math.ceil(d.sizeBytes / 1024)} KB
                      </span>
                    </span>
                    {d.url ? (
                      <ExternalLink className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    ) : null}
                  </>
                );
                return (
                  <li key={d.id}>
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={label}
                        className="hover:bg-muted/60 flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors"
                      >
                        {body}
                      </a>
                    ) : (
                      <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
              {missingDocs.map((t) => (
                <li
                  key={t}
                  className="border-warning/50 bg-warning-soft/40 flex items-center gap-3 rounded-lg border border-dashed px-3 py-2"
                >
                  <span className="text-warning-soft-foreground grid size-8 shrink-0 place-items-center rounded-md">
                    <TriangleAlert className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{DOCUMENT_TYPE_LABELS[t]}</span>
                    <span className="text-warning-soft-foreground block text-xs">
                      Wajib · belum diunggah
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Riwayat review" icon={History}>
            {data.reviews.length === 0 ? (
              <Empty>Belum ada keputusan.</Empty>
            ) : (
              <ol className="border-border space-y-4 border-l pl-4">
                {data.reviews.map((r) => (
                  <li key={r.id} className="relative text-sm">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-[var(--card)]",
                        r.decision === "APPROVED"
                          ? "bg-success"
                          : r.decision === "CANCELLED"
                            ? "bg-destructive"
                            : "bg-warning",
                      )}
                    />
                    <p className="font-medium">{DECISION_LABELS[r.decision]}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(r.decidedAt)}
                      {r.reviewerEmail ? ` · ${r.reviewerEmail}` : ""}
                    </p>
                    {r.sectionNotes
                      ? Object.entries(r.sectionNotes).map(([section, note]) => (
                          <p
                            key={section}
                            className="bg-muted/50 mt-1.5 rounded-md px-2.5 py-1.5 text-xs"
                          >
                            <span className="font-medium">
                              {REVIEW_SECTION_LABELS[section as ReviewSection]}:
                            </span>{" "}
                            {note}
                          </p>
                        ))
                      : null}
                    {r.reason ? (
                      <p className="text-muted-foreground mt-1 text-xs">Alasan: {r.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>
      </div>

      {data.canDecide ? (
        // Menempel di bawah kolom isi (tidak menutupi sidebar).
        <div className="bg-background/95 sticky bottom-0 z-10 -mx-4 mt-2 border-t backdrop-blur md:-mx-8">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-8">
            <p className="text-muted-foreground text-sm">
              {data.missing.length > 0
                ? "Lengkapi kekurangan (minta revisi) sebelum menyetujui."
                : "Periksa data & dokumen, lalu ambil keputusan."}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.reviewMode === "candidate" ? (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setDialog("cancel")}
                >
                  <X /> Batalkan penerimaan
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setDialog("revise")}>
                <PencilLine /> Minta revisi
              </Button>
              <Button
                variant="brand"
                onClick={() => setDialog("approve")}
                disabled={data.missing.length > 0}
              >
                <Check /> Setujui
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <DecisionDialog data={data} kind={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/penerimaan"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
    >
      <ArrowLeft className="size-3" /> Kembali ke Penerimaan
    </Link>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

function ProfileHeader({ data }: { data: OnboardingReview }) {
  const master = useMasterData().data;
  const name = (list: { id: string; name: string }[] | undefined, id: string | null) =>
    id ? (list?.find((x) => x.id === id)?.name ?? "…") : "—";
  const facts: [string, ReactNode][] = [
    ["Perusahaan", name(master?.companies, data.work.companyId)],
    ["Jabatan", name(master?.positions, data.work.positionId)],
    ["Tanggal masuk", formatDate(data.work.joinDate)],
    ["Email pribadi", data.personalEmail ?? "—"],
  ];
  return (
    <section className="bg-card rounded-2xl border p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {data.photoUrl ? (
          <a
            href={data.photoUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Foto profil"
            className="shrink-0"
          >
            <img src={data.photoUrl} alt="" className="size-20 rounded-2xl border object-cover" />
          </a>
        ) : (
          <span className="bg-muted text-muted-foreground grid size-20 shrink-0 place-items-center rounded-2xl text-xl font-semibold">
            {initials(data.personal.fullName ?? "?")}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {data.personal.fullName}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground font-mono">{data.employeeNumber}</span>
            <Badge variant="warning">{ONBOARDING_STATUS_LABELS[data.status]}</Badge>
            {data.reviewMode === "completion" ? (
              <Badge variant="secondary">Karyawan terdaftar — lengkapi data</Badge>
            ) : null}
            {!data.photoUrl ? <Badge variant="destructive">Belum ada foto</Badge> : null}
          </div>
        </div>
      </div>
      <dl className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SectionCard({
  title,
  icon: Icon,
  aside,
  children,
}: {
  title: string;
  icon: typeof UserRound;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-card rounded-2xl border">
      <header className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="text-muted-foreground size-4" aria-hidden />
          {title}
        </h2>
        {aside}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

/** Label kecil di atas nilai — mudah dipindai, rapi di 1–2 kolom. */
function Facts({ items, columns = 1 }: { items: [string, ReactNode][]; columns?: 1 | 2 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", columns === 2 && "sm:grid-cols-2")}>
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium break-words">
            {value === null || value === "" ? (
              <span className="text-muted-foreground font-normal">—</span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PersonalCard({ data }: { data: OnboardingReview }) {
  const p = data.personal;
  const label = <T extends string>(map: Record<T, string>, v: string | null) =>
    v ? (map[v as T] ?? v) : null;
  const absent = (value: string | null, isAbsent: boolean) =>
    isAbsent ? <span className="text-muted-foreground font-normal">Belum punya</span> : value;
  return (
    <SectionCard title="Data pribadi" icon={UserRound}>
      <div className="space-y-6">
        <Group title="Identitas">
          <Facts
            columns={2}
            items={[
              [
                "NIK KTP",
                p.ktpNumber ? (
                  <span key="ktp" className="font-mono">
                    {p.ktpNumber}
                  </span>
                ) : null,
              ],
              [
                "Nomor KK",
                p.kkNumber ? (
                  <span key="kk" className="font-mono">
                    {p.kkNumber}
                  </span>
                ) : null,
              ],
              [
                "Tempat, tgl lahir",
                [p.birthPlace, p.birthDate ? formatDate(p.birthDate) : null]
                  .filter(Boolean)
                  .join(", "),
              ],
              ["Jenis kelamin", label(GENDER_LABELS, p.gender)],
              ["Agama", label(RELIGION_LABELS, p.religion)],
              ["Status nikah", label(MARITAL_STATUS_LABELS, p.maritalStatus)],
            ]}
          />
        </Group>
        <Group title="Kontak & alamat">
          <Facts
            columns={2}
            items={[
              ["Telepon", p.phoneNumber],
              ["Kota asal", p.originCity],
              ["Alamat KTP", p.ktpAddress],
              ["Domisili", p.domicileAddress],
            ]}
          />
        </Group>
        <Group title="Kepesertaan">
          <Facts
            columns={2}
            items={[
              ["NPWP", absent(p.npwpNumber, p.npwpAbsent)],
              ["BPJS Ketenagakerjaan", absent(p.bpjsEmploymentNumber, p.bpjsEmploymentAbsent)],
              ["BPJS Kesehatan", absent(p.bpjsHealthNumber, p.bpjsHealthAbsent)],
            ]}
          />
        </Group>
      </div>
    </SectionCard>
  );
}

function WorkCard({ data }: { data: OnboardingReview }) {
  const master = useMasterData().data;
  const name = (list: { id: string; name: string }[] | undefined, id: string | null) =>
    id ? (list?.find((x) => x.id === id)?.name ?? "…") : null;
  return (
    <SectionCard title="Data kerja" icon={Briefcase}>
      <Facts
        columns={2}
        items={[
          ["Perusahaan", name(master?.companies, data.work.companyId)],
          ["Status kepegawaian", name(master?.employmentStatuses, data.work.employmentStatusId)],
          ["Jabatan", name(master?.positions, data.work.positionId)],
          ["Lokasi kerja", name(master?.workLocations, data.work.workLocationId)],
          ["Grade", name(master?.grades, data.work.gradeId)],
          ["Tanggal masuk", formatDate(data.work.joinDate)],
          ["PTKP", data.ptkpStatus ? PTKP_LABELS[data.ptkpStatus] : null],
        ]}
      />
    </SectionCard>
  );
}

function DecisionDialog({
  data,
  kind,
  onClose,
}: {
  data: OnboardingReview;
  kind: DialogKind;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const decide = useDecideOnboarding(data.employeeId);
  const master = useMasterData().data;
  const [ptkp, setPtkp] = useState<PtkpStatus | "">(data.ptkpStatus ?? "");
  const [positionId, setPositionId] = useState(data.work.positionId);
  const [statusId, setStatusId] = useState(data.work.employmentStatusId);
  const [joinDate, setJoinDate] = useState(data.work.joinDate);
  const [notes, setNotes] = useState<Partial<Record<ReviewSection, string>>>({});
  const [reason, setReason] = useState("");

  const submit = async (body: OnboardingDecisionInput, done: string) => {
    try {
      await decide.mutateAsync(body);
      toast.success(done);
      onClose();
      navigate("/penerimaan");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const approve = () => {
    if (!ptkp) return;
    const work = {
      ...(positionId !== data.work.positionId ? { positionId } : {}),
      ...(statusId !== data.work.employmentStatusId ? { employmentStatusId: statusId } : {}),
      ...(joinDate !== data.work.joinDate ? { joinDate } : {}),
    };
    void submit(
      {
        decision: "APPROVED",
        ptkpStatus: ptkp,
        ...(Object.keys(work).length > 0 ? { work } : {}),
      },
      `Data ${data.personal.fullName} disetujui.`,
    );
  };
  const hasNote = Object.values(notes).some((n) => n?.trim());

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {kind === "approve" ? (
          <>
            <DialogHeader>
              <DialogTitle>Setujui data</DialogTitle>
              <DialogDescription>
                {data.reviewMode === "candidate"
                  ? "Calon menjadi karyawan aktif dan tampil di Data Karyawan."
                  : "Kewajiban melengkapi data karyawan ini selesai."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ptkp">Status PTKP</Label>
                <FormSelect
                  id="ptkp"
                  value={ptkp}
                  onChange={(v) => setPtkp(v as PtkpStatus)}
                  options={PTKP_STATUSES.map((s) => ({ value: s, label: PTKP_LABELS[s] }))}
                  placeholder="Pilih PTKP"
                />
              </div>
              {data.reviewMode === "candidate" ? (
                <>
                  <p className="text-muted-foreground text-xs">
                    Koreksi data kerja bila perlu (tercatat di riwayat kepegawaian).
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="position">Jabatan</Label>
                    <FormSelect
                      id="position"
                      value={positionId}
                      onChange={setPositionId}
                      options={(master?.positions ?? []).map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                      placeholder="Pilih jabatan"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="status">Status kepegawaian</Label>
                    <FormSelect
                      id="status"
                      value={statusId}
                      onChange={setStatusId}
                      options={(master?.employmentStatuses ?? []).map((s) => ({
                        value: s.id,
                        label: s.name,
                      }))}
                      placeholder="Pilih status"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="joinDate">Tanggal masuk</Label>
                    <Input
                      id="joinDate"
                      type="date"
                      value={joinDate}
                      onChange={(e) => setJoinDate(e.target.value)}
                    />
                  </div>
                </>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Batal
              </Button>
              <Button onClick={approve} disabled={!ptkp || decide.isPending}>
                Setujui
              </Button>
            </DialogFooter>
          </>
        ) : null}
        {kind === "revise" ? (
          <>
            <DialogHeader>
              <DialogTitle>Minta revisi</DialogTitle>
              <DialogDescription>
                Beri catatan pada bagian yang perlu diperbaiki. Hanya bagian bercatatan yang bisa
                diubah. Email ke calon hanya berisi nama bagian.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {REVIEW_SECTIONS.map((section) => (
                <div key={section} className="space-y-1.5">
                  <Label htmlFor={`note-${section}`}>{REVIEW_SECTION_LABELS[section]}</Label>
                  <Textarea
                    id={`note-${section}`}
                    rows={2}
                    maxLength={500}
                    value={notes[section] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [section]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Batal
              </Button>
              <Button
                disabled={!hasNote || decide.isPending}
                onClick={() =>
                  void submit(
                    { decision: "REVISION_REQUESTED", sectionNotes: notes },
                    "Permintaan revisi dikirim.",
                  )
                }
              >
                Kirim permintaan revisi
              </Button>
            </DialogFooter>
          </>
        ) : null}
        {kind === "cancel" ? (
          <>
            <DialogHeader>
              <DialogTitle>Batalkan penerimaan</DialogTitle>
              <DialogDescription>
                Akun calon dinonaktifkan dan datanya tidak dilanjutkan. Tindakan ini tidak bisa
                dibatalkan dari aplikasi.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Alasan</Label>
              <Textarea
                id="reason"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Kembali
              </Button>
              <Button
                variant="destructive"
                disabled={reason.trim().length < 3 || decide.isPending}
                onClick={() =>
                  void submit({ decision: "CANCELLED", reason }, "Penerimaan dibatalkan.")
                }
              >
                Batalkan penerimaan
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
