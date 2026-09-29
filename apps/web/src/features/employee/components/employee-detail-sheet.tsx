import {
  EMPLOYMENT_CHANGE_LABELS,
  type EmploymentChangeType,
  EXIT_REASON_LABELS,
  GENDER_LABELS,
  ROLE_LABELS,
} from "@hris/shared";
import {
  ArrowLeftRight,
  Award,
  BriefcaseBusiness,
  CircleUser,
  GraduationCap,
  HeartHandshake,
  History,
  Landmark,
  Lock,
  Pencil,
  Power,
  RotateCcw,
  UserRoundCheck,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { FEATURES } from "@/app/feature-flags";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useEmployee } from "../api";
import { MARITAL_LABELS, RELATIONSHIP_LABELS, RELIGION_LABELS, tenure } from "../labels";
import type { EmployeeDetail } from "../schemas";
import { EmployeeAvatar } from "./employee-avatar";
import { ActiveDot, ExitReasonBadge, StatusBadge } from "./status-badge";

const PARAM = "pegawai";

/** Detail dibuka lewat ?pegawai=<id>: bisa dibagikan, tombol Back menutup panel. */
export function useEmployeeSheet() {
  const [params, setParams] = useSearchParams();
  const openId = params.get(PARAM);
  return {
    openId,
    open: (id: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set(PARAM, id);
        return next;
      }),
    close: () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(PARAM);
          return next;
        },
        { replace: true },
      ),
  };
}

