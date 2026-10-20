# Hasil Uji — Laporan batch 2, lokal (2026-10-20)

- **Rencana:** [plans/2026-10-20-laporan-batch2-lokal.md](../plans/2026-10-20-laporan-batch2-lokal.md)
- **Commit:** `HRIS/Oatse/Linux-Windows` @ `b414d6d` + perubahan batch 2 (belum di-commit saat uji) · **Env:** lokal (DB `hris`, Auth staging) · **Akun UI:** HR_ADMIN tanpa grant
- **Perintah & ringkasan:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ · `bun run check:boundaries` ✔ (480 modul) · `bun run build` ✔ · test shared **268** · api **826** · web **281** (`vitest run --maxWorkers=2`; suite penuh paralel sambil dev server jalan: 2–3 test lama timeout acak, lulus saat diulang)
- **Script:** `/mnt/winD/WORK/Magang/QA/2026-10-20-laporan-batch2/qa-laporan-batch2.ts` — **12/12**, 0 error JS/console/5xx (`hasil.json`).

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-250 | LULUS | Q-01 rata-rata 5,1 th, 86 aktif — `Q-01.png`; Q-02 `?bulan=1` → jubilee Januari 1 orang — `Q-02.png`; batas kelompok & jubilee di shared (18) + integration |
| TC-EMP-251 | LULUS | Q-03 tanpa tabel/nama — `Q-03.png`; integration: nama & tanggal lahir tidak ada di respons, "jakarta"/"JAKARTA" satu kelompok |
| TC-EMP-252 | LULUS | Q-04 saring KPI Mutasi (data lokal 2026 kosong → keadaan kosong) — `Q-04.png`; integration: promosi 1, mutasi 2 (termasuk pindah PT digabung), level kosong 1, tahun lain tidak masuk |
| TC-EMP-253 | LULUS | Q-05 4 ulang tahun Oktober, tanpa pilihan tahun, tanpa tahun lahir di halaman — `Q-05.png` |
| TC-EMP-254 | LULUS | Q-06 5 KPI, grafik per kategori, rincian 8/12, tautan Data Assets, tanpa "Rp" — `Q-06.png`; integration: harga `12345678` tidak di respons, belum kembali Aset 1 + APD 2 |
| TC-EMP-255 | LULUS | Q-07 HR tanpa grant: daftar terkunci, ekspor API 403 — `Q-07.png`; integration: rata-rata 1,5 hari, pemeriksa melihat 3 baris tanpa nilai payload |
| TC-EMP-256 | LULUS | Q-08 `laporan-tenure-2026-10-20.xlsx`; integration mutasi: sheet "Daftar perpindahan", "Tahun 2025", audit `report.export` |
| TC-EMP-257 | LULUS | Q-09 mode gelap — `Q-09.png`; Q-10–Q-12 HP 390 scroll 0 |

**Catatan:**
- Putaran 1 menemukan tabel rincian 7 kolom terpotong di panel 7/12 (Masa kerja & Aset) dan 6 KPI Aset (1 kartu sendirian) → grafik 4/12 + tabel 8/12, KPI "Tersedia" jadi keterangan "Total aset"; putaran 2 12/12.
- Akun UI hanya HR tanpa grant; jalur ber-grant (`employee.changes.review`) diuji di integration & web test.

**Kesimpulan:** semua P1/P2 LULUS di lokal; belum LEGIT (butuh uji staging setelah rilis).

## Putaran audit — perbaikan sticky, tab, WIB + gabungan Mat (2026-10-20)

- **Commit:** develop `69b20a5` (merge `HRIS/Mat/Mac` `ca6faa5` di atas `9f7f4e9`) · migrasi lokal `20261019071235_leave_type_description` diterapkan, `db:check` tanpa selisih.
- **Perintah & ringkasan:** typecheck ✔ · biome ✔ · boundaries ✔ (487 modul) · build ✔ · shared **268** · api **840** · web **290** (`--maxWorkers=2`).
- **Script:** sama, ditambah Q-13…Q-17 — **17/17**, 0 error JS/console/5xx.

| Langkah | Hasil | Bukti |
|---|---|---|
| Q-13 bilah filter setelah gulir: celah ke tepi atas area gulir 0 px (sebelumnya 56 px) | LULUS | `Q-13-sticky.png` |
| Q-14 / Q-15 10 tab terlihat penuh di 1440 / 1024 (turun baris) | LULUS | `Q-14-tab.png`, `Q-15-tab.png` |
| Q-16 HP 390: tab aktif Pengajuan data digulir masuk layar | LULUS | — |
| Q-17 smoke gabungan Mat: Time › Absen harian & Cuti tanpa error | LULUS | `Q-17.png` |
| Q-01…Q-12 ulang | LULUS | screenshot diperbarui |

**Kesimpulan putaran audit:** LULUS lokal; lanjut rilis gel. 12.
