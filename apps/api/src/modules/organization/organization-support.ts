import type { Actor } from "../../core/access/index.ts";
import type { OrganizationTx } from "./organization.repository.ts";

// D-049/D-051: organization tidak membaca tabel employee (PLAN §3.2.4). Jumlah pemakai, pemindahan
// rujukan saat gabungkan, dan urusan pemegang pos disuntikkan dari modul employee (app.ts).

export type MasterRefKind = "company" | "position" | "status" | "grade" | "location";

export interface EmployeeMasterDataSupport {
  countByMasterRef(kind: MasterRefKind): Promise<Map<string, { active: number; total: number }>>;
  reassignMasterRef(
    tx: OrganizationTx,
    kind: Exclude<MasterRefKind, "company">,
    fromId: string,
    toId: string,
  ): Promise<{ employees: number; histories: number }>;
  /** D-051: jumlah karyawan aktif yang menempati tiap pos. */
  countPostHolders(tx?: OrganizationTx): Promise<Map<string, number>>;
  /** D-051: PT para pemegang pos tertentu (untuk aturan PT unit, D-052). */
  postHolderCompanies(tx: OrganizationTx, postIds: string[]): Promise<string[]>;
  /** D-053: hitung ulang atasan otomatis semua pemegang pos; mengembalikan jumlah yang berubah. */
  syncPostManagers(tx: OrganizationTx): Promise<number>;
}

let support: EmployeeMasterDataSupport | undefined;

export function configureOrganization(next: { employeeSupport: EmployeeMasterDataSupport }): void {
  support = next.employeeSupport;
}

export function employeeSupport(): EmployeeMasterDataSupport {
  // Gagal tertutup: tanpa konfigurasi, jumlah pemakai & gabungkan tidak bisa dipastikan benar.
  if (!support) throw new Error("organization: employeeSupport belum dikonfigurasi");
  return support;
}

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}
