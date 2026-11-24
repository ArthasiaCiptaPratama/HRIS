-- TM-D29 dicabut (2026-11-24): fitur Absen Mandiri (STAGING) dihapus.
-- Menghapus tabel izin crew dari migrasi 20261118024040_tm_d29_self_report_crews.
-- Punch absen mandiri yang sudah tercatat TIDAK dihapus: tetap sumber MANUAL berlabel SELF_REPORT/GALLERY_PHOTO.
DROP TABLE IF EXISTS "attendance"."self_report_crews";
