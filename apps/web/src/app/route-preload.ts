import { FEATURES } from "./feature-flags";

// Code splitting per halaman (React Router `lazy`) + preload saat kursor di atas menu, supaya
// bundle awal kecil tetapi perpindahan halaman tetap terasa instan.

export const pages = {
  dashboard: () =>
    import("@/features/system/pages/dashboard-page").then((m) => ({ Component: m.DashboardPage })),
  maintenance: () =>
    import("@/features/system/pages/maintenance-page").then((m) => ({
      Component: m.MaintenancePage,
    })),
  activeEmployees: () =>
    import("@/features/employee/pages/active-employees-page").then((m) => ({
      Component: m.ActiveEmployeesPage,
    })),
  changeStatus: () =>
    import("@/features/employee/pages/change-status-page").then((m) => ({
      Component: m.ChangeStatusPage,
    })),
  importEmployees: () =>
    import("@/features/employee/import/import-page").then((m) => ({
      Component: m.ImportEmployeesPage,
    })),
  activation: () =>
    import("@/features/employee/pages/activation-page").then((m) => ({
      Component: m.ActivationPage,
    })),
  inactiveEmployees: () =>
    import("@/features/employee/pages/inactive-employees-page").then((m) => ({
      Component: m.InactiveEmployeesPage,
    })),
  onboarding: () =>
    import("@/features/onboarding/pages/onboarding-page").then((m) => ({
      Component: m.OnboardingPage,
    })),
  onboardingImport: () =>
    import("@/features/onboarding/pages/onboarding-import-page").then((m) => ({
      Component: m.OnboardingImportPage,
    })),
  onboardingReview: () =>
    import("@/features/onboarding/pages/onboarding-review-page").then((m) => ({
      Component: m.OnboardingReviewPage,
    })),
  ess: () => import("@/features/ess/pages/ess-page").then((m) => ({ Component: m.EssPage })),
  onboardingWizard: () =>
    import("@/features/onboarding/pages/onboarding-wizard-page").then((m) => ({
      Component: m.OnboardingWizardPage,
    })),
  masterData: () =>
    import("@/features/organization/pages/master-data-page").then((m) => ({
      Component: m.MasterDataPage,
    })),
  archive: () =>
    import("@/features/archive/pages/archive-page").then((m) => ({ Component: m.ArchivePage })),
  orgPosts: () =>
    import("@/features/organization/pages/org-posts-page").then((m) => ({
      Component: m.OrgPostsPage,
    })),
  orgStructure: () =>
    import("@/features/employee/pages/org-structure-page").then((m) => ({
      Component: m.OrgStructurePage,
    })),
};

const PRELOAD: [prefix: string, load: () => Promise<unknown>][] = [
  ["/personal/pegawai-aktif", pages.activeEmployees],
  ["/personal/ubah-status", FEATURES.changeStatus ? pages.changeStatus : pages.maintenance],
  ["/personal/import", pages.importEmployees],
  ["/personal/pengaktifan", FEATURES.activation ? pages.activation : pages.maintenance],
  [
    "/personal/pegawai-tidak-aktif",
    FEATURES.inactiveEmployees ? pages.inactiveEmployees : pages.maintenance,
  ],
  ["/personal/struktur-organisasi", FEATURES.orgStructure ? pages.orgStructure : pages.maintenance],
  ["/personal/arsip", pages.archive],
  ["/personal/laporan", pages.maintenance],
  ["/master-data/pos-jabatan", pages.orgPosts],
  ["/master-data", pages.masterData],
  ["/penerimaan/impor", pages.onboardingImport],
  ["/penerimaan/", pages.onboardingReview],
  ["/penerimaan", pages.onboarding],
  ["/ess", pages.ess],
];

export function preloadRoute(path: string): void {
  const hit = PRELOAD.find(([prefix]) => path.startsWith(prefix));
  if (hit) void hit[1]().catch(() => undefined);
}
