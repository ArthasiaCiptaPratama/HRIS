import { z } from "zod";
import { ROLE, type Role } from "./roles.ts";

// PLAN §4.2: daftar tetap izin yang bisa di-grant SUPER_ADMIN.
// Data gaji sengaja TIDAK ada di sini: gaji tidak pernah bisa di-grant.
export const PERMISSIONS = [
  "employee.personal.read",
  "employee.personal.write",
  "employee.bank.read",
  "employee.bank.write",
  "employee.documents.read",
  "employee.documents.write",
  "contract.manage",
  "payroll.period.prepare",
  // D-047: review & keputusan data onboarding (lihat data sensitif calon di PT yang ditugaskan).
  "employee.onboarding.review",
  // D-054 / OD-6 (Arsip 1c): setujui/tolak pengajuan perubahan data karyawan.
  "employee.changes.review",
  // ARS-D3 (Arsip 2a): kelola aset per unit & pembagian APD di PT yang ditugaskan.
  "asset.manage",
  // ARS-D10 (Arsip 2b): lihat / buat & terbitkan surat peringatan di PT yang ditugaskan.
  "employee.discipline.read",
  "employee.discipline.write",
] as const;

export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof permissionSchema>;

const HR_AND_MANAGER: readonly Role[] = [ROLE.HR_ADMIN, ROLE.MANAGER];
const HR_ONLY: readonly Role[] = [ROLE.HR_ADMIN];

export const PERMISSION_GRANTABLE_TO: Record<Permission, readonly Role[]> = {
  "employee.personal.read": HR_AND_MANAGER,
  "employee.personal.write": HR_AND_MANAGER,
  "employee.bank.read": HR_AND_MANAGER,
  "employee.bank.write": HR_AND_MANAGER,
  "employee.documents.read": HR_AND_MANAGER,
  "employee.documents.write": HR_AND_MANAGER,
  "contract.manage": HR_ONLY,
  "payroll.period.prepare": HR_ONLY,
  "employee.onboarding.review": HR_ONLY,
  "employee.changes.review": HR_ONLY,
  "asset.manage": HR_ONLY,
  "employee.discipline.read": HR_ONLY,
  "employee.discipline.write": HR_ONLY,
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "employee.personal.read":
    "Lihat data pribadi (NIK KTP, NPWP, KK, lahir, alamat, status nikah, agama, PTKP, keluarga)",
  "employee.personal.write": "Ubah data pribadi",
  "employee.bank.read": "Lihat nomor rekening",
  "employee.bank.write": "Ubah nomor rekening",
  "employee.documents.read": "Lihat dokumen karyawan",
  "employee.documents.write": "Unggah/hapus dokumen karyawan",
  "contract.manage": "Kelola kontrak & lihat daftar kontrak",
  "payroll.period.prepare": "Tutup periode absensi & tandai input payroll siap",
  "employee.onboarding.review":
    "Review data onboarding calon (lihat data pribadi, rekening & dokumen calon; setujui/revisi/batalkan)",
  "employee.changes.review":
    "Setujui/tolak pengajuan perubahan data karyawan (bagian sensitif tetap butuh izin lihat & ubah bagian itu)",
  "asset.manage":
    "Kelola aset & pembagian APD (tambah/ubah aset, serah-terima, pengembalian, BAST, harga aset)",
  "employee.discipline.read": "Lihat surat peringatan karyawan",
  "employee.discipline.write": "Buat, terbitkan & cabut surat peringatan; kelola jenis pelanggaran",
};

export function isPermissionGrantableTo(permission: Permission, role: Role): boolean {
  return PERMISSION_GRANTABLE_TO[permission].includes(role);
}
