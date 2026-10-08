import { resolvePostManagers } from "@hris/shared";
import { BusinessRuleError } from "../../core/errors.ts";
import { listManagerEmployeeIds } from "../iam/index.ts";
import { getMasterLookup, listOrgPosts } from "../organization/index.ts";
import type { EmployeeTx } from "./employee.repository.ts";
import * as repository from "./org-chart.repository.ts";

// D-051/D-053: penempatan karyawan ke pos jabatan & atasan langsung otomatis dari pos.
// Dipakai employee.service (tulis) & app.ts (hook organization) — tidak meng-import employee.service.

/**
 * Atasan otomatis semua pemegang pos dihitung ulang (bagan kecil: ratusan baris). Karyawan dengan
 * `managerOverride` tidak disentuh. Mengembalikan jumlah karyawan yang atasannya berubah.
 */
export async function syncPostManagers(tx: EmployeeTx): Promise<number> {
  const [posts, holders, eligible] = await Promise.all([
    listOrgPosts(tx),
    repository.listPostHolders(tx),
    listManagerEmployeeIds(),
  ]);
  const active = posts.filter((post) => !post.archived);
  const desired = resolvePostManagers({
    posts: active,
    holders: holders.flatMap((h) =>
      h.orgPostId ? [{ employeeId: h.id, postId: h.orgPostId }] : [],
    ),
    eligibleManagers: new Set(eligible),
  });
  let updated = 0;
  for (const holder of holders) {
    if (holder.managerOverride) continue;
    const next = desired.get(holder.id) ?? null;
    if (next !== holder.managerId) {
      await repository.setManager(tx, holder.id, next);
      updated += 1;
    }
  }
  return updated;
}

/**
 * D-052: jabatan milik unit PT lain tidak boleh dipakai karyawan PT ini (unit tanpa PT = lintas grup).
 */
export async function assertPositionCompany(positionId: string, companyId: string) {
  const lookup = await getMasterLookup();
  const position = lookup.positions.get(positionId);
  const unit = position ? lookup.departments.get(position.departmentId) : undefined;
  if (unit?.companyId && unit.companyId !== companyId) {
    throw new BusinessRuleError(
      "Jabatan ini milik unit organisasi perusahaan lain. Pilih jabatan di PT karyawan.",
    );
  }
}

/**
 * Menempatkan karyawan ke pos: pos aktif, PT sesuai, jabatan cocok, slot masih tersedia. Mengembalikan
 * jabatan pos (form cukup memilih pos; jabatan mengikuti).
 */
export async function resolvePostPlacement(
  tx: EmployeeTx,
  input: {
    employeeId: string | null;
    companyId: string;
    orgPostId: string;
    positionId: string | undefined;
  },
): Promise<{ positionId: string }> {
  const post = (await listOrgPosts(tx)).find((p) => p.id === input.orgPostId);
  if (!post || post.archived) {
    throw new BusinessRuleError("Pos jabatan tidak ditemukan atau sudah diarsipkan.");
  }
  if (post.companyId && post.companyId !== input.companyId) {
    throw new BusinessRuleError("Pos jabatan ini milik perusahaan lain.");
  }
  if (input.positionId && input.positionId !== post.positionId) {
    throw new BusinessRuleError("Jabatan karyawan tidak sesuai dengan jabatan pos yang dipilih.");
  }
  const others = await repository.countOtherHolders(tx, post.id, input.employeeId);
  if (others >= post.headcount) {
    throw new BusinessRuleError(
      `Pos "${post.positionName}" sudah penuh (${post.headcount} slot). Tambah slot di Master Data › Pos jabatan.`,
    );
  }
  return { positionId: post.positionId };
}

/** Hook untuk modul organization (lewat app.ts): jumlah pemegang, PT pemegang, sinkron atasan. */
export const employeePostSupport = {
  countPostHolders: (tx?: EmployeeTx) => repository.countPostHolders(tx),
  postHolderCompanies: (tx: EmployeeTx, postIds: string[]) =>
    repository.postHolderCompanies(tx, postIds),
  syncPostManagers: (tx: EmployeeTx) => syncPostManagers(tx),
};
