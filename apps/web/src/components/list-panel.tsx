import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Kartu daftar bersama (gaya daftar pegawai): bilah filter di atas, tabel, paginasi di bawah. */
export function ListPanel({
  toolbar,
  footer,
  children,
  className,
}: {
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card animate-fade-up overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgb(24_24_27/0.04),0_12px_32px_-16px_rgb(24_24_27/0.08)]",
        className,
      )}
    >
      {toolbar ? (
        <div className="flex flex-col gap-3 border-b p-3 sm:p-4 lg:flex-row lg:items-center">
          {toolbar}
        </div>
      ) : null}
      {children}
      {footer ? <div className="border-t">{footer}</div> : null}
    </div>
  );
}
