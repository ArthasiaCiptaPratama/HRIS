import { EMPLOYMENT_CATEGORY_LABELS, type EmploymentCategory } from "@hris/shared";
import {
  ArrowLeftRight,
  Award,
  Bell,
  BriefcaseBusiness,
  ChartColumn,
  Contact,
  FileClock,
  FolderArchive,
  GraduationCap,
  HeartHandshake,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  Network,
  Package,
  TriangleAlert,
  UserRound,
  UserRoundCheck,
  Users,
  UserX,
} from "lucide-react";
import type { Me } from "@/features/auth/schemas";
import { access } from "@/lib/access";

// D-035: kelompok besar (top nav) → kelompok kecil (judul seksi sidebar) → isi (item sidebar).
// Satu sumber untuk top nav, sidebar, breadcrumb, pencarian cepat (Ctrl+K), dan guard route.

export type SummaryKey = EmploymentCategory | "ALL" | "INACTIVE";

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  visible?: (me: Me) => boolean;
  /** Halaman belum dikerjakan → tampil "Maintenance". */
  maintenance?: boolean;
  /** Angka badge dari GET /employees/summary. */
  summaryKey?: SummaryKey;
  children?: NavItem[];
  keywords?: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export interface NavGroup {
  id: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  /** Tujuan saat tab kelompok diklik. */
  to: string;
  match: (pathname: string) => boolean;
  visible: (me: Me) => boolean;
  /** false = tidak tampil di top nav (mis. Akun Saya, dibuka dari menu profil). */
  inTopNav: boolean;
  sections: NavSection[];
}

/** Slug URL ↔ kategori (D-035). `semua` = semua pegawai aktif. */
export const CATEGORY_SLUGS: Record<string, EmploymentCategory | undefined> = {
  tetap: "PERMANENT",
  pkwt: "PKWT",
  internship: "INTERNSHIP",
  "daily-worker": "DAILY_WORKER",
  outsourcing: "OUTSOURCING",
  semua: undefined,
};

const ACTIVE_BASE = "/personal/pegawai-aktif";
const manage = access.manageEmployees;

const archive = (id: string, label: string, icon: LucideIcon, keywords = ""): NavItem => ({
  id,
  label,
  to: `/personal/arsip/${id}`,
  icon,
  visible: manage,
  maintenance: true,
  keywords,
});

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    to: "/",
    match: (p) => p === "/",
    visible: () => true,
    inTopNav: true,
    sections: [
      {
        id: "overview",
        label: "Ringkasan",
        items: [{ id: "dashboard", label: "Dashboard", to: "/", icon: LayoutDashboard }],
      },
    ],
  },
  {
    id: "personal",
    label: "Personal Management",
    shortLabel: "Personalia",
    icon: Users,
    to: `${ACTIVE_BASE}/semua`,
    match: (p) => p.startsWith("/personal"),
    visible: access.personalMenu,
    inTopNav: true,
    sections: [
      {
        id: "employment",
        label: "Kepegawaian",
        items: [
          {
            id: "active",
            label: "Data Pegawai Aktif",
            to: `${ACTIVE_BASE}/semua`,
            icon: Users,
            summaryKey: "ALL",
            keywords: "karyawan daftar direktori",
            children: [
              ...(["tetap", "pkwt", "internship", "daily-worker", "outsourcing"] as const).map(
                (slug): NavItem => {
                  const category = CATEGORY_SLUGS[slug] as EmploymentCategory;
                  return {
                    id: `active-${slug}`,
                    label: EMPLOYMENT_CATEGORY_LABELS[category],
                    to: `${ACTIVE_BASE}/${slug}`,
                    icon: Users,
                    summaryKey: category,
                  };
                },
              ),
              {
                id: "active-semua",
                label: "Semua Pegawai",
                to: `${ACTIVE_BASE}/semua`,
                icon: Users,
                summaryKey: "ALL",
              },
            ],
          },
          {
            id: "change-status",
            label: "Ubah Status Pegawai",
            to: "/personal/ubah-status",
            icon: ArrowLeftRight,
            visible: manage,
            keywords: "resign phk nonaktifkan pkwt tetap",
          },
          {
            id: "activation",
            label: "Pengaktifan Pegawai",
            to: "/personal/pengaktifan",
            icon: UserRoundCheck,
            visible: manage,
            keywords: "aktifkan kembali rehire",
          },
          {
            id: "inactive",
            label: "Data Pegawai Tidak Aktif",
            to: "/personal/pegawai-tidak-aktif",
            icon: UserX,
            visible: manage,
            summaryKey: "INACTIVE",
            keywords: "arsip resign keluar",
          },
          {
            id: "structure",
            label: "Struktur Organisasi",
            to: "/personal/struktur-organisasi",
            icon: Network,
            keywords: "bagan departemen jabatan atasan",
          },
        ],
      },
      {
        id: "archive",
        label: "Arsip",
        items: [
          archive("kontak", "Data Kontak", Contact, "telepon alamat darurat"),
          archive("keluarga", "Data Keluarga", HeartHandshake, "pasangan anak"),
          archive("pendidikan", "Data Pendidikan", GraduationCap, "sekolah kuliah"),
          archive("riwayat-jabatan", "Riwayat Jabatan", History, "mutasi promosi"),
          archive("pelatihan", "Data Pelatihan", Award, "training sertifikat"),
          archive("riwayat-kerja", "Data Riwayat Kerja", BriefcaseBusiness, "pengalaman"),
          archive("aset", "Data Assets", Package, "inventaris laptop"),
          archive("file", "Data File", FolderArchive, "dokumen berkas"),
          archive("bank", "Data Bank", Landmark, "rekening"),
          archive("peringatan", "Riwayat Peringatan", TriangleAlert, "sp surat peringatan"),
        ],
      },
      {
        id: "reports",
        label: "Laporan & Rekap",
        items: [
          {
            id: "report",
            label: "Laporan",
            to: "/personal/laporan",
            icon: ChartColumn,
            visible: manage,
            maintenance: true,
            keywords: "rekap export",
          },
        ],
      },
    ],
  },
  {
    id: "admin",
    label: "Administrasi",
    icon: KeyRound,
    to: "/akun",
    match: (p) => ["/akun", "/grant", "/audit"].some((base) => p.startsWith(base)),
    visible: access.listAccounts,
    inTopNav: true,
    sections: [
      {
        id: "access",
        label: "Akses & Keamanan",
        items: [
          { id: "accounts", label: "Akun", to: "/akun", icon: Users, visible: access.listAccounts },
          {
            id: "grants",
            label: "Grant izin",
            to: "/grant",
            icon: KeyRound,
            visible: access.manageGrants,
          },
          {
            id: "audit",
            label: "Audit log",
            to: "/audit",
            icon: FileClock,
            visible: access.readAuditLogs,
          },
        ],
      },
    ],
  },
  {
    id: "me",
    label: "Akun Saya",
    icon: UserRound,
    to: "/profil",
    match: (p) => p.startsWith("/profil") || p.startsWith("/notifikasi"),
    visible: () => true,
    inTopNav: false,
    sections: [
      {
        id: "me",
        label: "Akun Saya",
        items: [
          { id: "profile", label: "Profil", to: "/profil", icon: UserRound },
          { id: "notifications", label: "Notifikasi", to: "/notifikasi", icon: Bell },
        ],
      },
    ],
  },
];