export function EmployeeDetailSheet({
  onEdit,
}: {
  /** Tombol "Ubah data" (hanya halaman yang punya form). */
  onEdit?: (employee: EmployeeDetail) => void;
}) {
  const { openId, close } = useEmployeeSheet();
  const detail = useEmployee(openId);
  const employee = detail.data;

  return (
    <Sheet open={openId !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent className="sm:max-w-2xl" aria-describedby={undefined}>
        {detail.isPending ? (
          <DetailSkeleton />
        ) : detail.isError || !employee ? (
          <div className="p-6">
            <SheetTitle className="sr-only">Detail pegawai</SheetTitle>
            <EmptyState
              icon={CircleUser}
              title="Data pegawai tidak dapat ditampilkan"
              description={errorMessage(detail.error)}
            />
          </div>
        ) : (
          <DetailBody key={employee.id} employee={employee} onEdit={onEdit} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <SheetTitle className="sr-only">Memuat detail pegawai</SheetTitle>
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}

function DetailBody({
  employee,
  onEdit,
}: {
  employee: EmployeeDetail;
  onEdit?: ((employee: EmployeeDetail) => void) | undefined;
}) {
  const { access } = employee;
  const [tab, setTab] = useState("work");
  // Data sensitif diambil hanya saat tabnya dibuka (dan hanya bila berhak).
  const wantsSensitive =
    (["personal", "family"].includes(tab) && access.personal) || (tab === "bank" && access.bank);
  const full = useEmployee(employee.id, "full", wantsSensitive);
  const sensitive = full.data;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-6 pt-6 pb-5">
        <div className="flex items-start gap-4 pr-8">
          <EmployeeAvatar name={employee.fullName} size="xl" inactive={!employee.isActive} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SheetTitle className="truncate text-xl">{employee.fullName}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-xs">{employee.employeeNumber}</span>
              <span aria-hidden>·</span>
              <span>{employee.position.name}</span>
              {employee.department ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{employee.department.name}</span>
                </>
              ) : null}
            </SheetDescription>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StatusBadge
                name={employee.employmentStatus.name}
                category={employee.employmentStatus.category}
              />
              <ActiveDot active={employee.isActive} />
              <ExitReasonBadge reason={employee.exitReason} />
            </div>
          </div>
        </div>
        {access.manage ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {employee.isActive ? (
              <>
                {onEdit ? (
                  <Button size="sm" variant="outline" onClick={() => onEdit(employee)}>
                    <Pencil /> Ubah data
                  </Button>
                ) : null}
                {FEATURES.changeStatus ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/personal/ubah-status?pegawai=${employee.id}`}>
                      <ArrowLeftRight /> Ubah status
                    </Link>
                  </Button>
                ) : null}
                {FEATURES.changeStatus && access.deactivate ? (
                  <Button size="sm" variant="ghost" className="text-destructive" asChild>
                    <Link to={`/personal/ubah-status?pegawai=${employee.id}&aksi=nonaktif`}>
                      <Power /> Nonaktifkan
                    </Link>
                  </Button>
                ) : null}
              </>
            ) : FEATURES.activation ? (
              <Button size="sm" variant="brand" asChild>
                <Link to={`/personal/pengaktifan?pegawai=${employee.id}`}>
                  <RotateCcw /> Aktifkan kembali
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <TabsList className="px-6">
          <TabsTrigger value="work">
            <BriefcaseBusiness /> Kepegawaian
          </TabsTrigger>
          <TabsTrigger value="personal">
            <CircleUser /> Pribadi
          </TabsTrigger>
          <TabsTrigger value="family">
            <HeartHandshake /> Keluarga
          </TabsTrigger>
          <TabsTrigger value="education">
            <GraduationCap /> Pendidikan
          </TabsTrigger>
          <TabsTrigger value="bank">
            <Landmark /> Rekening
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> Riwayat
          </TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <TabsContent value="work">
            <WorkTab employee={employee} />
          </TabsContent>
          <TabsContent value="personal">
            <SensitiveGate allowed={access.personal} what="Data pribadi" query={full}>
              {sensitive ? <PersonalTab employee={sensitive} /> : null}
            </SensitiveGate>
          </TabsContent>
          <TabsContent value="family">
            <SensitiveGate allowed={access.personal} what="Data keluarga" query={full}>
              {sensitive ? <FamilyTab employee={sensitive} /> : null}
            </SensitiveGate>
          </TabsContent>
          <TabsContent value="education">
            <EducationTab employee={employee} />
          </TabsContent>
          <TabsContent value="bank">
            <SensitiveGate allowed={access.bank} what="Rekening bank" query={full}>
              {sensitive ? <BankTab employee={sensitive} /> : null}
            </SensitiveGate>
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab employee={employee} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn("text-sm font-medium break-words", mono && "font-mono text-[13px]")}>
        {children === null || children === undefined || children === "" ? (
          <span className="text-muted-foreground font-normal">—</span>
        ) : (
          children
        )}
      </dd>
    </div>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">{children}</dl>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-muted-foreground mb-4 text-[11px] font-medium tracking-wider uppercase">
      {children}
    </h3>
  );
}

function WorkTab({ employee }: { employee: EmployeeDetail }) {
  return (
    <div className="space-y-8">
      <section>
        <SectionTitle>Penempatan</SectionTitle>
        <FieldGrid>
          <Field label="Jabatan">{employee.position.name}</Field>
          <Field label="Departemen">{employee.department?.name}</Field>
          <Field label="Grade">{employee.grade?.name}</Field>
          <Field label="Lokasi kerja">{employee.workLocation?.name}</Field>
          <Field label="Atasan langsung">{employee.manager?.name}</Field>
          <Field label="Status kepegawaian">{employee.employmentStatus.name}</Field>
          <Field label="Tanggal masuk">{formatDate(employee.joinDate)}</Field>
          <Field label="Masa kerja">{tenure(employee.joinDate, employee.endDate)}</Field>
          {!employee.isActive ? (
            <>
              <Field label="Tanggal keluar">{formatDate(employee.endDate)}</Field>
              <Field label="Alasan keluar">
                {employee.exitReason ? EXIT_REASON_LABELS[employee.exitReason] : null}
              </Field>
            </>
          ) : null}
        </FieldGrid>
      </section>
      <section>
        <SectionTitle>Kontak kerja</SectionTitle>
        <FieldGrid>
          <Field label="Email kantor">{employee.workEmail}</Field>
          <Field label="No. HP" mono>
            {employee.phoneNumber}
          </Field>
          <Field label="Kontak darurat" mono>
            {employee.emergencyPhone}
          </Field>
          <Field label="Jenis kelamin">
            {employee.gender ? GENDER_LABELS[employee.gender] : null}
          </Field>
          <Field label="Akun HRIS">
            {employee.account
              ? `${ROLE_LABELS[employee.account.role]} · ${employee.account.isActive ? "aktif" : "nonaktif"}`
              : "Belum punya akun"}
          </Field>
        </FieldGrid>
      </section>
    </div>
  );
}

function SensitiveGate({
  allowed,
  what,
  query,
  children,
}: {
  allowed: boolean;
  what: string;
  query: { isPending: boolean; isError: boolean; error: unknown };
  children: ReactNode;
}) {
  if (!allowed) return <Locked what={what} />;
  if (query.isError)
    return <EmptyState icon={Lock} title="Gagal memuat" description={errorMessage(query.error)} />;
  if (query.isPending)
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground bg-warning-soft/60 flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
        <Lock className="text-warning size-3.5 shrink-0" aria-hidden />
        Data sensitif. Akses Anda ke bagian ini tercatat di audit log.
      </p>
      {children}
    </div>
  );
}

function Locked({ what }: { what: string }) {
  return (
    <EmptyState
      icon={Lock}
      title={`${what} dilindungi`}
      description="Data ini sensitif. Hanya Super Admin atau akun yang diberi grant izin yang dapat melihatnya. Setiap akses tercatat di audit log."
    />
  );
}

function PersonalTab({ employee }: { employee: EmployeeDetail }) {
  if (!employee.access.personal || employee.personal === undefined)
    return <Locked what="Data pribadi" />;
  const p = employee.personal;
  if (!p) return <EmptyState icon={CircleUser} title="Data pribadi belum diisi" />;
  return (
    <FieldGrid>
      <Field label="NIK KTP" mono>
        {p.ktpNumber}
      </Field>
      <Field label="NPWP" mono>
        {p.npwpNumber}
      </Field>
      <Field label="No. KK" mono>
        {p.kkNumber}
      </Field>
      <Field label="Tempat, tanggal lahir">
        {[p.birthPlace, p.birthDate ? formatDate(p.birthDate) : null].filter(Boolean).join(", ")}
      </Field>
      <Field label="Status pernikahan">
        {p.maritalStatus ? MARITAL_LABELS[p.maritalStatus] : null}
      </Field>
      <Field label="Agama">{p.religion ? RELIGION_LABELS[p.religion] : null}</Field>
      <Field label="Alamat KTP">{p.ktpAddress}</Field>
      <Field label="Alamat domisili">{p.domicileAddress}</Field>
    </FieldGrid>
  );
}

function FamilyTab({ employee }: { employee: EmployeeDetail }) {
  if (!employee.access.personal || !employee.familyMembers) return <Locked what="Data keluarga" />;
  if (employee.familyMembers.length === 0)
    return <EmptyState icon={HeartHandshake} title="Belum ada data keluarga" />;
  return (
    <ul className="divide-y rounded-xl border">
      {employee.familyMembers.map((member) => (
        <li key={member.id} className="flex items-center gap-3 px-4 py-3">
          <EmployeeAvatar name={member.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{member.name}</p>
            <p className="text-muted-foreground text-xs">
              {RELATIONSHIP_LABELS[member.relationship] ?? member.relationship}
              {member.birthDate ? ` · lahir ${formatDate(member.birthDate)}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EducationTab({ employee }: { employee: EmployeeDetail }) {
  return (
    <div className="space-y-8">
      <section>
        <SectionTitle>Pendidikan</SectionTitle>
        {employee.educations.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada data pendidikan.</p>
        ) : (
          <ul className="space-y-3">
            {employee.educations.map((edu) => (
              <li key={edu.id} className="flex items-start gap-3">
                <span className="bg-muted text-muted-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
                  <GraduationCap className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium">{edu.schoolName}</p>
                  <p className="text-muted-foreground text-xs">
                    {[edu.major, edu.graduationYear ? `Lulus ${edu.graduationYear}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <SectionTitle>Pelatihan</SectionTitle>
        {employee.trainings.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada data pelatihan.</p>
        ) : (
          <ul className="space-y-3">
            {employee.trainings.map((training) => (
              <li key={training.id} className="flex items-start gap-3">
                <span className="bg-muted text-muted-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
                  <Award className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium">{training.trainingField}</p>
                  <p className="text-muted-foreground text-xs">
                    {[training.organizer, training.duration, training.trainingYear]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BankTab({ employee }: { employee: EmployeeDetail }) {
  if (!employee.access.bank || employee.bankAccount === undefined)
    return <Locked what="Rekening bank" />;
  const bank = employee.bankAccount;
  if (!bank) return <EmptyState icon={Landmark} title="Rekening belum diisi" />;
  return (
    <div className="bg-card relative overflow-hidden rounded-2xl border p-6">
      <div className="bg-brand/5 absolute -top-16 -right-16 size-48 rounded-full" aria-hidden />
      <p className="text-muted-foreground text-xs">{bank.bankName}</p>
      <p className="mt-3 font-mono text-xl tracking-wider">{bank.accountNumber}</p>
      <p className="text-muted-foreground mt-4 text-xs">Atas nama</p>
      <p className="text-sm font-medium">{bank.accountHolder ?? "—"}</p>
    </div>
  );
}

const HISTORY_ICON: Record<EmploymentChangeType, typeof History> = {
  HIRED: UserRoundCheck,
  STATUS_CHANGED: ArrowLeftRight,
  POSITION_CHANGED: BriefcaseBusiness,
  DEACTIVATED: Power,
  REACTIVATED: RotateCcw,
};

function HistoryTab({ employee }: { employee: EmployeeDetail }) {
  if (employee.histories.length === 0)
    return <EmptyState icon={History} title="Belum ada riwayat kepegawaian" />;
  return (
    <ol className="relative space-y-6 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
      {employee.histories.map((h) => {
        const Icon = HISTORY_ICON[h.changeType];
        const detail =
          h.changeType === "STATUS_CHANGED"
            ? `${h.fromStatus?.name ?? "—"} → ${h.toStatus?.name ?? "—"}`
            : h.changeType === "POSITION_CHANGED"
              ? `${h.fromPosition?.name ?? "—"} → ${h.toPosition?.name ?? "—"}`
              : h.changeType === "DEACTIVATED"
                ? h.exitReason
                  ? EXIT_REASON_LABELS[h.exitReason]
                  : null
                : h.changeType === "HIRED"
                  ? [h.toPosition?.name, h.toStatus?.name].filter(Boolean).join(" · ")
                  : h.toStatus?.name;
        return (
          <li key={h.id} className="relative flex gap-4">
            <span
              className={cn(
                "bg-background relative grid size-8 shrink-0 place-items-center rounded-full border",
                h.changeType === "DEACTIVATED" && "text-destructive",
                h.changeType === "REACTIVATED" && "text-success",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium">{EMPLOYMENT_CHANGE_LABELS[h.changeType]}</p>
              {detail ? <p className="text-sm">{detail}</p> : null}
              <p className="text-muted-foreground mt-0.5 text-xs">
                Efektif {formatDate(h.effectiveDate)}
              </p>
              {h.note ? (
                <p className="text-muted-foreground bg-muted/60 mt-2 rounded-lg px-3 py-2 text-xs">
                  {h.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
