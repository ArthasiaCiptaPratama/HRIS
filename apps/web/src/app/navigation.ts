import {
  ArrowLeftRight,
  Award,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChartColumn,
  Clock,
  Contact,
  FileClock,
  FileUp,
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
  UserPlus,
  UserRound,
  UserRoundCheck,
  Users,
  UserX,
  Workflow,
} from "lucide-react";
import type { Me } from "@/features/auth/schemas";
import {
  ACTIVE_BASE,
  ACTIVE_GROUPS,
  type ActiveFilter,
  type ActiveView,
  ALL_ACTIVE_VIEW,
} from "@/features/employee/active-views";
import { MASTER_DATA_BASE, MASTER_DATA_PAGES } from "@/features/organization/config";
import { access } from "@/lib/access";
import { FEATURES } from "./feature-flags";

// D-035: kelompok besar (top nav) → kelompok kecil (judul seksi sidebar) → isi (item sidebar).
// Satu sumber untuk top nav, sidebar, breadcrumb, pencarian cepat (Ctrl+K), dan guard route.

/** Sumber angka badge: filter daftar aktif (D-038) atau jumlah nonaktif. */
export type SummaryKey = ActiveFilter | "INACTIVE";

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

const activeItem = (view: ActiveView, icon: LucideIcon = Users): NavItem => ({
  id: `active-${view.slug}`,
  label: view.label,
  to: `${ACTIVE_BASE}/${view.slug}`,
  icon,
  summaryKey: view.filter,
});

const GROUP_ICONS: Record<string, LucideIcon> = {
  INTERNAL: BriefcaseBusiness,
  INTERNSHIP: GraduationCap,
  EXTERNAL: Building2,
};

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
        // D-038: semua → grup (Internal / Magang / Eksternal) → kategori.
        id: "active",
        label: "Data Karyawan Aktif",
        items: [
          { ...activeItem(ALL_ACTIVE_VIEW), keywords: "karyawan pegawai daftar direktori" },
          ...ACTIVE_GROUPS.map(
            (group): NavItem => ({
              id: `group-${group.group.toLowerCase()}`,
              label: group.label,
              to: group.to,
              icon: GROUP_ICONS[group.group] ?? Users,
              children: group.views.map((view) => activeItem(view)),
            }),
          ),
        ],
      },
      {
        id: "employment",
        label: "Pengelolaan Karyawan",
        items: [
          {
            id: "change-status",
            maintenance: !FEATURES.changeStatus,
            label: "Ubah Status Karyawan",
            to: "/personal/ubah-status",
            icon: ArrowLeftRight,
            visible: manage,
            keywords: "resign phk nonaktifkan pkwt tetap",
          },
          {
            id: "import",
            label: "Import Data Karyawan",
            to: "/personal/import",
            icon: FileUp,
            visible: manage,
            keywords: "unggah excel csv xlsx impor massal",
          },
          {
            id: "activation",
            maintenance: !FEATURES.activation,
            label: "Pengaktifan Karyawan",
            to: "/personal/pengaktifan",
            icon: UserRoundCheck,
            visible: manage,
            keywords: "aktifkan kembali rehire",
          },
          {
            id: "inactive",
            maintenance: !FEATURES.inactiveEmployees,
            label: "Data Karyawan Tidak Aktif",
            to: "/personal/pegawai-tidak-aktif",
            icon: UserX,
            visible: manage,
            summaryKey: "INACTIVE",
            keywords: "arsip resign keluar",
          },
          {
            id: "structure",
            maintenance: !FEATURES.orgStructure,
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
    match: (p) =>
      ["/akun", "/grant", "/audit", "/master-data", "/penerimaan"].some((base) =>
        p.startsWith(base),
      ),
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
      {
        // D-045: penerimaan karyawan baru (SA & HR).
        id: "recruitment",
        label: "Penerimaan",
        items: [
          {
            id: "onboarding",
            label: "Penerimaan Karyawan Baru",
            to: "/penerimaan",
            icon: UserPlus,
            visible: access.runOnboarding,
            keywords: "onboarding calon karyawan undangan aktivasi impor portal maganghub",
          },
        ],
      },
      {
        // D-049: master data organisasi (SA kelola, HR lihat).
        id: "master-data",
        label: "Master Data",
        items: [
          ...MASTER_DATA_PAGES.map((page) => ({
            id: `master-${page.kind}`,
            label: page.label,
            to: `${MASTER_DATA_BASE}/${page.slug}`,
            icon: page.icon,
            visible: access.viewMasterData,
            keywords: "master data organisasi",
          })),
          {
            // D-051: kursi di bagan organisasi (atasan, garis fungsional, slot).
            id: "master-org-posts",
            label: "Pos jabatan",
            to: `${MASTER_DATA_BASE}/pos-jabatan`,
            icon: Workflow,
            visible: access.viewMasterData,
            keywords: "pos jabatan bagan org chart slot vacant kosong atasan fungsional",
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
    match: (p) => p.startsWith("/profil") || p.startsWith("/notifikasi") || p.startsWith("/ess"),
    visible: () => true,
    inTopNav: false,
    sections: [
      {
        id: "me",
        label: "Akun Saya",
        items: [
          { id: "profile", label: "Profil", to: "/profil", icon: UserRound },
          { id: "notifications", label: "Notifikasi", to: "/notifikasi", icon: Bell },
          {
            id: "ess",
            label: "Layanan Mandiri",
            to: "/ess",
            icon: Clock,
            keywords: "ess absensi cuti slip gaji",
          },
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
        // Induk berlipat tidak punya halaman sendiri: `to`-nya = salah satu anak, jadi anak yang dipilih.
        if (!item.children?.length) consider({ group, section, item }, item.to);
        for (const child of item.children ?? [])
          consider({ group, section, item, child }, child.to);
      }
    }
  }
  // Rute turunan tanpa item sendiri (mis. slug tak dikenal) tetap ikut "Semua Karyawan Aktif".
  if (!best && pathname.startsWith(ACTIVE_BASE)) {
    const group = groups.find((g) => g.id === "personal");
    const section = group?.sections.find((s) => s.id === "active");
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
