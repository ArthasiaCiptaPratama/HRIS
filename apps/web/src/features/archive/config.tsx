import {
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  EMPLOYMENT_CHANGE_LABELS,
  EXPIRY_STATE_LABELS,
  EXPIRY_STATES,
  FAMILY_RELATIONSHIP_LABELS,
  FAMILY_RELATIONSHIPS,
  MOVEMENT_TYPE_LABELS,
  MOVEMENT_TYPES,
  TRAINING_TYPE_LABELS,
  TRAINING_TYPES,
} from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import {
  Award,
  BriefcaseBusiness,
  Contact,
  FolderArchive,
  GraduationCap,
  HeartHandshake,
  History,
  Landmark,
  Lock,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { DataColumn, tableFeaturesNone } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { useDocumentTypes } from "@/features/documents/api";
import { ExpiryBadge } from "@/features/documents/components/documents-tab";
import { EmployeeAvatar } from "@/features/employee/components/employee-avatar";
import { formatDate, formatRupiah } from "@/lib/format";
import type { ArchiveListCategory } from "./api";
import type { ArchiveRow } from "./schemas";

// D-054 (Arsip 1a): konfigurasi 5 menu Arsip aktif — kolom tabel, filter khusus, tab detail tujuan.

const column = createColumnHelper<typeof tableFeaturesNone, ArchiveRow>();
const col = (def: Parameters<typeof column.display>[0]) =>
  column.display(def) as DataColumn<ArchiveRow>;
const muted = (value: ReactNode) => <span className="text-muted-foreground">{value ?? "—"}</span>;

type FilterOption = { value: string; label: string };
export interface ArchiveFilter {
  key: "level" | "type" | "movementType" | "source" | "documentTypeId" | "expiry" | "relationship";
  label: string;
  options?: FilterOption[];
  /** Pilihan dari API (mis. jenis dokumen); hook dipanggil konsisten per halaman. */
  useOptions?: () => FilterOption[];
}

export interface ArchiveSectionConfig {
  slug: string;
  category: ArchiveListCategory;
  label: string;
  noun: string;
  icon: LucideIcon;
  description: string;
  /** Tab detail karyawan yang dibuka saat baris diklik. */
  tab: "work" | "education" | "history" | "documents" | "family" | "bank";
  filters?: ArchiveFilter[];
  columns: (opts: { showCost: boolean }) => DataColumn<ArchiveRow>[];
}

const employeeColumn = col({
  id: "employee",
  header: "Karyawan",
  cell: ({ row }) => {
    const e = row.original.employee;
    return (
      <div className="flex min-w-0 items-center gap-3">
        <EmployeeAvatar name={e.fullName} photoUrl={e.photoUrl} inactive={!e.isActive} />
        <div className="min-w-0">
          <p className="truncate font-medium">{e.fullName}</p>
          <p className="text-muted-foreground truncate text-xs">
            <span className="font-mono">{e.employeeNumber}</span>
            {" · "}
            {e.company.code} · {e.position.name}
          </p>
        </div>
      </div>
    );
  },
});

export const ARCHIVE_PAGES: ArchiveSectionConfig[] = [
  {
    slug: "kontak",
    category: "contacts",
    label: "Data Kontak",
    noun: "kontak",
    icon: Contact,
    description:
      "No. HP, email kantor & pribadi, kontak darurat. Alamat domisili hanya tampil bila Anda berhak melihat data pribadi.",
    tab: "work",
    columns: () => [
      employeeColumn,
      col({ id: "phone", header: "No. HP", cell: ({ row }) => muted(row.original.phoneNumber) }),
      col({
        id: "email",
        header: "Email",
        cell: ({ row }) => (
          <div className="min-w-0 text-xs">
            <p className="truncate">{row.original.workEmail ?? "—"}</p>
            <p className="text-muted-foreground truncate">{row.original.personalEmail ?? ""}</p>
          </div>
        ),
      }),
      col({
        id: "emergency",
        header: "Kontak darurat",
        cell: ({ row }) =>
          row.original.emergencyContactName || row.original.emergencyPhone ? (
            <div className="min-w-0 text-xs">
              <p className="truncate">
                {row.original.emergencyContactName ?? "—"}
                {row.original.emergencyContactRelationship
                  ? ` (${row.original.emergencyContactRelationship})`
                  : ""}
              </p>
              <p className="text-muted-foreground">{row.original.emergencyPhone ?? ""}</p>
            </div>
          ) : (
            muted(null)
          ),
      }),
      col({
        id: "domicile",
        header: "Domisili",
        cell: ({ row }) =>
          "domicileAddress" in row.original ? (
            <span
              className="line-clamp-2 max-w-64 text-xs"
              title={row.original.domicileAddress ?? ""}
            >
              {row.original.domicileAddress ?? "—"}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">Terbatas</span>
          ),
      }),
    ],
  },
  {
    slug: "keluarga",
    category: "families",
    label: "Data Keluarga",
    noun: "anggota keluarga",
    icon: HeartHandshake,
    description:
      "Anggota keluarga karyawan (data pribadi pihak ketiga). Hanya untuk akun ber-izin lihat data pribadi; setiap pembukaan tercatat di audit log. Karyawan mengubahnya lewat pengajuan.",
    tab: "family",
    filters: [
      {
        key: "relationship",
        label: "Hubungan",
        options: FAMILY_RELATIONSHIPS.map((r) => ({
          value: r,
          label: FAMILY_RELATIONSHIP_LABELS[r],
        })),
      },
    ],
    columns: () => [
      employeeColumn,
      col({ id: "name", header: "Nama", cell: ({ row }) => row.original.name ?? "—" }),
      col({
        id: "relationship",
        header: "Hubungan",
        cell: ({ row }) =>
          row.original.relationship ? (
            <Badge variant="secondary">
              {FAMILY_RELATIONSHIP_LABELS[
                row.original.relationship as keyof typeof FAMILY_RELATIONSHIP_LABELS
              ] ?? row.original.relationship}
            </Badge>
          ) : (
            muted(null)
          ),
      }),
      col({
        id: "birthDate",
        header: "Tanggal lahir",
        cell: ({ row }) =>
          muted(row.original.birthDate ? formatDate(row.original.birthDate) : null),
      }),
      col({ id: "phone", header: "No. HP", cell: ({ row }) => muted(row.original.phoneNumber) }),
    ],
  },
  {
    slug: "pendidikan",
    category: "educations",
    label: "Data Pendidikan",
    noun: "pendidikan",
    icon: GraduationCap,
    description:
      "Riwayat pendidikan formal semua karyawan. Klik baris untuk mengelola di detail karyawan.",
    tab: "education",
    filters: [
      {
        key: "level",
        label: "Jenjang",
        options: EDUCATION_LEVELS.map((l) => ({ value: l, label: EDUCATION_LEVEL_LABELS[l] })),
      },
    ],
    columns: () => [
      employeeColumn,
      col({
        id: "level",
        header: "Jenjang",
        cell: ({ row }) =>
          row.original.level ? (
            <Badge variant="secondary">{EDUCATION_LEVEL_LABELS[row.original.level]}</Badge>
          ) : (
            muted(null)
          ),
      }),
      col({ id: "school", header: "Sekolah / kampus", cell: ({ row }) => row.original.schoolName }),
      col({ id: "major", header: "Jurusan", cell: ({ row }) => muted(row.original.major) }),
      col({ id: "year", header: "Lulus", cell: ({ row }) => muted(row.original.graduationYear) }),
    ],
  },
  {
    slug: "riwayat-jabatan",
    category: "position-histories",
    label: "Riwayat Jabatan",
    noun: "riwayat jabatan",
    icon: History,
    description:
      "Masuk, mutasi, promosi, pindah PT — tercatat otomatis; riwayat sebelum HRIS ditambahkan di tab Riwayat detail karyawan.",
    tab: "history",
    filters: [
      {
        key: "movementType",
        label: "Jenis perpindahan",
        options: MOVEMENT_TYPES.map((m) => ({ value: m, label: MOVEMENT_TYPE_LABELS[m] })),
      },
    ],
    columns: () => [
      employeeColumn,
      col({
        id: "date",
        header: "Efektif",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDate(row.original.effectiveDate)}</span>
        ),
      }),
      col({
        id: "change",
        header: "Perubahan",
        cell: ({ row }) => {
          const r = row.original;
          const to = r.toPosition?.name ?? r.toPositionName;
          return (
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-sm">
                {r.changeType ? EMPLOYMENT_CHANGE_LABELS[r.changeType] : "—"}
                {r.movementType ? (
                  <Badge variant="secondary">{MOVEMENT_TYPE_LABELS[r.movementType]}</Badge>
                ) : null}
                {r.source === "MANUAL" ? <Badge variant="outline">Riwayat lama</Badge> : null}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {r.changeType === "COMPANY_CHANGED"
                  ? `${r.fromCompany?.code ?? "—"} → ${r.toCompany?.code ?? "—"}`
                  : r.fromPosition && to
                    ? `${r.fromPosition.name} → ${to}`
                    : [to, r.toDepartmentName].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
          );
        },
      }),
      col({ id: "decree", header: "No. SK", cell: ({ row }) => muted(row.original.decreeNumber) }),
    ],
  },
  {
    slug: "pelatihan",
    category: "trainings",
    label: "Data Pelatihan",
    noun: "pelatihan",
    icon: Award,
    description: "Pelatihan & sertifikasi karyawan. Biaya hanya terlihat oleh Super Admin & HR.",
    tab: "education",
    filters: [
      {
        key: "type",
        label: "Jenis",
        options: TRAINING_TYPES.map((t) => ({ value: t, label: TRAINING_TYPE_LABELS[t] })),
      },
    ],
    columns: ({ showCost }) => [
      employeeColumn,
      col({
        id: "training",
        header: "Pelatihan",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.trainingField}</p>
            <p className="text-muted-foreground truncate text-xs">{row.original.organizer ?? ""}</p>
          </div>
        ),
      }),
      col({
        id: "type",
        header: "Jenis",
        cell: ({ row }) =>
          row.original.type ? (
            <Badge variant="secondary">{TRAINING_TYPE_LABELS[row.original.type]}</Badge>
          ) : (
            muted(null)
          ),
      }),
      col({
        id: "period",
        header: "Periode",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <span className="text-xs whitespace-nowrap">
              {r.startDate
                ? `${formatDate(r.startDate)}${r.endDate ? ` – ${formatDate(r.endDate)}` : ""}`
                : (r.trainingYear ?? "—")}
              {r.hours ? <span className="text-muted-foreground"> · {r.hours} jam</span> : null}
            </span>
          );
        },
      }),
      ...(showCost
        ? [
            col({
              id: "cost",
              header: "Biaya",
              cell: ({ row }) => (
                <span className="whitespace-nowrap tabular-nums">
                  {formatRupiah(row.original.cost)}
                </span>
              ),
            }),
          ]
        : []),
    ],
  },
  {
    slug: "riwayat-kerja",
    category: "work-experiences",
    label: "Data Riwayat Kerja",
    noun: "riwayat kerja",
    icon: BriefcaseBusiness,
    description: "Pengalaman kerja sebelum bergabung (dari onboarding atau diisi HR).",
    tab: "education",
    columns: () => [
      employeeColumn,
      col({ id: "company", header: "Perusahaan", cell: ({ row }) => row.original.companyName }),
      col({ id: "position", header: "Jabatan", cell: ({ row }) => row.original.position }),
      col({
        id: "years",
        header: "Tahun",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.startYear}–{row.original.endYear ?? "sekarang"}
          </span>
        ),
      }),
    ],
  },
  {
    slug: "file",
    category: "documents",
    label: "Data File",
    noun: "dokumen",
    icon: FolderArchive,
    description:
      "Dokumen versi aktif semua karyawan beserta masa berlakunya. Jenis sensitif (KTP, KK, rekening, MCU, …) hanya tampil bila Anda diberi izin.",
    tab: "documents",
    filters: [
      {
        key: "documentTypeId",
        label: "Jenis dokumen",
        useOptions: () =>
          (useDocumentTypes().data ?? []).map((t) => ({ value: t.id, label: t.name })),
      },
      {
        key: "expiry",
        label: "Masa berlaku",
        options: EXPIRY_STATES.map((e) => ({ value: e, label: EXPIRY_STATE_LABELS[e] })),
      },
    ],
    columns: () => [
      employeeColumn,
      col({
        id: "document",
        header: "Dokumen",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate">
              {row.original.documentType?.sensitive ? (
                <Lock className="text-muted-foreground size-3.5 shrink-0" aria-label="Sensitif" />
              ) : null}
              {row.original.documentType?.name ?? "—"}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {row.original.documentNumber ?? ""}
            </p>
          </div>
        ),
      }),
      col({
        id: "expires",
        header: "Berlaku s.d.",
        cell: ({ row }) =>
          row.original.expiresAt ? (
            <div className="flex flex-col items-start gap-1 text-xs whitespace-nowrap">
              {formatDate(row.original.expiresAt)}
              <ExpiryBadge
                state={row.original.expiryState ?? "NONE"}
                daysLeft={row.original.daysLeft ?? null}
              />
            </div>
          ) : (
            muted(null)
          ),
      }),
      col({
        id: "version",
        header: "Versi",
        cell: ({ row }) => muted(row.original.version ?? 1),
      }),
    ],
  },
  {
    slug: "bank",
    category: "bank-accounts",
    label: "Data Bank",
    noun: "rekening",
    icon: Landmark,
    description:
      "Rekening gaji karyawan. Hanya untuk akun ber-izin lihat rekening; setiap pembukaan tercatat di audit log. Karyawan mengubahnya lewat pengajuan + buku tabungan.",
    tab: "bank",
    columns: () => [
      employeeColumn,
      col({ id: "bankName", header: "Bank", cell: ({ row }) => row.original.bankName ?? "—" }),
      col({
        id: "accountNumber",
        header: "Nomor rekening",
        cell: ({ row }) => (
          <span className="font-mono text-[13px]">{row.original.accountNumber ?? "—"}</span>
        ),
      }),
      col({
        id: "holder",
        header: "Atas nama",
        cell: ({ row }) => muted(row.original.accountHolder),
      }),
    ],
  },
];

export function archivePage(slug: string | undefined): ArchiveSectionConfig | undefined {
  return ARCHIVE_PAGES.find((page) => page.slug === slug);
}
