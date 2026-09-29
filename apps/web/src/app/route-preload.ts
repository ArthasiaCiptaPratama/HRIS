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
  activation: () =>
    import("@/features/employee/pages/activation-page").then((m) => ({
      Component: m.ActivationPage,
    })),
  inactiveEmployees: () =>
    import("@/features/employee/pages/inactive-employees-page").then((m) => ({
      Component: m.InactiveEmployeesPage,
    })),
  orgStructure: () =>
    import("@/features/employee/pages/org-structure-page").then((m) => ({
      Component: m.OrgStructurePage,
    })),
};

const PRELOAD: [prefix: string, load: () => Promise<unknown>][] = [
  ["/personal/pegawai-aktif", pages.activeEmployees],
  ["/personal/ubah-status", pages.changeStatus],
  ["/personal/pengaktifan", pages.activation],
  ["/personal/pegawai-tidak-aktif", pages.inactiveEmployees],
  ["/personal/struktur-organisasi", pages.orgStructure],
  ["/personal/arsip", pages.maintenance],
  ["/personal/laporan", pages.maintenance],
];

export function preloadRoute(path: string): void {
  const hit = PRELOAD.find(([prefix]) => path.startsWith(prefix));
  if (hit) void hit[1]().catch(() => undefined);
}
