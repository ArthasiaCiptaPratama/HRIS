import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { RequireAccess, RequireAccessRoute, RequireAuth } from "@/features/auth/components/guards";
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
    ErrorBoundary: ErrorPage,
    children: [
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
              { path: "struktur-organisasi", lazy: pages.orgStructure },
              {
                element: <RequireAccessRoute check={access.manageEmployees} />,
                children: [
                  { path: "ubah-status", lazy: pages.changeStatus },
                  { path: "pengaktifan", lazy: pages.activation },
                  { path: "pegawai-tidak-aktif", lazy: pages.inactiveEmployees },
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