const isVisible = (me: Me, item: { visible?: (me: Me) => boolean }) => item.visible?.(me) ?? true;

/** Kelompok beserta seksi/item yang boleh dilihat akun ini (seksi kosong dibuang). */
export function visibleGroups(me: Me): NavGroup[] {
  return NAV_GROUPS.filter((group) => group.visible(me))
    .map((group) => ({
      ...group,
      sections: group.sections
        .map((section) => ({
          ...section,
          items: section.items
            .filter((item) => isVisible(me, item))
            .map((item) => ({
              ...item,
              ...(item.children
                ? { children: item.children.filter((child) => isVisible(me, child)) }
                : {}),
            })),
        }))
        .filter((section) => section.items.length > 0),
    }))
    .filter((group) => group.sections.length > 0);
}

export function activeGroup(groups: NavGroup[], pathname: string): NavGroup | undefined {
  return groups.find((group) => group.match(pathname));
}

export interface ActiveTrail {
  group: NavGroup;
  section: NavSection;
  item: NavItem;
  child?: NavItem;
}

/** Jejak aktif untuk breadcrumb & penanda sidebar (kecocokan terpanjang). */
export function activeTrail(groups: NavGroup[], pathname: string): ActiveTrail | undefined {
  let best: ActiveTrail | undefined;
  let bestLength = -1;
  const consider = (trail: ActiveTrail, to: string) => {
    const hit = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
    if (hit && to.length > bestLength) {
      best = trail;
      bestLength = to.length;
    }
  };
  for (const group of groups) {
    for (const section of group.sections) {
      for (const item of section.items) {
        consider({ group, section, item }, item.to);
        for (const child of item.children ?? [])
          consider({ group, section, item, child }, child.to);
      }
    }
  }
  // Rute turunan tanpa item sendiri (mis. /personal/pegawai-aktif/<slug>) tetap ikut induknya.
  if (!best && pathname.startsWith(ACTIVE_BASE)) {
    const group = groups.find((g) => g.id === "personal");
    const section = group?.sections[0];
    const item = section?.items[0];
    if (group && section && item) best = { group, section, item };
  }
  return best;
}

export interface FlatNavEntry {
  group: NavGroup;
  section: NavSection;
  item: NavItem;
  parent?: NavItem;
}

/** Semua tujuan navigasi (untuk pencarian cepat). */
export function flattenNav(groups: NavGroup[]): FlatNavEntry[] {
  const entries: FlatNavEntry[] = [];
  for (const group of groups) {
    for (const section of group.sections) {
      for (const item of section.items) {
        if (item.children?.length) {
          for (const child of item.children)
            entries.push({ group, section, item: child, parent: item });
        } else entries.push({ group, section, item });
      }
    }
  }
  return entries;
}
