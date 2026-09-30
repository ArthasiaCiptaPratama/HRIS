// Saklar fitur web. `false` = halaman sementara ditampilkan sebagai Maintenance ("Segera");
// kode halaman aslinya TETAP disimpan dan dipakai lagi cukup dengan mengubah nilai menjadi `true`.
// API tidak terpengaruh (akses tetap dijaga policy di server).
export const FEATURES = {
  // Personal Management menu b–e (permintaan pemilik projek 2026-09-29: ditutup sementara).
  changeStatus: false, // b. Ubah Status Karyawan
  activation: false, // c. Pengaktifan Karyawan
  inactiveEmployees: false, // d. Data Karyawan Tidak Aktif
  orgStructure: false, // e. Struktur Organisasi
} as const;
