import { FEATURES, tmOn } from "./feature-flags";

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
  createEmployee: () =>
    import("@/features/employee/create/employee-create-page").then((m) => ({
      Component: m.EmployeeCreatePage,
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
  dataChanges: () =>
    import("@/features/data-changes/pages/data-changes-page").then((m) => ({
      Component: m.DataChangesPage,
    })),
  assets: () =>
    import("@/features/assets/pages/assets-page").then((m) => ({ Component: m.AssetsPage })),
  reports: () =>
    import("@/features/reports/pages/reports-page").then((m) => ({ Component: m.ReportsPage })),
  warningLetters: () =>
    import("@/features/discipline/pages/warning-letters-page").then((m) => ({
      Component: m.WarningLettersPage,
    })),
  violationTypes: () =>
    import("@/features/discipline/pages/violation-types-page").then((m) => ({
      Component: m.ViolationTypesPage,
    })),
  assetMasters: () =>
    import("@/features/assets/pages/asset-masters-page").then((m) => ({
      Component: m.AssetMastersPage,
    })),
  documentTypes: () =>
    import("@/features/documents/pages/document-types-page").then((m) => ({
      Component: m.DocumentTypesPage,
    })),
  orgStructure: () =>
    import("@/features/employee/pages/org-structure-page").then((m) => ({
      Component: m.OrgStructurePage,
    })),
  // Time Management (D-067–D-071).
  absen: () =>
    import("@/features/time-management/pages/absen-page").then((m) => ({ Component: m.AbsenHome })),
  // Aplikasi HP (/absen/*): shell + halaman khusus HP.
  mobileShell: () =>
    import("@/features/time-management/pages/absen-page").then((m) => ({
      Component: m.MobileShell,
    })),
  mobileHistory: () =>
    import("@/features/time-management/pages/mobile-pages").then((m) => ({
      Component: m.MobileHistoryPage,
    })),
  mobileRoster: () =>
    import("@/features/time-management/pages/mobile-pages").then((m) => ({
      Component: m.MobileRosterPage,
    })),
  mobileApprovals: () =>
    import("@/features/time-management/pages/mobile-pages").then((m) => ({
      Component: m.MobileApprovalsPage,
    })),
  mobileNotifications: () =>
    import("@/features/time-management/pages/mobile-pages").then((m) => ({
      Component: m.MobileNotificationsPage,
    })),
  mobileProfile: () =>
    import("@/features/time-management/pages/mobile-pages").then((m) => ({
      Component: m.MobileProfilePage,
    })),
  attendanceDays: () =>
    import("@/features/time-management/pages/attendance-days-page").then((m) => ({
      Component: m.AttendanceDaysPage,
    })),
  roster: () =>
    import("@/features/time-management/pages/roster-page").then((m) => ({
      Component: m.RosterPage,
    })),
  rosterSetup: () =>
    import("@/features/time-management/pages/roster-setup-page").then((m) => ({
      Component: m.RosterSetupPage,
    })),
  overtime: () =>
    import("@/features/time-management/pages/overtime-pages").then((m) => ({
      Component: m.OvertimePage,
    })),
  gradeWages: () =>
    import("@/features/time-management/pages/overtime-pages").then((m) => ({
      Component: m.GradeWagesPage,
    })),
  locationSettings: () =>
    import("@/features/time-management/pages/location-settings-page").then((m) => ({
      Component: m.LocationSettingsPage,
    })),
  rosterChanges: () =>
    import("@/features/time-management/pages/roster-changes-page").then((m) => ({
      Component: m.RosterChangesPage,
    })),
  holidays: () =>
    import("@/features/time-management/pages/calendar-settings-pages").then((m) => ({
      Component: m.HolidaysPage,
    })),
  leave: () =>
    import("@/features/time-management/pages/leave-page").then((m) => ({ Component: m.LeavePage })),
  leaveApprovals: () =>
    import("@/features/time-management/pages/leave-admin-pages").then((m) => ({
      Component: m.LeaveApprovalsPage,
    })),
  leaveBalances: () =>
    import("@/features/time-management/pages/leave-admin-pages").then((m) => ({
      Component: m.LeaveBalancesPage,
    })),
  leaveMaster: () =>
    import("@/features/time-management/pages/leave-admin-pages").then((m) => ({
      Component: m.LeaveMasterPage,
    })),
  correctionsStatements: () =>
    import("@/features/time-management/pages/period-pages").then((m) => ({
      Component: m.CorrectionsStatementsPage,
    })),
  recap: () =>
    import("@/features/time-management/pages/period-pages").then((m) => ({
      Component: m.RecapPage,
    })),
  timeSettings: () =>
    import("@/features/time-management/pages/calendar-settings-pages").then((m) => ({
      Component: m.TimeSettingsPage,
    })),
};

const PRELOAD: [prefix: string, load: () => Promise<unknown>][] = [
  ["/personal/pegawai-aktif", pages.activeEmployees],
  ["/personal/ubah-status", FEATURES.changeStatus ? pages.changeStatus : pages.maintenance],
  ["/personal/import", pages.importEmployees],
  ["/personal/tambah-karyawan", pages.createEmployee],
  ["/personal/pengaktifan", FEATURES.activation ? pages.activation : pages.maintenance],
  [
    "/personal/pegawai-tidak-aktif",
    FEATURES.inactiveEmployees ? pages.inactiveEmployees : pages.maintenance,
  ],
  ["/personal/struktur-organisasi", FEATURES.orgStructure ? pages.orgStructure : pages.maintenance],
  ["/personal/arsip/aset", FEATURES.assets ? pages.assets : pages.maintenance],
  ["/personal/arsip/peringatan", FEATURES.discipline ? pages.warningLetters : pages.maintenance],
  ["/personal/arsip", FEATURES.archive ? pages.archive : pages.maintenance],
  ["/personal/laporan", FEATURES.reports ? pages.reports : pages.maintenance],
  ["/master-data/pos-jabatan", pages.orgPosts],
  ["/master-data/jenis-dokumen", FEATURES.archive ? pages.documentTypes : pages.maintenance],
  ["/master-data/aset", FEATURES.assets ? pages.assetMasters : pages.maintenance],
  [
    "/master-data/jenis-pelanggaran",
    FEATURES.discipline ? pages.violationTypes : pages.maintenance,
  ],
  ["/master-data", pages.masterData],
  ["/penerimaan/impor", FEATURES.onboarding ? pages.onboardingImport : pages.maintenance],
  ["/penerimaan/", FEATURES.onboarding ? pages.onboardingReview : pages.maintenance],
  ["/penerimaan", FEATURES.onboarding ? pages.onboarding : pages.maintenance],
  ["/ess", FEATURES.selfService ? pages.ess : pages.maintenance],
  ["/pengajuan-data", FEATURES.selfService ? pages.dataChanges : pages.maintenance],
  ["/time/absen-harian", tmOn("tmAttendanceDays") ? pages.attendanceDays : pages.maintenance],
  ["/time/roster/pengaturan", tmOn("tmRosterSetup") ? pages.rosterSetup : pages.maintenance],
  [
    "/time/lokasi-absen",
    tmOn("tmAttendanceLocations") ? pages.locationSettings : pages.maintenance,
  ],
  ["/time/roster", tmOn("tmRoster") ? pages.roster : pages.maintenance],
  ["/time/perubahan-roster", tmOn("tmRosterChanges") ? pages.rosterChanges : pages.maintenance],
  ["/time/kalender", tmOn("tmHolidays") ? pages.holidays : pages.maintenance],
  ["/time/pengaturan", tmOn("tmSettings") ? pages.timeSettings : pages.maintenance],
  ["/time/cuti", tmOn("tmLeave") ? pages.leave : pages.maintenance],
  ["/time/persetujuan-cuti", tmOn("tmLeaveApprovals") ? pages.leaveApprovals : pages.maintenance],
  ["/time/saldo-cuti", tmOn("tmLeaveBalances") ? pages.leaveBalances : pages.maintenance],
  ["/time/master-cuti", tmOn("tmLeaveMaster") ? pages.leaveMaster : pages.maintenance],
  ["/time/pernyataan", tmOn("tmCorrections") ? pages.correctionsStatements : pages.maintenance],
  ["/time/rekap", tmOn("tmRecap") ? pages.recap : pages.maintenance],
  ["/absen", tmOn("tmAbsen") ? pages.absen : pages.maintenance],
];

export function preloadRoute(path: string): void {
  const hit = PRELOAD.find(([prefix]) => path.startsWith(prefix));
  if (hit) void hit[1]().catch(() => undefined);
}
