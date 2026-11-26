import type { EmploymentCategory } from "@hris/shared";
import type { ContractDialogAction } from "./components/employment-contract-dialog";

/**
 * KTR-D14 (2026-11-26, "ikutin best practice aja"): semua perubahan status — aksi kontrak, ubah
 * kategori, nonaktifkan — di halaman Ubah Status. Tautan dari profil membawa `aksi` + `kembali`.
 */
export type StatusPageAction =
  | "kategori"
  | "nonaktif"
  | "isi-tahap"
  | "perpanjang"
  | "tetap"
  | "lulus"
  | "tidak-lulus"
  | "akhiri";

export const CONTRACT_ACTION_OF: Partial<Record<StatusPageAction, ContractDialogAction>> = {
  "isi-tahap": "create",
  perpanjang: "extend",
  tetap: "promote",
  lulus: "promote",
  "tidak-lulus": "fail",
  akhiri: "end",
};

/** Tautan ke halaman Ubah Status dengan karyawan + aksi terisi; `kembali` = halaman asal. */
export function changeStatusLink(employeeId: string, action: StatusPageAction, back?: string) {
  const params = new URLSearchParams({ pegawai: employeeId, aksi: action });
  if (back) params.set("kembali", back);
  return `/personal/ubah-status?${params}`;
}

/** Slug URL untuk aksi kontrak kartu (Perpanjang, Jadikan Karyawan Tetap, …). */
export function statusPageActionOf(
  action: ContractDialogAction,
  category: EmploymentCategory | null,
): StatusPageAction | null {
  if (action === "create") return "isi-tahap";
  if (action === "extend") return "perpanjang";
  if (action === "promote") return category === "PROBATION" ? "lulus" : "tetap";
  if (action === "fail") return "tidak-lulus";
  if (action === "end") return "akhiri";
  return null;
}
