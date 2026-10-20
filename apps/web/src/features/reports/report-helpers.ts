import { useSearchParams } from "react-router";

// ARS-D16/D21: pembantu bersama tab Laporan (bukan komponen — dipisah supaya Fast Refresh tetap jalan).

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const JAKARTA_TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
  new Date(),
);
export const thisYear = Number(JAKARTA_TODAY.slice(0, 4));
export const thisMonth = Number(JAKARTA_TODAY.slice(5, 7));

/** Tab di panel detail karyawan (employee-detail-sheet). */
export type DetailTab =
  | "work"
  | "personal"
  | "documents"
  | "assets"
  | "warnings"
  | "bank"
  | "history";

/** Buka profil karyawan di panel (Back menutup panel). */
export function useOpenProfile() {
  const [, setParams] = useSearchParams();
  return (employeeId: string, tab: DetailTab) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("pegawai", employeeId);
      next.set("tab", tab);
      return next;
    });
}

export const scrollToId = (id: string) =>
  requestAnimationFrame(() =>
    document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
  );
export const personSearch = (p: { fullName: string; employeeNumber: string | null }) =>
  `${p.fullName} ${p.employeeNumber ?? ""}`;

export const sum = <T>(rows: readonly T[], value: (row: T) => number) =>
  rows.reduce((total, row) => total + value(row), 0);
export const maxOf = <T>(rows: readonly T[], value: (row: T) => number) =>
  Math.max(0, ...rows.map(value));
