import { MASTER_DATA_LABELS, type MasterDataKind } from "@hris/shared";
import {
  Award,
  BriefcaseBusiness,
  Building,
  Building2,
  type LucideIcon,
  MapPin,
  Tags,
} from "lucide-react";

// D-049: halaman Administrasi › Master Data. Slug URL berbahasa Indonesia ↔ jenis API.
export interface MasterDataPageConfig {
  kind: MasterDataKind;
  slug: string;
  label: string;
  /** Kalimat tunggal untuk tombol/dialog, mis. "jabatan". */
  noun: string;
  icon: LucideIcon;
  description: string;
}

export const MASTER_DATA_PAGES: MasterDataPageConfig[] = [
  {
    kind: "companies",
    slug: "perusahaan",
    label: MASTER_DATA_LABELS.companies,
    noun: "perusahaan",
    icon: Building2,
    description:
      "Perusahaan dalam grup (D-039). Kode dipakai di nomor induk karyawan dan terkunci setelah ada karyawan.",
  },
  {
    kind: "departments",
    // D-050: semua unit organisasi (Direktorat, Divisi, Departemen, Seksi).
    slug: "unit-organisasi",
    label: MASTER_DATA_LABELS.departments,
    noun: "unit",
    icon: Building,
    description:
      "Direktorat, divisi, departemen, dan seksi berhierarki. Departemen boleh langsung di bawah direktorat; jabatan direksi cukup ditaruh di unit direktorat.",
  },
  {
    kind: "positions",
    slug: "jabatan",
    label: MASTER_DATA_LABELS.positions,
    noun: "jabatan",
    icon: BriefcaseBusiness,
    description:
      "Jabatan per unit organisasi, dengan level (Direksi … Helper). Gabungkan jabatan ganda hasil import ke yang benar.",
  },
  {
    kind: "employment-statuses",
    slug: "status-kepegawaian",
    label: MASTER_DATA_LABELS["employment-statuses"],
    noun: "status",
    icon: Tags,
    description:
      "Status kepegawaian. Satu kategori (Tetap, PKWT, Magang, …) diwakili tepat satu status (D-038).",
  },
  {
    kind: "grades",
    slug: "grade",
    label: MASTER_DATA_LABELS.grades,
    noun: "grade",
    icon: Award,
    description: "Tingkatan/grade karyawan.",
  },
  {
    kind: "work-locations",
    slug: "lokasi-kerja",
    label: MASTER_DATA_LABELS["work-locations"],
    noun: "lokasi",
    icon: MapPin,
    description:
      "Site/lokasi kerja. Titik geofence (latitude, longitude, radius) dipakai absensi; pemilih peta menyusul.",
  },
];

export const MASTER_DATA_BASE = "/master-data";

/** Slug lama tetap berfungsi (dialihkan ke slug baru). */
const SLUG_ALIASES: Record<string, string> = { departemen: "unit-organisasi" };

export function masterDataPage(slug: string | undefined): MasterDataPageConfig | undefined {
  const resolved = slug ? (SLUG_ALIASES[slug] ?? slug) : slug;
  return MASTER_DATA_PAGES.find((page) => page.slug === resolved);
}

export function isMasterDataAlias(slug: string | undefined): boolean {
  return slug !== undefined && slug in SLUG_ALIASES;
}
