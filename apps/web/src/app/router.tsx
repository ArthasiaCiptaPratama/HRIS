import { createBrowserRouter, type RouteObject } from "react-router";
import { ErrorPage } from "@/features/system/pages/error-page";
import { HomePage } from "@/features/system/pages/home-page";
import { NotFoundPage } from "@/features/system/pages/not-found-page";
import { AppLayout } from "./layout/app-layout";

// Guard per role ditambahkan di Fase 2.
export const routes: RouteObject[] = [
  {
    path: "/",
    Component: AppLayout,
    ErrorBoundary: ErrorPage,
    children: [
      { index: true, Component: HomePage },
      { path: "*", Component: NotFoundPage },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
