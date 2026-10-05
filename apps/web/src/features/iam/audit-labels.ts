// Label aksi audit log dalam bahasa Indonesia (kode tetap tampil sebagai keterangan kecil).
// Kode baru yang belum ada di sini tetap tampil apa adanya.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "employee.employee.create": "Tambah karyawan",
  "employee.employee.update": "Ubah data karyawan",
  "employee.employee.change_status": "Ubah status kepegawaian",
  "employee.employee.deactivate": "Nonaktifkan karyawan",
  "employee.employee.reactivate": "Aktifkan kembali karyawan",
  "employee.photo.update": "Ganti foto profil",
  "employee.photo.delete": "Hapus foto profil",
  "employee.printed": "Cetak data karyawan",
  "employee.sensitive.read": "Lihat data sensitif",
  "iam.account.invite": "Undang akun",
  "iam.account.change_role": "Ubah role akun",
  "iam.account.deactivate": "Nonaktifkan akun",
  "iam.account.reactivate": "Aktifkan kembali akun",
  "iam.account.assign_companies": "Atur perusahaan akun",
  "iam.account.transfer_primary_super_admin": "Serah terima Super Admin Utama",
  "iam.account.bootstrap_primary_super_admin": "Bootstrap Super Admin Utama",
  "iam.account.recover_primary_super_admin": "Pemulihan Super Admin Utama",
  "iam.account.provision_script": "Akun uji dibuat (script)",
  "iam.grant.create": "Beri grant izin",
  "iam.grant.revoke": "Cabut grant izin",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  "employee.employee": "Karyawan",
  "iam.account": "Akun",
  "iam.permission_grant": "Grant izin",
};
