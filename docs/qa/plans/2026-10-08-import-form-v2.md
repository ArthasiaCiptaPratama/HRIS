# Rencana Uji — Import Form Versi 171 Kolom (D-061, 2026-10-08)

- **Ruang lingkup:** Import Data Karyawan dari Sheet respons Form yang direvisi di tengah pengisian (171 kolom: pertanyaan versi lama & baru) — pengenalan judul kolom, penggabungan kolom kembar, field baru (rincian alamat, kontak darurat 2, status saudara, pekerjaan anak, file SIM), Divisi, jenis dokumen SIM tanpa masa berlaku. Item PROGRESS Fase 4 › Import Form 171 kolom (tambahan 2026-10-08).
- **Aturan yang diuji:** D-061, D-059 (bagian berulang), D-060 (lampiran), D-050 (unit berjenis Divisi), PLAN §4.2 (field baru = data pribadi, butuh grant tulis).
- **Di luar lingkup:** pengambilan file Drive sungguhan untuk SIM (logika lampiran sudah diuji D-060; jenis SIM kini tanpa masa berlaku), tabel wilayah resmi (Backlog), staging.
- **Lingkungan:** lokal Linux — PostgreSQL 17, API :3000 + web :5173, login Supabase staging (SA); Playwright Chromium.
- **Data uji:** xlsx **dummy** berheader 171 judul pertanyaan Form asli (fixture repo, tanpa data pribadi); baris = karyawan dummy seed `ACP-20…` (dipotret sebelum uji & dipulihkan sesudahnya). File respons asli hanya dipakai untuk cek pemetaan (hasil berupa jumlah, tanpa nilai).
- **Kriteria lulus:** semua P1 & P2 LULUS; typecheck, lint, boundaries, seluruh test, build hijau.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-188–192.
