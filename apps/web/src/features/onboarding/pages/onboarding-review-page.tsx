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
  REVIEW_SECTION_LABELS,
  REVIEW_SECTIONS,
  type ReviewSection,
} from "@hris/shared";
import { ArrowLeft, Check, FileText, PencilLine, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div>
      <PageHeader
        eyebrow={<BackLink />}
        title={data.personal.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{data.employeeNumber}</span>
            <Badge variant="warning">{ONBOARDING_STATUS_LABELS[data.status]}</Badge>
            {data.reviewMode === "completion" ? (
              <Badge variant="secondary">Karyawan terdaftar — lengkapi data</Badge>
            ) : null}
          </span>
        }
      />
      {!data.canDecide ? (
        <Alert className="mb-4">
          <AlertDescription>
            Belum ada kiriman yang menunggu keputusan. Data di bawah hanya untuk dilihat.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <PersonalCard data={data} />
        <WorkCard data={data} />
        <SectionCard title="Kontak darurat">
          <Facts
            items={[
              ["Nama", data.emergency.name],
              ["Hubungan", data.emergency.relationship],
              ["Telepon", data.emergency.phone],
            ]}
          />
        </SectionCard>
        <SectionCard title="Rekening">
          <Facts
            items={[
              ["Bank", data.bank.bankName],
              ["Nomor rekening", data.bank.accountNumber],
              ["Atas nama", data.bank.accountHolder],
            ]}
          />
        </SectionCard>
        <SectionCard title="Keluarga">
          {data.family.length === 0 ? (
            <Empty>Tidak ada anggota keluarga.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.family.map((m) => (
                <li key={`${m.name}-${m.relationship}`}>
                  {m.name} —{" "}
                  {FAMILY_RELATIONSHIP_LABELS[
                    m.relationship as keyof typeof FAMILY_RELATIONSHIP_LABELS
                  ] ?? m.relationship}
                  {m.birthDate ? `, lahir ${formatDate(m.birthDate)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Pendidikan & pengalaman">
          <ul className="space-y-1 text-sm">
            {data.educations.map((e) => (
              <li key={`${e.level}-${e.schoolName}`}>
                {e.level ?? "—"} · {e.schoolName}
                {e.major ? ` (${e.major})` : ""}
                {e.graduationYear ? `, lulus ${e.graduationYear}` : ""}
              </li>
            ))}
            {data.workExperiences.map((w) => (
              <li key={`${w.companyName}-${w.startYear}`} className="text-muted-foreground">
                {w.position} di {w.companyName} ({w.startYear}–{w.endYear ?? "sekarang"})
              </li>
            ))}
            {data.trainings.map((t) => (
              <li key={`${t.trainingField}-${t.trainingYear}`} className="text-muted-foreground">
                Pelatihan {t.trainingField}
                {t.organizer ? ` — ${t.organizer}` : ""}
                {t.trainingYear ? ` (${t.trainingYear})` : ""}
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard title="Dokumen & foto">
          <ul className="space-y-1.5 text-sm">
            {data.photoUrl ? (
              <li>
                <a href={data.photoUrl} target="_blank" rel="noreferrer" className="underline">
                  Foto profil
                </a>
              </li>
            ) : (
              <li className="text-muted-foreground">Belum ada foto.</li>
            )}
            {data.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <FileText className="text-muted-foreground size-4" />
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="underline">
                    {DOCUMENT_TYPE_LABELS[d.type as DocumentType] ?? d.type}
                  </a>
                ) : (
                  (DOCUMENT_TYPE_LABELS[d.type as DocumentType] ?? d.type)
                )}
                <span className="text-muted-foreground text-xs">
                  {Math.ceil(d.sizeBytes / 1024)} KB
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
        {data.missing.length > 0 ? (
          <SectionCard title="Masih kurang">
            <ul className="text-destructive list-disc pl-5 text-sm">
              {data.missing.map((m) => (
                <li key={`${m.section}-${m.field}`}>{m.message}</li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
        <SectionCard title="Riwayat review">
          {data.reviews.length === 0 ? (
            <Empty>Belum ada keputusan.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.reviews.map((r) => (
                <li key={r.id}>
                  <p>
                    <span className="font-medium">{DECISION_LABELS[r.decision]}</span>{" "}
                    <span className="text-muted-foreground">
                      {formatDate(r.decidedAt)}
                      {r.reviewerEmail ? ` oleh ${r.reviewerEmail}` : ""}
                    </span>
                  </p>
                  {r.sectionNotes
                    ? Object.entries(r.sectionNotes).map(([section, note]) => (
                        <p key={section} className="text-muted-foreground">
                          {REVIEW_SECTION_LABELS[section as ReviewSection]}: {note}
                        </p>
                      ))
                    : null}
                  {r.reason ? <p className="text-muted-foreground">Alasan: {r.reason}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {data.canDecide ? (
        // Menempel di bawah kolom isi (tidak menutupi sidebar).
        <div className="bg-background/95 sticky bottom-0 z-10 -mx-4 mt-6 border-t backdrop-blur md:-mx-8">
          <div className="flex flex-wrap justify-end gap-2 px-4 py-3 md:px-8">
            {data.reviewMode === "candidate" ? (
              <Button variant="outline" onClick={() => setDialog("cancel")}>
                <X /> Batalkan penerimaan
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setDialog("revise")}>
              <PencilLine /> Minta revisi
            </Button>
            <Button onClick={() => setDialog("approve")} disabled={data.missing.length > 0}>
              <Check /> Setujui
            </Button>
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

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words">{value === null || value === "" ? "—" : value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PersonalCard({ data }: { data: OnboardingReview }) {
  const p = data.personal;
  const label = <T extends string>(map: Record<T, string>, v: string | null) =>
    v ? (map[v as T] ?? v) : null;
  const absent = (value: string | null, isAbsent: boolean) => (isAbsent ? "Belum punya" : value);
  return (
    <SectionCard title="Data pribadi">
      <Facts
        items={[
          ["Email pribadi", data.personalEmail],
          ["Jenis kelamin", label(GENDER_LABELS, p.gender)],
          [
            "Tempat, tgl lahir",
            [p.birthPlace, p.birthDate ? formatDate(p.birthDate) : null].filter(Boolean).join(", "),
          ],
          ["NIK KTP", p.ktpNumber],
          ["Nomor KK", p.kkNumber],
          ["Agama", label(RELIGION_LABELS, p.religion)],
          ["Status nikah", label(MARITAL_STATUS_LABELS, p.maritalStatus)],
          ["Alamat KTP", p.ktpAddress],
          ["Domisili", p.domicileAddress],
          ["Kota asal", p.originCity],
          ["Telepon", p.phoneNumber],
          ["NPWP", absent(p.npwpNumber, p.npwpAbsent)],
          ["BPJS Ketenagakerjaan", absent(p.bpjsEmploymentNumber, p.bpjsEmploymentAbsent)],
          ["BPJS Kesehatan", absent(p.bpjsHealthNumber, p.bpjsHealthAbsent)],
        ]}
      />
    </SectionCard>
  );
}

function WorkCard({ data }: { data: OnboardingReview }) {
  const master = useMasterData().data;
  const name = (list: { id: string; name: string }[] | undefined, id: string | null) =>
    id ? (list?.find((x) => x.id === id)?.name ?? "…") : null;
  return (
    <SectionCard title="Data kerja">
      <Facts
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
