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
                  { path: "arsip/:section", lazy: pages.maintenance },
                  { path: "laporan", lazy: pages.maintenance },
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
              { index: true, lazy: pages.onboarding },
              { path: "impor", lazy: pages.onboardingImport },
              {
                // D-045 c: review isian calon (SA / HR + grant; cakupan PT dicek API).
                path: ":employeeId",
                element: <RequireAccessRoute check={access.reviewOnboarding} />,
                children: [{ index: true, lazy: pages.onboardingReview }],
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
              { path: ":kind", lazy: pages.masterData },
            ],
          },
          // D-045 c: Layanan Mandiri (placeholder sampai Time Management).
          { path: "ess", lazy: pages.ess },
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
