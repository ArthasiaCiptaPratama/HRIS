import { isRouteErrorResponse, useRouteError } from "react-router";

// Pesan generik untuk pengguna; detail teknis tidak ditampilkan di UI.
export function ErrorPage() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error)
    ? `Terjadi kesalahan (${error.status})`
    : "Terjadi kesalahan";

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-2 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm">
        Silakan muat ulang halaman atau coba lagi nanti.
      </p>
    </div>
  );
}
