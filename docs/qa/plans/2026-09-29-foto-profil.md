# Rencana Uji — Foto Profil & Bucket Supabase (2026-09-29)

- **Ruang lingkup (permintaan pemilik projek):** CRUD foto profil pegawai + setup bucket Supabase Storage; foto ikut ter-print di bingkai kiri formulir. Keputusan **D-037**.
- **Aturan yang diuji:** PLAN §4.3 (foto: SA/HR + diri sendiri; baca = siapa pun yang boleh melihat pegawai), §4.5 (audit), PROMPT §3.7 (bucket private, tanpa URL publik), §5 (400/401/403/404/422), §3.2 (batas modul), D-023 (Storage lokal = staging).
- **Di luar lingkup:** selfie absensi (Fase 5), dokumen pegawai (Fase 4 lanjutan), bucket produksi (Rilis 1).
- **Lingkungan:** lokal Linux — PostgreSQL 17 (Docker), API `bun --watch` :3000 (Storage = bucket staging), web Vite :5173, login Supabase staging sungguhan (SA/HR/MGR/EMP); Playwright Chromium; test otomatis memakai Storage palsu.
- **Kriteria lulus:** semua P1 & P2 LULUS; typecheck, lint, boundaries, `db:check`, seluruh test hijau; advisor Supabase tanpa temuan baru.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-046 s.d. TC-EMP-053.
