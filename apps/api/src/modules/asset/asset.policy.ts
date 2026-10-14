import { ROLE } from "@hris/shared";
import {
  type Actor,
  type EmployeeTarget,
  hasPermission,
  isInCompanyScope,
  isInTeam,
  isSelf,
} from "../../core/access/index.ts";

// ARS-D3 (PLAN §4.3 baris "aset"): keputusan akses murni; data target diberikan pemanggil.

/** Kelola aset/APD milik PT `companyId`: SA, atau HR ber-grant `asset.manage` di PT yang ditugaskan. */
export function canManageAssets(actor: Actor, companyId: string): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  return (
    actor.role === ROLE.HR_ADMIN &&
    hasPermission(actor, "asset.manage") &&
    isInCompanyScope(actor, { companyId })
  );
}

/** ARS-D4: harga & tanggal beli hanya untuk pengelola aset PT itu. */
export function canSeeAssetPrice(actor: Actor, companyId: string): boolean {
  return canManageAssets(actor, companyId);
}

/**
 * Master kategori aset & jenis APD berlaku semua PT; dikelola SA atau HR ber-grant (pengelola GA).
 * Keputusan kecil 2026-10-13: tidak dibatasi PT karena master tidak punya PT.
 */
export function canManageAssetMasters(actor: Actor): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  return actor.role === ROLE.HR_ADMIN && hasPermission(actor, "asset.manage");
}

/** Aset & APD yang dipegang karyawan `holder`: SA; HR PT karyawan; MANAGER tim (+ diri); diri sendiri. */
export function canViewEmployeeAssets(actor: Actor, holder: EmployeeTarget): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  if (isSelf(actor, holder)) return true;
  if (actor.role === ROLE.HR_ADMIN) return isInCompanyScope(actor, holder);
  if (actor.role === ROLE.MANAGER) return isInTeam(actor, holder);
  return false;
}

/** Satu aset: SA; HR PT pemilik aset; selain itu hanya bila pemegangnya terlihat (tim / diri). */
export function canViewAsset(
  actor: Actor,
  asset: { companyId: string },
  holder: EmployeeTarget | null,
): boolean {
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  if (actor.role === ROLE.HR_ADMIN) return isInCompanyScope(actor, asset);
  return holder !== null && canViewEmployeeAssets(actor, holder);
}

export type AssetListScope =
  | { kind: "all" }
  | { kind: "companies"; companyIds: string[] }
  | { kind: "team"; managerId: string };

/** Cakupan daftar Arsip › Aset. EMPLOYEE melihat miliknya lewat `/self/assets`, bukan daftar ini. */
export function assetListScope(actor: Actor): AssetListScope | null {
  if (actor.role === ROLE.SUPER_ADMIN) return { kind: "all" };
  if (actor.role === ROLE.HR_ADMIN) {
    const companyIds = actor.companyIds === null ? null : [...actor.companyIds];
    if (companyIds === null) return { kind: "all" };
    return companyIds.length > 0 ? { kind: "companies", companyIds } : null;
  }
  if (actor.role === ROLE.MANAGER && actor.employeeId) {
    return { kind: "team", managerId: actor.employeeId };
  }
  return null;
}

/** ARS-D2: "Sudah saya terima" hanya oleh pemegangnya sendiri. */
export function canAcknowledge(actor: Actor, holder: EmployeeTarget): boolean {
  return isSelf(actor, holder);
}
