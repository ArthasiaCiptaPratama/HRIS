import {
  CATEGORIES_BY_GROUP,
  EMPLOYMENT_CATEGORY_GROUP_LABELS,
  EMPLOYMENT_CATEGORY_GROUPS,
  EMPLOYMENT_CATEGORY_LABELS,
  type EmploymentCategory,
  type EmploymentCategoryGroup,
} from "@hris/shared";
import type { EmployeeSummary } from "./schemas";

// D-038: tampilan "Data Karyawan Aktif" = semua · grup (Internal / Magang / Eksternal) · kategori.
// Satu sumber untuk sidebar, judul & chip halaman, filter API (`category` / `group`), dan badge jumlah.

export const ACTIVE_BASE = "/personal/pegawai-aktif";

export interface ActiveFilter {
  category?: EmploymentCategory;
  group?: EmploymentCategoryGroup;
}

export interface ActiveView {
  slug: string;
  /** Label di sidebar & chip. */
  label: string;
  description: string;
  filter: ActiveFilter;
}

export const CATEGORY_SLUGS: Record<EmploymentCategory, string> = {
  PERMANENT: "tetap",
  PROBATION: "percobaan",
  PKWT: "pkwt",
  DAILY_WORKER: "harian",
  INTERNSHIP: "magang",
  OUTSOURCING: "outsourcing",
  VENDOR: "vendor",
};

/** Slug tampilan "semua" per grup; grup berisi satu kategori (Magang) tidak punya tampilan gabungan. */
const GROUP_SLUGS: Partial<Record<EmploymentCategoryGroup, string>> = {
  INTERNAL: "internal",
  EXTERNAL: "eksternal",
};

/** Slug lama (D-035) → slug baru, supaya tautan tersimpan tetap berfungsi. */
export const LEGACY_SLUGS: Record<string, string> = {
  internship: "magang",
  "daily-worker": "harian",
};

const CATEGORY_DESCRIPTIONS: Record<EmploymentCategory, string> = {
  PERMANENT: "Karyawan dengan perjanjian kerja waktu tidak tertentu (PKWTT).",
  PROBATION: "Karyawan yang sedang menjalani masa percobaan.",
  PKWT: "Karyawan kontrak dengan perjanjian kerja waktu tertentu.",
  DAILY_WORKER: "Pekerja harian lepas.",
  INTERNSHIP: "Peserta program magang yang sedang aktif.",
  OUTSOURCING: "Tenaga alih daya dari perusahaan penyedia jasa.",
  VENDOR: "Tenaga kerja dari vendor atau mitra penyedia layanan.",
};

const GROUP_ALL: Partial<Record<EmploymentCategoryGroup, { label: string; description: string }>> =
  {
    INTERNAL: {
      label: "Semua Karyawan Internal",
      description: "Seluruh karyawan internal: tetap, percobaan, PKWT, dan pekerja harian.",
    },
    EXTERNAL: {
      label: "Semua Tenaga Kerja Eksternal",
      description: "Seluruh tenaga kerja eksternal: outsourcing dan vendor.",
    },
  };

export const ALL_ACTIVE_VIEW: ActiveView = {
  slug: "semua",
  label: "Semua Karyawan Aktif",
  description: "Seluruh karyawan aktif dari semua kategori.",
  filter: {},
};

export function categoryView(category: EmploymentCategory): ActiveView {
  return {
    slug: CATEGORY_SLUGS[category],
    label: EMPLOYMENT_CATEGORY_LABELS[category],
    description: CATEGORY_DESCRIPTIONS[category],
    filter: { category },
  };
}

export interface ActiveGroupView {
  group: EmploymentCategoryGroup;
  label: string;
  /** Kategori dalam grup, lalu tampilan gabungan grup (bila ada). */
  views: ActiveView[];
  /** Tujuan saat grup dibuka dari breadcrumb / sidebar ciut. */
  to: string;
}

export const ACTIVE_GROUPS: ActiveGroupView[] = EMPLOYMENT_CATEGORY_GROUPS.map((group) => {
  const views = CATEGORIES_BY_GROUP[group].map(categoryView);
  const slug = GROUP_SLUGS[group];
  const all = GROUP_ALL[group];
  if (slug && all) views.push({ slug, ...all, filter: { group } });
  const last = views[views.length - 1] as ActiveView;
  return {
    group,
    label: EMPLOYMENT_CATEGORY_GROUP_LABELS[group],
    views,
    to: `${ACTIVE_BASE}/${last.slug}`,
  };
});

const VIEWS_BY_SLUG = new Map<string, ActiveView>(
  [ALL_ACTIVE_VIEW, ...ACTIVE_GROUPS.flatMap((g) => g.views)].map((view) => [view.slug, view]),
);

export function findActiveView(slug: string): ActiveView | undefined {
  return VIEWS_BY_SLUG.get(slug);
}

/** Chip di halaman: saudara dalam grup yang sama; di "semua" (atau grup satu kategori) → semua + tiap grup. */
export function siblingViews(view: ActiveView): ActiveView[] {
  const owner = ACTIVE_GROUPS.find((g) => g.views.some((v) => v.slug === view.slug));
  if (owner && owner.views.length > 1) return owner.views;
  return [
    ALL_ACTIVE_VIEW,
    ...ACTIVE_GROUPS.map((g) => {
      const last = g.views[g.views.length - 1] as ActiveView;
      return { ...last, label: g.label };
    }),
  ];
}

/** Jumlah karyawan aktif untuk satu tampilan, dari GET /employees/summary. */
export function activeCount(
  summary: EmployeeSummary | undefined,
  filter: ActiveFilter,
): number | undefined {
  if (!summary) return undefined;
  const { byCategory, total } = summary.active;
  if (filter.category) return byCategory[filter.category];
  if (filter.group)
    return CATEGORIES_BY_GROUP[filter.group].reduce((sum, c) => sum + (byCategory[c] ?? 0), 0);
  return total;
}
