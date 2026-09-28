# Templat hris-workflow

## Rencana (tunggu persetujuan)
```md
**Fase aktif:** <N — nama> · **Item PROGRESS:** <teks item> · **OD terkait:** <OD-x / tidak ada>

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
✔ Poin 2/5 — <apa yang selesai>. Cek: `bun run test:api` 25 lulus, `db:check` tanpa selisih. Checklist PROGRESS diperbarui.
```
Gagal & tidak bisa diperbaiki → `✘ Poin 3/5 — <masalah>. Berhenti: <apa yang dibutuhkan>.`

## Laporan akhir
```md
**Ringkasan:** <1–2 kalimat: selesai/belum, hasil utama>

## Yang dikerjakan
- <perubahan> (`path`) — item PROGRESS "<item>"
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

## PROGRESS
- Checklist: `[ ]` → `[~] <keterangan sisa>` → `[x] <bukti singkat>` segera setelah poin terverifikasi.
- Langkah tambahan (sub-item di bawah item terkait):
  `  - [ ] <langkah> (tambahan YYYY-MM-DD: <alasan>)`
- Di luar fase aktif → `§5 Backlog`: `- <ide> (dari tugas <X>, YYYY-MM-DD)`.
- Akhir tugas: perbarui `§2 Fokus Saat Ini` + satu entri `§6 Log Sesi` (templat di bawah file PROGRESS), terbaru di atas.
