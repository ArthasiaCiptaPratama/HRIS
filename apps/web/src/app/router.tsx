import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import {
  RequireAccess,
  RequireAccessRoute,
  RequireAuth,
  RouteHydrateFallback,
} from "@/features/auth/components/guards";
import { AuthCallbackPage } from "@/features/auth/pages/auth-callback-page";
import { ForgotPasswordPage } from "@/features/auth/pages/forgot-password-page";
import { LoginPage } from "@/features/auth/pages/login-page";
import { SetPasswordPage } from "@/features/auth/pages/set-password-page";
import { AccountsPage } from "@/features/iam/pages/accounts-page";
import { AuditLogsPage } from "@/features/iam/pages/audit-logs-page";
import { GrantsPage } from "@/features/iam/pages/grants-page";
import { ProfilePage } from "@/features/iam/pages/profile-page";
import { NotificationsPage } from "@/features/notification/pages/notifications-page";
import { ErrorPage } from "@/features/system/pages/error-page";
import { NotFoundPage } from "@/features/system/pages/not-found-page";
import { tmAccess } from "@/features/time-management/access";
import { access } from "@/lib/access";
import { FEATURES } from "./feature-flags";
import { AppLayout } from "./layout/app-layout";
import { pages } from "./route-preload";

export const routes: RouteObject[] = [
  { path: "/login", Component: LoginPage, ErrorBoundary: ErrorPage },
  { path: "/lupa-password", Component: ForgotPasswordPage, ErrorBoundary: ErrorPage },
  { path: "/auth/callback", Component: AuthCallbackPage, ErrorBoundary: ErrorPage },
  { path: "/auth/atur-password", Component: SetPasswordPage, ErrorBoundary: ErrorPage },
  {
    // Semua halaman di bawah ini butuh sesi + akun aktif (GET /me); guard hanya kenyamanan UI.
    Component: RequireAuth,
    HydrateFallback: RouteHydrateFallback,
    ErrorBoundary: ErrorPage,
    children: [
      // D-045 b: wizard isi data (halaman mandiri; calon terkunci di sini sampai disetujui).
      { path: "/onboarding", lazy: pages.onboardingWizard },
      // D-067: absen PWA (tata letak HP, tanpa kerangka web; dipasang ke layar utama).
      // Aplikasi HP: semua menu absen di dalam shell HP yang sama (siap dibungkus jadi aplikasi HP).
      {
        path: "/absen",
        element: <RequireAccessRoute check={tmAccess.punch} />,
        children: FEATURES.timeManagement
          ? [
              {
                lazy: pages.mobileShell,
                children: [
                  { index: true, lazy: pages.absen },
                  { path: "riwayat", lazy: pages.mobileHistory },
                  { path: "roster", lazy: pages.mobileRoster },
                  { path: "cuti", lazy: pages.leave },
                  { path: "koreksi", lazy: pages.correctionsStatements },
                  { path: "tukar-shift", lazy: pages.rosterChanges },
                  { path: "kalender", lazy: pages.holidays },
                  {
                    path: "approval",
                    element: (
                      <RequireAccessRoute
                        check={(me) => tmAccess.reviewDays(me) || tmAccess.decideLeave(me)}
                      />
                    ),
                    children: [{ index: true, lazy: pages.mobileApprovals }],
                  },
                  { path: "notifikasi", lazy: pages.mobileNotifications },
                  { path: "profil", lazy: pages.mobileProfile },
                  { path: "*", element: <Navigate to="/absen" replace /> },
                ],
              },
            ]
          : [{ index: true, lazy: pages.maintenance }],
      },
      {
        path: "/",
        Component: AppLayout,
        children: [
          { index: true, lazy: pages.dashboard },
          {
            // D-035 Personal Management: SA & HR penuh; MANAGER baca tim (API tetap sumber kebenaran).
            path: "personal",
            element: <RequireAccessRoute check={access.personalMenu} />,
            children: [
              { index: true, element: <Navigate to="pegawai-aktif/semua" replace /> },
              { path: "pegawai-aktif", element: <Navigate to="semua" replace /> },
              { path: "pegawai-aktif/:category", lazy: pages.activeEmployees },
              // D-054: Arsip — tabel lintas karyawan (MANAGER: tim, kolom kerja; API penentu akses).
              // ARS-D1–D6: Arsip › Data Assets (SA/HR/MANAGER; harga & kelola dicek API).
              {
                path: "arsip/aset",
                element: <RequireAccessRoute check={access.viewAssets} />,
                children: [
                  { index: true, lazy: FEATURES.assets ? pages.assets : pages.maintenance },
                ],
              },
              // D-057, ARS-D7–D13: Arsip › Riwayat Peringatan (SA / HR ber-grant SP / MANAGER tim).
              {
                path: "arsip/peringatan",
                element: <RequireAccessRoute check={access.viewWarningLetters} />,
                children: [
                  {
                    index: true,
                    lazy: FEATURES.discipline ? pages.warningLetters : pages.maintenance,
                  },
                ],
              },
              {
                path: "arsip/:section",
                lazy: FEATURES.archive ? pages.archive : pages.maintenance,
              },
              {
                path: "struktur-organisasi",
                lazy: FEATURES.orgStructure ? pages.orgStructure : pages.maintenance,
              },
              {
                element: <RequireAccessRoute check={access.manageEmployees} />,
                children: [
                  {
                    path: "ubah-status",
                    lazy: FEATURES.changeStatus ? pages.changeStatus : pages.maintenance,
                  },
                  // D-042: import data karyawan dari .xlsx/.csv (dibuka dari Data Karyawan Aktif).
                  { path: "import", lazy: pages.importEmployees },
                  {
                    path: "pengaktifan",
                    lazy: FEATURES.activation ? pages.activation : pages.maintenance,
                  },
                  {
                    path: "pegawai-tidak-aktif",
                    lazy: FEATURES.inactiveEmployees ? pages.inactiveEmployees : pages.maintenance,
                  },
                  // ARS-D16: Laporan batch 1 (SA & HR; cakupan PT & grant dicek API).
                  {
                    path: "laporan",
                    element: <RequireAccessRoute check={access.viewReports} />,
                    children: [
                      { index: true, lazy: FEATURES.reports ? pages.reports : pages.maintenance },
                    ],
                  },
                ],
              },
            ],
          },
          {
            path: "akun",
            element: (
              <RequireAccess check={access.listAccounts}>
                <AccountsPage />
              </RequireAccess>
            ),
          },
          {
            path: "grant",
            element: (
              <RequireAccess check={access.manageGrants}>
                <GrantsPage />
              </RequireAccess>
            ),
          },
          {
            path: "audit",
            element: (
              <RequireAccess check={access.readAuditLogs}>
                <AuditLogsPage />
              </RequireAccess>
            ),
          },
          {
            // D-045: Administrasi › Penerimaan Karyawan Baru (SA & HR).
            path: "penerimaan",
            element: <RequireAccessRoute check={access.runOnboarding} />,
            children: [
              { index: true, lazy: FEATURES.onboarding ? pages.onboarding : pages.maintenance },
              {
                path: "impor",
                lazy: FEATURES.onboarding ? pages.onboardingImport : pages.maintenance,
              },
              {
                // D-045 c: review isian calon (SA / HR + grant; cakupan PT dicek API).
                path: ":employeeId",
                element: <RequireAccessRoute check={access.reviewOnboarding} />,
                children: [
                  {
                    index: true,
                    lazy: FEATURES.onboarding ? pages.onboardingReview : pages.maintenance,
                  },
                ],
              },
            ],
          },
          {
            // D-049: Administrasi › Master Data (SA kelola, HR lihat).
            path: "master-data",
            element: <RequireAccessRoute check={access.viewMasterData} />,
            children: [
              { index: true, element: <Navigate to="perusahaan" replace /> },
              // D-051: pos jabatan (bagan organisasi).
              { path: "pos-jabatan", lazy: pages.orgPosts },
              // D-055: jenis dokumen karyawan.
              {
                path: "jenis-dokumen",
                lazy: FEATURES.archive ? pages.documentTypes : pages.maintenance,
              },
              // ARS-D1: kategori aset & jenis APD (kelola SA / HR ber-grant asset.manage).
              { path: "aset", lazy: FEATURES.assets ? pages.assetMasters : pages.maintenance },
              // ARS-D8/D12: jenis pelanggaran SP + masa berlaku bawaan (SA / HR ber-grant SP).
              {
                path: "jenis-pelanggaran",
                element: <RequireAccessRoute check={access.viewDisciplineMasters} />,
                children: [
                  {
                    index: true,
                    lazy: FEATURES.discipline ? pages.violationTypes : pages.maintenance,
                  },
                ],
              },
              { path: ":kind", lazy: pages.masterData },
            ],
          },
          {
            // D-054 / OD-6: Administrasi › Pengajuan Perubahan Data (SA / HR ber-grant).
            path: "pengajuan-data",
            element: <RequireAccessRoute check={access.reviewDataChanges} />,
            children: [
              { index: true, lazy: FEATURES.selfService ? pages.dataChanges : pages.maintenance },
            ],
          },
          {
            // D-067–D-071: Time Management (API tetap sumber kebenaran untuk cakupan PT/tim).
            path: "time",
            children: [
              { index: true, element: <Navigate to="roster" replace /> },
              {
                element: <RequireAccessRoute check={tmAccess.reviewDays} />,
                children: [
                  {
                    path: "absen-harian",
                    lazy: FEATURES.timeManagement ? pages.attendanceDays : pages.maintenance,
                  },
                ],
              },
              {
                element: <RequireAccessRoute check={tmAccess.viewRoster} />,
                children: [
                  {
                    path: "roster",
                    lazy: FEATURES.timeManagement ? pages.roster : pages.maintenance,
                  },
                ],
              },
              {
                element: <RequireAccessRoute check={tmAccess.manageRoster} />,
                children: [
                  {
                    path: "roster/pengaturan",
                    lazy: FEATURES.timeManagement ? pages.rosterSetup : pages.maintenance,
                  },
                ],
              },
              {
                // TM-D1: lokasi absen per karyawan.
                element: <RequireAccessRoute check={tmAccess.manageAttendanceLocations} />,
                children: [
                  {
                    path: "lokasi-absen",
                    lazy: FEATURES.timeManagement ? pages.locationSettings : pages.maintenance,
                  },
                ],
              },
              {
                element: <RequireAccessRoute check={tmAccess.rosterChanges} />,
                children: [
                  {
                    path: "perubahan-roster",
                    lazy: FEATURES.timeManagement ? pages.rosterChanges : pages.maintenance,
                  },
                ],
              },
              {
                element: <RequireAccessRoute check={tmAccess.requestLeave} />,
                children: [
                  { path: "cuti", lazy: FEATURES.timeManagement ? pages.leave : pages.maintenance },
                ],
              },
              {
                element: <RequireAccessRoute check={tmAccess.decideLeave} />,
                children: [
                  {
                    path: "persetujuan-cuti",
                    lazy: FEATURES.timeManagement ? pages.leaveApprovals : pages.maintenance,
                  },
                ],
              },
              {
                element: <RequireAccessRoute check={tmAccess.manageLeaveBalances} />,
                children: [
                  {
                    path: "saldo-cuti",
                    lazy: FEATURES.timeManagement ? pages.leaveBalances : pages.maintenance,
                  },
                ],
              },
              {
                element: <RequireAccessRoute check={tmAccess.correctionsStatements} />,
                children: [
                  {
                    path: "pernyataan",
                    lazy: FEATURES.timeManagement ? pages.correctionsStatements : pages.maintenance,
                  },
                ],
              },
              {
                element: <RequireAccessRoute check={tmAccess.viewRecap} />,
                children: [
                  {
                    path: "rekap",
                    lazy: FEATURES.timeManagement ? pages.recap : pages.maintenance,
                  },
                ],
              },
              {
                path: "master-cuti",
                lazy: FEATURES.timeManagement ? pages.leaveMaster : pages.maintenance,
              },
              {
                path: "kalender",
                lazy: FEATURES.timeManagement ? pages.holidays : pages.maintenance,
              },
              {
                element: <RequireAccessRoute check={tmAccess.viewSettings} />,
                children: [
                  {
                    path: "pengaturan",
                    lazy: FEATURES.timeManagement ? pages.timeSettings : pages.maintenance,
                  },
                ],
              },
            ],
          },
          // D-045 c: Layanan Mandiri (placeholder sampai Time Management).
          { path: "ess", lazy: FEATURES.selfService ? pages.ess : pages.maintenance },
          { path: "notifikasi", Component: NotificationsPage },
          { path: "profil", Component: ProfilePage },
          { path: "*", Component: NotFoundPage },
        ],
      },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
