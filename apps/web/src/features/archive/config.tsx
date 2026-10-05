import {
  type ArchiveCategory,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  EMPLOYMENT_CHANGE_LABELS,
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
  GraduationCap,
  History,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { DataColumn, tableFeaturesNone } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/features/employee/components/employee-avatar";
import { formatDate, formatRupiah } from "@/lib/format";
import type { ArchiveRow } from "./schemas";

// D-054 (Arsip 1a): konfigurasi 5 menu Arsip aktif — kolom tabel, filter khusus, tab detail tujuan.

const column = createColumnHelper<typeof tableFeaturesNone, ArchiveRow>();
const col = (def: Parameters<typeof column.display>[0]) =>
  column.display(def) as DataColumn<ArchiveRow>;
const muted = (value: ReactNode) => <span className="text-muted-foreground">{value ?? "—"}</span>;

export interface ArchiveFilter {
  key: "level" | "type" | "movementType" | "source";
  label: string;
  options: { value: string; label: string }[];
}

export interface ArchiveSectionConfig {
  slug: string;
  category: ArchiveCategory;
  label: string;
  noun: string;
  icon: LucideIcon;
  description: string;
  /** Tab detail karyawan yang dibuka saat baris diklik. */
  tab: "work" | "education" | "history";
  filter?: ArchiveFilter;
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
    slug: "pendidikan",
    category: "educations",
    label: "Data Pendidikan",
    noun: "pendidikan",
    icon: GraduationCap,
    description:
      "Riwayat pendidikan formal semua karyawan. Klik baris untuk mengelola di detail karyawan.",
    tab: "education",
    filter: {
      key: "level",
      label: "Jenjang",
      options: EDUCATION_LEVELS.map((l) => ({ value: l, label: EDUCATION_LEVEL_LABELS[l] })),
    },
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
    filter: {
      key: "movementType",
      label: "Jenis perpindahan",
      options: MOVEMENT_TYPES.map((m) => ({ value: m, label: MOVEMENT_TYPE_LABELS[m] })),
    },
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
    filter: {
      key: "type",
      label: "Jenis",
      options: TRAINING_TYPES.map((t) => ({ value: t, label: TRAINING_TYPE_LABELS[t] })),
    },
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
];

export function archivePage(slug: string | undefined): ArchiveSectionConfig | undefined {
  return ARCHIVE_PAGES.find((page) => page.slug === slug);
}
