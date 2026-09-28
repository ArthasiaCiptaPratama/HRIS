# Rencana Uji — Personal Management (2026-09-29)

- **Ruang lingkup:** item PROGRESS Fase 4 "CRUD karyawan + filter, pencarian, paginasi", "`manager_id` + validasi", "Data sensitif & rekening dengan grant" (baca), "Web: daftar, detail, form"; Fase 3 struktur organisasi (baca). Keputusan D-035.
- **Aturan yang diuji:** PLAN §4.3 "Karyawan" (direktori, data kerja, tambah/ubah/nonaktifkan, data sensitif 🔑, rekening 🔑), §4.2 (audit akses data sensitif), §4.1 (`manager_id` → MANAGER/SUPER_ADMIN), §4.5 (karyawan nonaktif tidak bisa login), §3.2 (batas modul), PROMPT §5 (envelope, paginasi ≤ 100, 400/401/403/404/409/422), D-034 (aturan nonaktif akun), D-035.
- **Di luar lingkup:** tulis data pribadi/rekening/dokumen, import CSV, CRUD master data, menu Arsip & Laporan (Maintenance), OD-6.
- **Lingkungan:** lokal — PostgreSQL 17 (Docker), API `bun` + web Vite di Linux; verifikasi visual Playwright Chromium (harness preview lokal di scratchpad, verifier token uji; tidak ke Supabase).
- **Data uji:** seed dummy (21 pegawai) + factory test dengan penanda RUN (dibersihkan di `afterAll`).
- **Kriteria lulus:** semua P1 & P2 LULUS; tidak ada bug P1 terbuka; typecheck, lint, boundaries, `db:check` hijau.
- **Suite:** [cases/employee.md](../cases/employee.md) (TC-EMP-001 s.d. TC-EMP-032).
