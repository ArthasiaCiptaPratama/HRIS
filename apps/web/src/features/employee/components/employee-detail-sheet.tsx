import {
  DRIVING_LICENSE_LABELS,
  type DrivingLicenseType,
  EMPLOYMENT_CHANGE_LABELS,
  type EmploymentChangeType,
  EXIT_REASON_LABELS,
  FIELD_CHANGE_FIELD_LABELS,
  FIELD_CHANGE_SECTION_LABELS,
  FIELD_CHANGE_SOURCE_LABELS,
  type FieldChangeSection,
  GENDER_LABELS,
  MOVEMENT_TYPE_LABELS,
  PTKP_LABELS,
  ROLE_LABELS,
} from "@hris/shared";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarX2,
  CircleUser,
  FolderArchive,
  GraduationCap,
  HeartHandshake,
  History,
  Landmark,
  Lock,
  Package,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  ShieldAlert,
  UserRoundCheck,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { FEATURES, tmOn } from "@/app/feature-flags";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DECREE_CODES,
  EducationSection,
  TrainingSection,
  usePositionHistoryEditor,
  WorkExperienceSection,
} from "@/features/archive/components/archive-sections";
import { EmployeeAssetsTab } from "@/features/assets/components/holdings";
import { useMe } from "@/features/auth/api";
import { EmployeeWarningLettersTab } from "@/features/discipline/components/letter-list";
import {
  AttachmentList,
  BankBookPanel,
  DocumentsTab,
} from "@/features/documents/components/documents-tab";
import { EmployeeAttendanceRecord } from "@/features/time-management/components/attendance-record";
import { access as appAccess } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useEmployee, useEmployeeFieldChanges, useMasterData } from "../api";
import { MARITAL_LABELS, RELATIONSHIP_LABELS, RELIGION_LABELS, tenure } from "../labels";
import type { EmployeeDetail, EmployeeFieldChange, EmployeeHomebaseEntry } from "../schemas";
import { EmployeeAvatar } from "./employee-avatar";
import { EmployeeFormDialog } from "./employee-form-dialog";
import { useHomebaseEditor } from "./employee-homebase-editor";
import { EmployeePhotoControl } from "./employee-photo-control";
import { PrintEmployeeButton } from "./print-employee-button";
import { profilePlacement } from "./profile-placement";

const PARAM = "pegawai";
/** Kolom isi detail: lebar baca terbatas & di tengah layar. */
const CONTAINER = "mx-auto w-full max-w-5xl px-4 sm:px-8";

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
  /** Tombol "Ubah data" memakai form halaman ini; tanpa prop → form bawaan panel (EMP-D4, semua halaman). */
  onEdit?: (employee: EmployeeDetail) => void;
}) {
  const { openId, close } = useEmployeeSheet();
  const detail = useEmployee(openId);
  const employee = detail.data;
  const [editing, setEditing] = useState<EmployeeDetail | null>(null);
  const edit = onEdit ?? setEditing;

  return (
    <Sheet open={openId !== null} onOpenChange={(open) => !open && close()}>
      {/* Layar penuh: isi dipusatkan dengan lebar baca terbatas supaya tetap nyaman di layar lebar. */}
      <SheetContent className="border-l-0 sm:max-w-none" aria-describedby={undefined} hideClose>
        {/* Panel layar penuh terasa seperti halaman: tombol kembali di kiri atas (Esc juga menutup). */}
        <SheetClose asChild>
          <Button
            size="sm"
            variant="ghost"
            className="bg-background/80 text-foreground hover:bg-accent absolute top-1 left-3 z-20 font-semibold lg:top-4 lg:left-4"
          >
            <ArrowLeft strokeWidth={2.5} /> Kembali
          </Button>
        </SheetClose>
        {detail.isPending ? (
          <DetailSkeleton />
        ) : detail.isError || !employee ? (
          <div className="p-6 pt-16">
            <SheetTitle className="sr-only">Detail karyawan</SheetTitle>
            <EmptyState
              icon={CircleUser}
              title="Data karyawan tidak dapat ditampilkan"
              description={errorMessage(detail.error)}
            />
          </div>
        ) : (
          <DetailBody key={employee.id} employee={employee} onEdit={edit} />
        )}
      </SheetContent>
      {onEdit ? null : (
        <EmployeeFormDialog
          open={editing !== null}
          onOpenChange={(open) => (open ? null : setEditing(null))}
          employee={editing}
        />
      )}
    </Sheet>
  );
}

