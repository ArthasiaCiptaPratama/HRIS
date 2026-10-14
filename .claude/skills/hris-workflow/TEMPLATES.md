# Templat hris-workflow

## Rencana (tunggu persetujuan)
```md
**Fitur/fase:** <fitur — fase N> · **Item checklist (README fitur):** <teks item> · **OD terkait:** <OD-x / tidak ada>

**Poin kerja**
1. <poin> — file: `<path>` — cek: <perintah>
2. ...

**Aksi keluar yang akan diusulkan** (ditanya lagi saat dijalankan): <commit / push / PR ke HRIS/debug/... / tidak ada>
**Risiko:** <mis. menyentuh model akses; migrasi baru; butuh akun luar>
**Di luar cakupan:** <yang sengaja tidak dikerjakan>

Lanjut dengan rencana ini?
```

## Status per poin (lalu lanjut otomatis)
```md
✔ Poin 2/5 — <apa yang selesai>. Cek: `bun run test:api` 25 lulus, `db:check` tanpa selisih. Checklist README fitur diperbarui.
```
Gagal & tidak bisa diperbaiki → `✘ Poin 3/5 — <masalah>. Berhenti: <apa yang dibutuhkan>.`

## Laporan akhir
```md
**Ringkasan:** <1–2 kalimat: selesai/belum, hasil utama>

## Yang dikerjakan
- <perubahan> (`path`) — item checklist "<item>" (features/<fitur>)
- Langkah tambahan: <sub-item baru + alasan> (bila ada)

## Hasil verifikasi
| Cek | Perintah | Hasil |
|---|---|---|
| Typecheck | `bun run typecheck` | ✔ 3 workspace |
| Lint | `bunx biome ci .` | ✔ |
| Batas modul | `bun run check:boundaries` | ✔ 0 pelanggaran |
| Test | `bun run test` | ✔ shared 10 · api 25 · web 8 |
| <lainnya> | <perintah / id run CI / MCP> | ✔/✘/⚠/— |

## Temuan & keputusan
- <bug/masalah + akar masalah>, <D-xxx baru>, <asumsi>, <koreksi klaim sebelumnya>

## Butuh dari Anda
1. <keputusan/aksi, mis. "izinkan commit `feat: ...` ke HRIS/Oatse/Linux-Windows?"> (atau "Tidak ada")

## Langkah berikutnya
1. <langkah konkret, urut prioritas>
```
Tugas kecil (pertanyaan/pemeriksaan): cukup ringkasan + hasil + langkah berikutnya bila ada.

## Dokumen (struktur induk → fitur, 2026-10-13; peta: docs/README.md)
- Checklist di `docs/features/<fitur>/README.md`: `[ ]` → `[~] <keterangan sisa>` → `[x] <bukti singkat>` segera setelah poin terverifikasi.
- Langkah tambahan (sub-item di bawah item terkait):
  `  - [ ] <langkah> (tambahan YYYY-MM-DD: <alasan>)`
- Di luar cakupan → Backlog di `docs/PROGRESS.md`: `- <ide> (dari tugas <X>, YYYY-MM-DD)`.
- Keputusan baru → README fitur, ID `<KODE>-D<n>` (OD: `<KODE>-OD<n>`), bukan `D-074` (PROMPT §12).
- Akhir tugas: satu entri di `docs/features/<fitur>/log.md` (format di kepala file itu), terbaru di atas; perbarui status di kepala README fitur; file kode baru → `docs/codemap/<modul>.md`; commit/push/rilis → `docs/RELEASE.md`.
- Induk `docs/PROGRESS.md` (baris status fitur, Fokus, satu baris Log ringkas) + indeks PLAN §8: diperbarui di develop atau saat menggabungkan branch rekan tim ke develop — **tidak** di branch rekan tim.
