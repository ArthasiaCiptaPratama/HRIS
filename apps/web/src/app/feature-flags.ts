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
  // Personal Management › Arsip › Data Assets, Master Data › Aset & APD, tab Aset, Aset saya (ARS-D1–D6)
  assets: true,
  // Personal Management › Arsip › Riwayat Peringatan, Master Data › Jenis Pelanggaran, tab SP, SP saya
  // (D-057, ARS-D7–D15) — tampil di rilis gel. 8 (2026-10-15)
  discipline: true,
  // Personal Management › Laporan batch 1: headcount & turnover, dokumen kedaluwarsa, kelengkapan, SP aktif
  // (ARS-D16/D17) — tampil di rilis gel. 9 (2026-10-19).
  reports: true,
  // Time Management — saklar INDUK: `false` = seluruh menu Time Management menjadi Maintenance.
  // Rilis: disembunyikan (kode & migrasi terpasang sejak gel. 7; API tetap dipakai app mobile).
  timeManagement: false, // absen PWA, Data Absen Harian, roster, cuti (D-067–D-073, TM-D1–TM-D8)
  // Sub-saklar Time Management per fitur (hanya berlaku bila `timeManagement` juga `true`; pakai `tmOn`).
  tmAbsen: true, // Absen (HP) /absen/* + absen istirahat (D-067, D-073, TM-D2, TM-D7)
  tmAttendanceDays: true, // Data Absen Harian + tab Absensi di detail karyawan (D-068, D-073, TM-D3)
  tmCorrections: true, // Koreksi & Pernyataan (D-071, TM-D3)
  tmRecap: true, // Rekap & Tutup Periode (D-071)
  tmOvertime: true, // Lembur: usulan otomatis, persetujuan, rekap (TM-D6)
  tmRoster: true, // Roster Bulanan (D-069)
  tmRosterChanges: true, // Perubahan / tukar shift (D-069)
  tmRosterSetup: true, // Shift, Pola & Crew + template JT (D-069, TM-D8)
  tmAttendanceLocations: true, // Lokasi Absen + wajib absen istirahat (TM-D1, TM-D7)
  tmLeave: true, // Cuti, Izin & Sakit — pengajuan (D-072, TM-D4, TM-D5)
  tmLeaveApprovals: true, // Persetujuan Cuti (D-072)
  tmLeaveBalances: true, // Saldo Cuti (D-072)
  tmLeaveMaster: true, // Master Cuti (D-072, TM-D5)
  tmHolidays: true, // Kalender Libur
  tmSettings: true, // Pengaturan Time Management
  tmGradeWages: true, // Upah Grade (TM-D6)
} as const;

export type TimeFeature = Extract<keyof typeof FEATURES, `tm${string}`>;

/** Fitur Time Management aktif = saklar induk `timeManagement` DAN sub-saklar fitur itu. */
export const tmOn = (feature: TimeFeature): boolean => FEATURES.timeManagement && FEATURES[feature];
