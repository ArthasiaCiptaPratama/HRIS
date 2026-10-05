import { getPrisma } from "../../src/core/db.ts";

// D-039: ACP dibuat migrasi (data referensi) sehingga selalu ada — DB developer maupun CI kosong.
let acp: string | undefined;

export async function acpCompanyId(): Promise<string> {
  acp ??= (await getPrisma().company.findUniqueOrThrow({ where: { code: "ACP" } })).id;
  return acp;
}

/** Perusahaan uji tambahan (D-040); hapus lewat `deleteTestCompanies(prefix)` setelah karyawannya. */
export async function createTestCompany(code: string, name: string): Promise<string> {
  return (await getPrisma().company.create({ data: { code, name } })).id;
}
