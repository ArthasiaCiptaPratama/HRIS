// Saklar fitur web. `false` = halaman sementara ditampilkan sebagai Maintenance ("Segera");
// kode halaman aslinya TETAP disimpan dan dipakai lagi cukup dengan mengubah nilai menjadi `true`.
// API tidak terpengaruh (akses tetap dijaga policy di server).
export const FEATURES = {
  // Personal Management menu b–e: aktif sejak 2026-09-30 (Tahap 1, permintaan pemilik projek).
  changeStatus: true, // b. Ubah Status Karyawan
  activation: true, // c. Pengaktifan Karyawan
  inactiveEmployees: true, // d. Data Karyawan Tidak Aktif
  orgStructure: true, // e. Struktur Organisasi
  // Rilis bertahap (D-043, 2026-10-08): fitur develop yang belum dirilis disembunyikan di jalur rilis
  // (develop selalu `true`). Skema & API ikut terpasang; aktifkan cukup dengan `true` lalu rilis ulang.
  onboarding: true, // Administrasi › Penerimaan Karyawan Baru (D-045–D-048)
  archive: true, // Personal Management › Arsip, Master Data › Jenis dokumen, kelola Arsip di detail (D-054–D-058)
  selfService: true, // Akun Saya › Layanan Mandiri & Administrasi › Pengajuan Perubahan Data (D-054)
} as const;
