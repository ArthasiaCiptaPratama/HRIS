// Saklar fitur web. `false` = halaman sementara ditampilkan sebagai Maintenance ("Segera");
// kode halaman aslinya TETAP disimpan dan dipakai lagi cukup dengan mengubah nilai menjadi `true`.
// API tidak terpengaruh (akses tetap dijaga policy di server).
export const FEATURES = {
  // Personal Management menu b–e: aktif sejak 2026-09-30 (Tahap 1, permintaan pemilik projek).
  changeStatus: true, // b. Ubah Status Karyawan
  activation: true, // c. Pengaktifan Karyawan
  inactiveEmployees: true, // d. Data Karyawan Tidak Aktif
  orgStructure: true, // e. Struktur Organisasi
} as const;