function DetailSkeleton() {
  return (
    <div className={cn(CONTAINER, "space-y-8 py-10")}>
      <SheetTitle className="sr-only">Memuat detail karyawan</SheetTitle>
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="size-24 rounded-full sm:size-28" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 8 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}

/** Template profil (permintaan pemilik projek 2026-10-15): pas foto + "Label : nilai" dua kolom. */
function ProfileHeader({ employee, actions }: { employee: EmployeeDetail; actions?: ReactNode }) {
  const master = useMasterData();
  const placement = profilePlacement(employee, master.data);
  return (
    // Kartu header di atas pita banner warna logo (2026-10-15); susunan foto | 2 kolom | aksi tetap.
    <div className="bg-card relative rounded-xl border p-5 shadow-sm sm:p-6">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <EmployeePhotoControl
          employeeId={employee.id}
          name={employee.fullName}
          photoUrl={employee.photoUrl}
          inactive={!employee.isActive}
          canEdit={employee.access.photo}
          toastPosition="bottom-center"
          shape="portrait"
          zoomable
          subtitle={employee.employeeNumber}
          className="shrink-0 sm:-mt-14"
        />
        {/* Tombol aksi sejajar dengan kolom info (bukan di bawah foto). */}
        <div className="w-full min-w-0 flex-1">
          <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
            <dl className="space-y-2.5">
              <ProfileRow label="Nama Karyawan">
                <SheetTitle className="text-logo-green dark:text-foreground text-lg leading-snug font-semibold break-words">
                  {employee.fullName}
                </SheetTitle>
              </ProfileRow>
              <ProfileRow label="Nomor Induk Pegawai">
                {employee.employeeNumber ? (
                  <span className="bg-muted rounded-md px-1.5 py-0.5 font-mono text-[13px]">
                    {employee.employeeNumber}
                  </span>
                ) : null}
              </ProfileRow>
              <ProfileRow label="Jabatan">{employee.position.name}</ProfileRow>
              <ProfileRow label="Divisi">{placement.division}</ProfileRow>
              <ProfileRow label="Departemen">{placement.department}</ProfileRow>
            </dl>
            <dl className="space-y-2.5">
              <ProfileRow label="Level" narrow>
                {placement.level}
              </ProfileRow>
              <ProfileRow label="Tanggal Masuk" narrow>
                {formatDate(employee.joinDate)}
              </ProfileRow>
              <ProfileRow label="Masa Kerja" narrow>
                {tenure(employee.joinDate, employee.endDate)}
              </ProfileRow>
              {/* Dipisah (2026-10-15): masih bekerja di perusahaan ≠ bisa login ke aplikasi. */}
              <ProfileRow label="Status Karyawan" narrow>
                {/* Teks rapi "kategori | masih bekerja/sudah keluar" (masukan pemilik projek 2026-10-15). */}
                <span>
                  {employee.employmentStatus.name}
                  <span aria-hidden className="text-muted-foreground mx-2 font-normal">
                    |
                  </span>
                  {employee.isActive ? (
                    "Masih bekerja"
                  ) : (
                    <span className="text-muted-foreground">
                      Sudah keluar
                      {employee.exitReason ? ` · ${EXIT_REASON_LABELS[employee.exitReason]}` : ""}
                    </span>
                  )}
                </span>
              </ProfileRow>
              <ProfileRow label="Akses Aplikasi" narrow>
                <AccountStatus account={employee.account} />
              </ProfileRow>
            </dl>
          </div>
          {actions ? (
            <div className="mt-5 flex flex-wrap justify-center gap-2 border-t pt-4 sm:justify-start">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
      <SheetDescription className="sr-only">
        {[employee.employeeNumber, employee.position.name, employee.department?.name]
          .filter(Boolean)
          .join(" · ")}
      </SheetDescription>
    </div>
  );
}

/**
 * Akses aplikasi: Bisa login / Tidak bisa login (teks, tanpa titik). Sebabnya (belum punya akun / akun
 * dinonaktifkan) di tooltip; rincian & peran akun di tab Kepegawaian › Akun login.
 */
function AccountStatus({ account }: { account: EmployeeDetail["account"] }) {
  if (account?.isActive) return <span>Bisa login</span>;
  return (
    <span
      className="text-muted-foreground"
      title={account ? "Akun login dinonaktifkan" : "Belum punya akun login"}
    >
      Tidak bisa login
    </span>
  );
}

/** Tetesan api (bentuk dari logo Arthasia) untuk pola banner; titik pusat (x, y), skala, putaran. */
const FLAMES: {
  x: number;
  y: number;
  s: number;
  r: number;
  o: number;
  fill: boolean;
  /** Api tengah: disembunyikan di layar < sm (SVG terpotong ke tengah → jatuh di belakang teks). */
  mid?: boolean;
}[] = [
  // Ruang kosong tengah-atas (di atas kartu, jauh dari teks banner di kanan).
  { mid: true, x: 520, y: 34, s: 0.5, r: -14, o: 0.55, fill: true },
  { mid: true, x: 610, y: 58, s: 0.3, r: 20, o: 0.45, fill: false },
  { mid: true, x: 705, y: 26, s: 0.38, r: 8, o: 0.4, fill: false },
  { mid: true, x: 800, y: 52, s: 0.6, r: -6, o: 0.5, fill: true },
  { mid: true, x: 905, y: 30, s: 0.28, r: 28, o: 0.4, fill: false },
  // Tepi kanan (di luar kolom teks) & kiri.
  { x: 1300, y: 40, s: 0.45, r: 14, o: 0.45, fill: false },
  { x: 1380, y: 92, s: 0.7, r: -10, o: 0.4, fill: true },
  { x: 150, y: 96, s: 0.32, r: -26, o: 0.35, fill: false },
  { x: 60, y: 40, s: 0.26, r: 16, o: 0.3, fill: true },
];
/** Tetesan api: lengkung bawah bulat, ujung atas meruncing ke kanan (siluet api logo). */
const FLAME_PATH =
  "M0 -26 C10 -14 18 -4 18 8 C18 20 9 28 0 28 C-9 28 -18 20 -18 8 C-18 -6 -6 -14 0 -26 Z";

/**
 * Pita banner warna logo Arthasia di atas kartu header (2026-10-15). Pola dari logo: garis cakrawala
 * hijau daun, tetesan api oranye, tekstur titik, watermark logo. Blok warna solid tanpa gradien (D-035),
 * statis tanpa animasi (permintaan pemilik projek).
 */
function ProfileBanner({ companyName }: { companyName: string | null }) {
  return (
    <div className="bg-logo-green text-logo-green-foreground relative h-32 overflow-hidden">
      <svg
        aria-hidden
        className="absolute inset-0 size-full"
        viewBox="0 0 1440 128"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id="profile-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" className="fill-logo-green-foreground" opacity="0.09" />
          </pattern>
        </defs>
        <rect width="1440" height="128" fill="url(#profile-dots)" />
        {/* Watermark logo: mangkuk hijau daun + api oranye, besar & samar di kanan. */}
        <g transform="translate(1385 78)" opacity="0.14">
          <path d="M-70 4 A70 70 0 0 0 70 4 Z" className="fill-logo-leaf" />
          <path
            d="M-66 -2 C-66 -60 -20 -84 6 -112 C10 -96 22 -86 14 -70 L28 -84 L36 -74 L24 -58 L46 -74 C64 -52 70 -30 66 -2 Z"
            className="fill-logo-orange"
          />
        </g>
        {/* Garis cakrawala seperti sapuan hijau di logo. */}
        <path
          d="M-20 96 C 260 70, 520 112, 760 92 S 1180 58, 1460 78"
          className="stroke-logo-leaf"
          strokeWidth="2.5"
          fill="none"
          opacity="0.55"
        />
        <path
          d="M-20 110 C 300 92, 560 124, 820 106 S 1220 80, 1460 96"
          className="stroke-logo-leaf"
          strokeWidth="1.2"
          fill="none"
          opacity="0.3"
        />
        <g>
          {FLAMES.map((f) => (
            <path
              key={`${f.x}-${f.y}`}
              d={FLAME_PATH}
              transform={`translate(${f.x} ${f.y}) rotate(${f.r}) scale(${f.s})`}
              fill={f.fill ? undefined : "none"}
              strokeWidth={f.fill ? undefined : 2.5 / f.s}
              opacity={f.o}
              className={cn(
                f.fill ? "fill-logo-orange" : "stroke-logo-orange",
                f.mid && "max-sm:hidden",
              )}
            />
          ))}
        </g>
      </svg>
      <div className={cn(CONTAINER, "relative flex h-full items-start justify-end pt-4")}>
        <div className="text-right">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase opacity-80">
            Profil Karyawan
          </p>
          {companyName ? <p className="text-sm font-medium">{companyName}</p> : null}
          <p className="text-logo-orange text-xs font-medium tracking-wide">
            energy for the future
          </p>
        </div>
      </div>
      <div className="bg-logo-orange absolute inset-x-0 bottom-0 h-1" />
    </div>
  );
}

function ProfileRow({
  label,
  mono,
  narrow,
  children,
}: {
  label: string;
  mono?: boolean;
  /** Kolom kanan: label lebih pendek → kolom nilai lebih lebar (badge + keterangan satu baris). */
  narrow?: boolean;
  children: ReactNode;
}) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div
      className={cn(
        "grid items-baseline text-sm",
        narrow ? "grid-cols-[7.5rem_0.75rem_1fr]" : "grid-cols-[9.5rem_0.75rem_1fr]",
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <span aria-hidden className="text-muted-foreground">
        :
      </span>
      <dd className={cn("min-w-0 font-medium break-words", mono && "font-mono text-[13px]")}>
        {empty ? <span className="text-muted-foreground font-normal">—</span> : children}
      </dd>
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
  const me = useMe().data;
  // ARS-D13: tab SP untuk SA, HR ber-grant SP, MANAGER (API membatasi ke tim).
  const canSeeWarningLetters = me ? appAccess.viewWarningLetters(me) : false;
  // IAM-D1: HR Kepegawaian hanya tab Kepegawaian & Riwayat (data dirinya sendiri tetap lengkap).
  const workOnly = me ? appAccess.employmentOnly(me) && me.employeeId !== employee.id : false;
  // D-054: menu Arsip membuka detail langsung di tab terkait (?tab=education|history).
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => params.get("tab") ?? "work");
  // Data sensitif diambil hanya saat tabnya dibuka (dan hanya bila berhak).
  const wantsSensitive =
    (["personal", "family"].includes(tab) && access.personal) || (tab === "bank" && access.bank);
  const full = useEmployee(employee.id, "full", wantsSensitive);
  const sensitive = full.data;
  return (
    // Satu area gulir: header ikut tergulir, baris tab menempel di atas (sticky).
    <div className="h-full min-h-0 overflow-y-auto">
      <ProfileBanner companyName={employee.company.name} />
      <header className={cn(CONTAINER, "-mt-12 pb-6")}>
        <ProfileHeader
          employee={employee}
          actions={
            access.manage || access.print ? (
              <>
                {access.manage && employee.isActive ? (
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
                  </>
                ) : null}
                {access.print ? (
                  <PrintEmployeeButton
                    employeeId={employee.id}
                    photoUrl={employee.photoUrl}
                    canViewPersonal={access.personal}
                  />
                ) : null}
                {access.manage &&
                employee.isActive &&
                FEATURES.changeStatus &&
                access.deactivate ? (
                  <Button size="sm" variant="ghost" className="text-destructive" asChild>
                    <Link to={`/personal/ubah-status?pegawai=${employee.id}&aksi=nonaktif`}>
                      <Power /> Nonaktifkan
                    </Link>
                  </Button>
                ) : null}
                {access.manage && !employee.isActive && FEATURES.activation ? (
                  <Button size="sm" variant="brand" asChild>
                    <Link to={`/personal/pengaktifan?pegawai=${employee.id}`}>
                      <RotateCcw /> Aktifkan kembali
                    </Link>
                  </Button>
                ) : null}
              </>
            ) : null
          }
        />
      </header>

      <Tabs value={tab} onValueChange={setTab} className="gap-0">
        {/* pl-28 di bawah lg: ruang untuk tombol "Kembali" yang melayang di pojok kiri atas. */}
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 border-b pl-28 backdrop-blur lg:pl-0">
          <TabsList
            className={cn(
              CONTAINER,
              "justify-center-safe border-b-0 [&_[data-state=active]]:after:bg-logo-leaf",
            )}
          >
            <TabsTrigger value="work">
              <BriefcaseBusiness /> Kepegawaian
            </TabsTrigger>
            {workOnly ? null : (
              <>
                <TabsTrigger value="personal">
                  <CircleUser /> Pribadi
                </TabsTrigger>
                <TabsTrigger value="family">
                  <HeartHandshake /> Keluarga
                </TabsTrigger>
                <TabsTrigger value="education">
                  <GraduationCap /> Pendidikan
                </TabsTrigger>
                <TabsTrigger value="documents">
                  <FolderArchive /> Dokumen
                </TabsTrigger>
                {FEATURES.assets ? (
                  <TabsTrigger value="assets">
                    <Package /> Aset
                  </TabsTrigger>
                ) : null}
                {FEATURES.discipline && canSeeWarningLetters ? (
                  <TabsTrigger value="warnings">
                    <ShieldAlert /> SP
                  </TabsTrigger>
                ) : null}
                {tmOn("tmAttendanceDays") ? (
                  <TabsTrigger value="attendance">
                    <CalendarX2 /> Absensi
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="bank">
                  <Landmark /> Rekening
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="history">
              <History /> Riwayat
            </TabsTrigger>
          </TabsList>
        </div>
        <div className={cn(CONTAINER, "py-8 pb-16")}>
          <TabsContent value="work">
            <WorkTab employee={employee} />
          </TabsContent>
          {workOnly ? null : (
            <>
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
              <TabsContent value="documents">
                <DocumentsTab employeeId={employee.id} />
              </TabsContent>
              {FEATURES.assets ? (
                <TabsContent value="assets">
                  {/* ARS-D3: aset & APD yang dipegang (cakupan dicek API; tanpa harga). */}
                  <EmployeeAssetsTab employeeId={employee.id} />
                </TabsContent>
              ) : null}
              {FEATURES.discipline && canSeeWarningLetters ? (
                <TabsContent value="warnings">
                  {/* ARS-D13: SP karyawan (SA, HR ber-grant SP, MANAGER tim; cakupan dicek API). */}
                  <EmployeeWarningLettersTab employeeId={employee.id} />
                </TabsContent>
              ) : null}
              {tmOn("tmAttendanceDays") ? (
                <TabsContent value="attendance">
                  {/* TM-D3: rekam jejak Alpha & koreksi (SA, HR PT, atasan tim, karyawan sendiri; dicek API). */}
                  {tab === "attendance" ? (
                    <EmployeeAttendanceRecord employeeId={employee.id} />
                  ) : null}
                </TabsContent>
              ) : null}
              <TabsContent value="bank">
                <SensitiveGate allowed={access.bank} what="Rekening bank" query={full}>
                  {sensitive ? <BankTab employee={sensitive} /> : null}
                </SensitiveGate>
              </TabsContent>
            </>
          )}
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
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
  );
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
          <Field label="Perusahaan">
            {employee.company.code} · {employee.company.name}
          </Field>
          <Field label="Jabatan">{employee.position.name}</Field>
          <Field label="Unit organisasi">{employee.department?.name}</Field>
          <Field label="Grade">{employee.grade?.name}</Field>
          <Field label="Lokasi kerja">{employee.workLocation?.name}</Field>
          {/* EMP-D6: hanya homebase yang berlaku sekarang; diubah lewat Ubah data, riwayatnya di tab Riwayat. */}
          <Field label="Homebase (POH)">{employee.homebase?.name}</Field>
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
          <Field label="Kontak darurat">
            {[
              employee.emergencyContactName,
              employee.emergencyContactRelationship
                ? `(${employee.emergencyContactRelationship})`
                : null,
            ]
              .filter(Boolean)
              .join(" ") || null}
            {employee.emergencyPhone ? (
              <span className="block font-mono">{employee.emergencyPhone}</span>
            ) : null}
          </Field>
          <Field label="Jenis kelamin">
            {employee.gender ? GENDER_LABELS[employee.gender] : null}
          </Field>
          <Field label="Akun login">
            {employee.account
              ? `${ROLE_LABELS[employee.account.role]} · ${employee.account.isActive ? "aktif" : "nonaktif"}`
              : "Belum punya akun"}
          </Field>
        </FieldGrid>
      </section>
    </div>
  );
}

/** EMP-D6: riwayat homebase ringkas di tab Riwayat (terbaru dulu, maks. 20 dari detail); kosong = disembunyikan. */
function HomebaseHistory({
  employee,
  menu,
}: {
  employee: EmployeeDetail;
  menu: (entry: EmployeeHomebaseEntry) => ReactNode;
}) {
  const entries = employee.homebases ?? [];
  if (!entries.length) return null;
  return (
    <section aria-labelledby="homebase-history-title" className="mb-8 rounded-lg border">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h4 id="homebase-history-title" className="text-sm font-medium">
          Riwayat homebase
        </h4>
        <span className="text-muted-foreground text-xs tabular-nums">{entries.length} entri</span>
      </div>
      <ul className="divide-y">
        {entries.map((entry, index) => (
          <li key={entry.id} className="flex items-start gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span className="font-medium">{entry.homebase.name}</span>
                {index === 0 ? (
                  <span className="bg-brand-soft text-brand-soft-foreground rounded-md px-1.5 py-0.5 text-[11px]">
                    Sekarang
                  </span>
                ) : null}
              </p>
              <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-1.5 text-xs">
                <span>Berlaku mulai {formatDate(entry.effectiveFrom)}</span>
                {entry.decreeNumber ? <span>· No. SK {entry.decreeNumber}</span> : null}
                {entry.changedBy ? (
                  <span title={entry.changedBy.workLocation ?? "Lokasi kerja belum diisi"}>
                    · <span className="text-foreground/80 font-medium">{entry.changedBy.name}</span>
                  </span>
                ) : (
                  <span>· sistem (data awal/impor)</span>
                )}
              </p>
              {entry.note ? (
                <p className="text-muted-foreground border-border mt-1.5 border-l-2 pl-3 text-xs">
                  {entry.note}
                </p>
              ) : null}
            </div>
            {menu(entry)}
          </li>
        ))}
      </ul>
    </section>
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
      <Field label="Alamat KTP">
        {addressText(p.ktpAddress, [p.ktpVillage, p.ktpDistrict, p.ktpCity, p.ktpProvince])}
      </Field>
      <Field label="Alamat domisili">
        {addressText(p.domicileAddress, [
          p.domicileVillage,
          p.domicileDistrict,
          p.domicileCity,
          p.domicileProvince,
        ])}
      </Field>
      <Field label="Kota asal">{p.originCity}</Field>
      <Field label="Status PTKP">{p.ptkpStatus ? PTKP_LABELS[p.ptkpStatus] : null}</Field>
      <Field label="BPJS Ketenagakerjaan" mono>
        {p.bpjsEmploymentNumber}
      </Field>
      <Field label="BPJS Kesehatan" mono>
        {p.bpjsHealthNumber}
      </Field>
      {/* D-059: Formulir Data Karyawan (Google Form → Import). */}
      <Field label="Email pribadi">{p.personalEmail ?? null}</Field>
      <Field label="Nama panggilan">{p.nickname ?? null}</Field>
      <Field label="Kebangsaan">{p.nationality ?? null}</Field>
      <Field label="Suku">{p.ethnicity ?? null}</Field>
      <Field label="Golongan darah">{p.bloodType ?? null}</Field>
      <Field label="SIM" mono>
        {drivingLicenseText(p.drivingLicenseTypes, p.drivingLicenseNumbers, p.drivingLicenseNumber)}
      </Field>
      <Field label="Alamat kontak darurat">{p.emergencyContactAddress ?? null}</Field>
      {/* D-061: kontak darurat ke-2 (Form versi baru). */}
      <Field label="Kontak darurat 2">
        {[
          p.emergencyContact2Name,
          p.emergencyContact2Relationship ? `(${p.emergencyContact2Relationship})` : null,
          p.emergencyContact2Phone,
        ]
          .filter(Boolean)
          .join(" ") || null}
      </Field>
      <Field label="Alamat kontak darurat 2">{p.emergencyContact2Address ?? null}</Field>
    </FieldGrid>
  );
}

/** D-061: alamat jalan + rincian wilayah (kelurahan, kecamatan, kab/kota, provinsi) bila ada. */
function addressText(
  street: string | null | undefined,
  parts: (string | null | undefined)[],
): string | null {
  return [street, ...parts].filter(Boolean).join(", ") || null;
}

/** "A: 1234 · C: 5678"; jenis tanpa nomor tetap ditampilkan. */
function drivingLicenseText(
  types: string[] | undefined,
  numbers: Record<string, string> | null | undefined,
  single: string | null | undefined,
): string | null {
  const all = [...new Set([...(types ?? []), ...Object.keys(numbers ?? {})])];
  if (all.length === 0) return single ?? null;
  return all
    .map((t) => {
      const label = DRIVING_LICENSE_LABELS[t as DrivingLicenseType] ?? t;
      return numbers?.[t] ? `${label}: ${numbers[t]}` : label;
    })
    .join(" · ");
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
            <p className="truncate text-sm font-medium">
              {member.name}
              {member.isDeceased ? (
                <span className="text-muted-foreground font-normal"> (almarhum)</span>
              ) : null}
            </p>
            <p className="text-muted-foreground text-xs">
              {[
                [
                  RELATIONSHIP_LABELS[member.relationship] ?? member.relationship,
                  member.relationDetail ? `(${member.relationDetail})` : null,
                ]
                  .filter(Boolean)
                  .join(" "),
                member.gender === "MALE"
                  ? "Laki-laki"
                  : member.gender === "FEMALE"
                    ? "Perempuan"
                    : null,
                member.birthPlace || member.birthDate
                  ? `lahir ${[member.birthPlace, member.birthDate ? formatDate(member.birthDate) : null].filter(Boolean).join(", ")}`
                  : null,
                member.ageAtEntry != null ? `usia ${member.ageAtEntry} th (saat didata)` : null,
                member.education,
                member.occupation,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {member.workAddress ? (
              <p className="text-muted-foreground text-xs">Alamat kerja: {member.workAddress}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EducationTab({ employee }: { employee: EmployeeDetail }) {
  // D-054 (Arsip 1a): SA/HR mengelola pendidikan, pelatihan, riwayat kerja langsung dari sini.
  const canManage = employee.access.manage && FEATURES.archive;
  return (
    <div className="space-y-8">
      <EducationSection employee={employee} canManage={canManage} />
      <TrainingSection employee={employee} canManage={canManage} />
      <WorkExperienceSection employee={employee} canManage={canManage} />
    </div>
  );
}

function BankTab({ employee }: { employee: EmployeeDetail }) {
  if (!employee.access.bank || employee.bankAccount === undefined)
    return <Locked what="Rekening bank" />;
  const bank = employee.bankAccount;
  return (
    <div className="space-y-8">
      {bank ? (
        <BankCard bank={bank} />
      ) : (
        <EmptyState icon={Landmark} title="Rekening belum diisi" />
      )}
      {/* Permintaan pemilik projek 2026-10-05: buku tabungan tampil bersama rekening. */}
      <BankBookPanel employeeId={employee.id} />
    </div>
  );
}

function BankCard({ bank }: { bank: NonNullable<EmployeeDetail["bankAccount"]> }) {
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
  COMPANY_CHANGED: Building2,
};

/** Riwayat yang termasuk "Riwayat Jabatan" Arsip (bisa diberi keterangan / riwayat lama). */
const POSITION_HISTORY_TYPES: EmploymentChangeType[] = [
  "HIRED",
  "POSITION_CHANGED",
  "COMPANY_CHANGED",
];

const HISTORY_FILTERS: { label: string; sections?: readonly FieldChangeSection[] }[] = [
  { label: "Semua" },
  { label: "Kepegawaian", sections: [] },
  { label: "Data kerja", sections: ["WORK", "EMERGENCY"] },
  { label: "Data pribadi", sections: ["PERSONAL"] },
  { label: "Keluarga", sections: ["FAMILY"] },
  { label: "Rekening", sections: ["BANK"] },
  {
    label: "Arsip & dokumen",
    sections: ["EDUCATION", "TRAINING", "WORK_EXPERIENCE", "DOCUMENT", "PHOTO"],
  },
];

/** "item" arsip memakai nama bagiannya (Pendidikan/Pelatihan/Pengalaman kerja). */
const fieldLabel = (row: EmployeeFieldChange) =>
  row.field === "item"
    ? FIELD_CHANGE_SECTION_LABELS[row.section]
    : (FIELD_CHANGE_FIELD_LABELS[row.field] ?? row.field);

const monthKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
});
const monthLabelFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "long",
});

/** Satu baris "Label  lama → baru": lama redup & dicoret, baru tebal. */
function DiffRow({
  label,
  from,
  to,
}: {
  label: string;
  from?: string | null | undefined;
  to: ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">
        {from !== undefined ? (
          <>
            <span
              className={cn(
                "text-muted-foreground",
                from && "decoration-muted-foreground/50 line-through",
              )}
            >
              {from ?? "—"}
            </span>
            <ArrowRight
              className="text-muted-foreground mx-1.5 inline size-3.5 align-[-2px]"
              aria-label="menjadi"
            />
          </>
        ) : null}
        <span className="font-medium">{to ?? "—"}</span>
      </dd>
    </>
  );
}

function DiffList({ children }: { children: ReactNode }) {
  return (
    <dl className="mt-1.5 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[minmax(7rem,10rem)_1fr] sm:gap-y-1.5">
      {children}
    </dl>
  );
}

/** Meta satu baris: [keterangan …] · siapa · peran · kapan. Lokasi kerja pengubah di tooltip nama. */
function EntryMeta({
  changedBy,
  at,
  systemLabel = "sistem (data awal/impor)",
  lead = [],
}: {
  changedBy: EmployeeDetail["histories"][number]["changedBy"];
  at: string;
  systemLabel?: string;
  lead?: ReactNode[];
}) {
  const parts: ReactNode[] = [
    ...lead,
    changedBy ? (
      <span
        key="by"
        className="text-foreground/80 font-medium"
        title={changedBy.workLocation ?? "Lokasi kerja belum diisi"}
      >
        {changedBy.name}
      </span>
    ) : (
      <span key="by">{systemLabel}</span>
    ),
    ...(changedBy ? [<span key="role">{ROLE_LABELS[changedBy.role]}</span>] : []),
    <time key="at" dateTime={at} className="tabular-nums">
      {formatDateTime(at)}
    </time>,
  ];
  return (
    <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      {parts.map((part, index) => (
        // Titik pemisah ikut item berikutnya supaya tidak tertinggal di ujung baris saat wrap.
        // biome-ignore lint/suspicious/noArrayIndexKey: urutan tetap
        <span key={index} className="inline-flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden>·</span> : null}
          {part}
        </span>
      ))}
    </p>
  );
}

/** Kerangka satu entri timeline: ikon di garis, judul + aksi rata kanan, isi, meta. */
function TimelineItem({
  icon: Icon,
  tone,
  title,
  actions,
  children,
}: {
  icon: typeof History;
  tone?: "destructive" | "success" | undefined;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[1.75rem_1fr] gap-x-3">
      <span
        className={cn(
          "bg-background text-muted-foreground relative z-10 grid size-7 place-items-center rounded-full border",
          tone === "destructive" && "text-destructive",
          tone === "success" && "text-success",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="flex min-h-7 items-start justify-between gap-3">
          <p className="flex flex-wrap items-center gap-1.5 pt-1 text-sm leading-5 font-medium">
            {title}
          </p>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
        {children}
      </div>
    </li>
  );
}

function FieldChangeEntry({ rows }: { rows: EmployeeFieldChange[] }) {
  const first = rows[0];
  if (!first) return null;
  const sections = [...new Set(rows.map((row) => FIELD_CHANGE_SECTION_LABELS[row.section]))];
  return (
    <TimelineItem icon={Pencil} title={`${sections.join(", ")} diubah`}>
      <DiffList>
        {rows.map((row) =>
          row.valueHidden ? (
            <DiffRow
              key={row.id}
              label={fieldLabel(row)}
              to={
                <span className="text-muted-foreground inline-flex items-center gap-1 font-normal">
                  <Lock className="size-3" aria-hidden />
                  nilai disembunyikan
                </span>
              }
            />
          ) : (
            <DiffRow key={row.id} label={fieldLabel(row)} from={row.oldValue} to={row.newValue} />
          ),
        )}
      </DiffList>
      <EntryMeta
        changedBy={first.changedBy}
        at={first.occurredAt}
        systemLabel="sistem (otomatis)"
        lead={[<span key="src">{FIELD_CHANGE_SOURCE_LABELS[first.source]}</span>]}
      />
    </TimelineItem>
  );
}

type HistoryRow = EmployeeDetail["histories"][number];

/** Isi peristiwa kepegawaian sebagai baris diff. */
function historyRows(h: HistoryRow): ReactNode {
  switch (h.changeType) {
    case "STATUS_CHANGED":
      return <DiffRow label="Status" from={h.fromStatus?.name ?? null} to={h.toStatus?.name} />;
    case "POSITION_CHANGED":
      return h.source === "MANUAL" ? (
        <DiffRow
          label="Jabatan"
          to={[h.toPosition?.name ?? h.toPositionName, h.toDepartmentName]
            .filter(Boolean)
            .join(" · ")}
        />
      ) : (
        <DiffRow label="Jabatan" from={h.fromPosition?.name ?? null} to={h.toPosition?.name} />
      );
    case "COMPANY_CHANGED":
      return (
        <DiffRow label="Perusahaan" from={h.fromCompany?.name ?? null} to={h.toCompany?.name} />
      );
    case "DEACTIVATED":
      return h.exitReason ? <DiffRow label="Alasan" to={EXIT_REASON_LABELS[h.exitReason]} /> : null;
    case "HIRED":
      return (
        <>
          {h.toPosition ? <DiffRow label="Jabatan" to={h.toPosition.name} /> : null}
          {h.toStatus ? <DiffRow label="Status" to={h.toStatus.name} /> : null}
        </>
      );
    default:
      return h.toStatus ? <DiffRow label="Status" to={h.toStatus.name} /> : null;
  }
}

const EMPTY_TEXT: Record<string, string> = {
  Semua: "Belum ada riwayat.",
  Kepegawaian: "Belum ada peristiwa kepegawaian.",
};

function HistoryTab({ employee }: { employee: EmployeeDetail }) {
  const changes = useEmployeeFieldChanges(employee.id);
  const [filter, setFilter] = useState(0);
  const selected = HISTORY_FILTERS[filter]?.sections;
  const allGroups = new Map<string, EmployeeFieldChange[]>();
  for (const page of changes.data?.pages ?? [])
    for (const row of page.data)
      allGroups.set(row.groupId, [...(allGroups.get(row.groupId) ?? []), row]);
  // Grup yang memuat beberapa bagian hanya menampilkan baris bagian yang dipilih.
  const groups = [...allGroups.entries()].flatMap(([id, rows]) => {
    const kept = selected ? rows.filter((row) => selected.includes(row.section)) : rows;
    return kept.length ? [{ id, rows: kept }] : [];
  });
  const showEvents = filter === 0 || filter === 1;
  const timeline = [
    ...(showEvents
      ? employee.histories.map((h) => ({ id: h.id, time: h.createdAt, history: h, rows: null }))
      : []),
    ...groups.map(({ id, rows }) => ({
      id,
      time: rows[0]?.occurredAt ?? "",
      history: null,
      rows,
    })),
  ].sort((a, b) => b.time.localeCompare(a.time));
  // Kelompok per bulan (WIB), terbaru dulu.
  const months: { key: string; label: string; items: typeof timeline }[] = [];
  for (const entry of timeline) {
    const date = new Date(entry.time);
    const key = monthKeyFormat.format(date);
    const last = months.at(-1);
    if (last?.key === key) last.items.push(entry);
    else months.push({ key, label: monthLabelFormat.format(date), items: [entry] });
  }
  // Jumlah per filter dari data yang sudah dimuat; "+" bila masih ada halaman berikutnya.
  const more = changes.hasNextPage ? "+" : "";
  const countOf = (sections?: readonly FieldChangeSection[]) => {
    const events = sections === undefined || sections.length === 0 ? employee.histories.length : 0;
    const rows =
      sections === undefined
        ? allGroups.size
        : [...allGroups.values()].filter((rows) => rows.some((r) => sections.includes(r.section)))
            .length;
    const total = events + rows;
    return total ? `${total}${sections?.length === 0 ? "" : more}` : "";
  };
  const canManage = employee.access.manage && FEATURES.archive;
  const editor = usePositionHistoryEditor(employee);
  const homebase = useHomebaseEditor(employee);
  const showHomebase = filter === 0 || HISTORY_FILTERS[filter]?.sections?.includes("WORK");
  const label = HISTORY_FILTERS[filter]?.label ?? "Semua";
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Riwayat</h3>
        {canManage ? (
          <Button
            size="sm"
            variant="outline"
            onClick={editor.add}
            aria-label="Tambah riwayat jabatan lama"
          >
            <Plus />
            <span className="hidden sm:inline">Riwayat jabatan lama</span>
          </Button>
        ) : null}
      </div>
      {/* Segmented: geser horizontal di layar sempit, fade kanan sebagai petunjuk ada filter lain. */}
      <div className="relative mb-6">
        <fieldset className="bg-muted/70 m-0 flex min-w-0 border-0 w-full gap-0.5 overflow-x-auto rounded-lg p-0.5 [scrollbar-width:none] sm:inline-flex sm:w-auto sm:max-w-full [&::-webkit-scrollbar]:hidden">
          <legend className="sr-only">Filter riwayat</legend>
          {HISTORY_FILTERS.map((item, index) => {
            const count = countOf(item.sections);
            return (
              <button
                key={item.label}
                type="button"
                aria-pressed={filter === index}
                onClick={() => setFilter(index)}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 aria-pressed:bg-background aria-pressed:text-foreground inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] aria-pressed:shadow-xs"
              >
                {item.label}
                {count ? (
                  <span className="text-muted-foreground text-xs font-normal tabular-nums">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </fieldset>
        <div
          aria-hidden
          className="from-background pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-lg bg-linear-to-l sm:hidden"
        />
      </div>
      {showHomebase ? <HomebaseHistory employee={employee} menu={homebase.menu} /> : null}
      {homebase.dialogs}
      {changes.isPending ? (
        <p role="status" className="text-muted-foreground mb-4 text-sm">
          Memuat riwayat perubahan…
        </p>
      ) : null}
      {changes.isError ? (
        <div role="alert" className="mb-4 text-sm">
          {errorMessage(changes.error)}{" "}
          <Button variant="outline" size="sm" onClick={() => void changes.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : null}
      {!timeline.length && !changes.isPending ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {EMPTY_TEXT[label] ?? `Belum ada perubahan ${label.toLowerCase()}.`}
        </p>
      ) : null}
      <div className="space-y-8">
        {months.map((month) => (
          <section key={month.key} aria-label={month.label}>
            <h4 className="text-muted-foreground mb-3 text-[11px] font-medium tracking-wider uppercase">
              {month.label}
            </h4>
            <ol className="before:bg-border relative space-y-5 before:absolute before:top-3 before:bottom-3 before:left-[13.5px] before:w-px">
              {month.items.map((entry) => {
                if (entry.rows) return <FieldChangeEntry key={entry.id} rows={entry.rows} />;
                const h = entry.history;
                if (!h) return null;
                const positional = POSITION_HISTORY_TYPES.includes(h.changeType);
                return (
                  <TimelineItem
                    key={h.id}
                    icon={HISTORY_ICON[h.changeType]}
                    tone={
                      h.changeType === "DEACTIVATED"
                        ? "destructive"
                        : h.changeType === "REACTIVATED"
                          ? "success"
                          : undefined
                    }
                    title={
                      <>
                        {EMPLOYMENT_CHANGE_LABELS[h.changeType]}
                        {h.movementType ? (
                          <span className="bg-brand-soft text-brand-soft-foreground rounded-md px-1.5 py-0.5 text-[11px] font-normal">
                            {MOVEMENT_TYPE_LABELS[h.movementType]}
                          </span>
                        ) : null}
                        {h.source === "MANUAL" ? (
                          <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px] font-normal">
                            Riwayat lama
                          </span>
                        ) : null}
                      </>
                    }
                    actions={
                      canManage && positional
                        ? editor.menu(h, EMPLOYMENT_CHANGE_LABELS[h.changeType])
                        : null
                    }
                  >
                    <DiffList>{historyRows(h)}</DiffList>
                    {h.note ? (
                      <p className="text-muted-foreground border-border mt-2 border-l-2 pl-3 text-xs">
                        {h.note}
                      </p>
                    ) : null}
                    {positional ? (
                      <AttachmentList
                        employeeId={employee.id}
                        link={{ historyId: h.id }}
                        typeCodes={DECREE_CODES}
                        label="SK"
                      />
                    ) : null}
                    <EntryMeta
                      changedBy={h.changedBy}
                      at={h.createdAt}
                      lead={[
                        <span key="eff">Efektif {formatDate(h.effectiveDate)}</span>,
                        ...(h.decreeNumber ? [<span key="sk">No. SK {h.decreeNumber}</span>] : []),
                      ]}
                    />
                  </TimelineItem>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      {changes.hasNextPage ? (
        <Button
          className="mt-6"
          variant="outline"
          size="sm"
          disabled={changes.isFetchingNextPage}
          onClick={() => void changes.fetchNextPage()}
        >
          {changes.isFetchingNextPage ? "Memuat…" : "Muat lebih banyak"}
        </Button>
      ) : null}
      {editor.dialog}
    </>
  );
}
