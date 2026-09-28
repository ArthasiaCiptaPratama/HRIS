# Templat QA

## plans/<tanggal>-<target>.md
```md
# Rencana Uji — <target> (<tanggal>)
- **Ruang lingkup:** item PROGRESS: ...
- **Aturan yang diuji:** PLAN §4.3 baris ..., §5.x ...
- **Di luar lingkup:** ... (alasan)
- **Lingkungan:** lokal (PostgreSQL 17 Docker) / staging (Supabase + Vercel Preview)
- **Data uji:** seed dummy / factory test (penanda RUN)
- **Kriteria lulus:** semua P1 & P2 LULUS; tidak ada bug P1 terbuka
- **Suite:** cases/<modul>.md (TC-... s.d. TC-...)
```

## cases/<modul>.md
```md
# Kasus Uji — <modul>

| ID | Prioritas | Aturan | Role/grant | Prasyarat | Langkah | Hasil diharapkan | Otomasi |
|---|---|---|---|---|---|---|---|
| TC-EMP-001 | P1 | PLAN §4.3 data pribadi | HR_ADMIN tanpa grant | Karyawan A ada | GET /employees/A | 200, tanpa field `personal` | tests/integration/employee/detail.test.ts |
| TC-EMP-002 | P2 | ERD: nomor karyawan unik | HR_ADMIN | Nomor X terpakai | Buat karyawan nomor X | 409 CONFLICT | tests/integration/employee/create.test.ts |
```

## runs/<tanggal>-<target>.md
```md
# Hasil Uji — <target> (<tanggal>)
- **Commit:** <sha> · **Branch:** ... · **Env:** ... · **Bun/PG:** ...
- **Perintah & ringkasan:** `bun run test` → shared 10 ✔, api N ✔, web N ✔ (tempel ringkasan asli)

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-001 | LULUS | test hijau |
| TC-EMP-002 | GAGAL | BUG-003 |
| TC-EMP-010 | BELUM | menunggu Fase 2 (login) |

**Kesimpulan:** lulus/tidak terhadap kriteria plan. **Bug terbuka:** ...
```

## bugs/BUG-NNN-<slug>.md
```md
# BUG-NNN: <judul singkat>
- **Prioritas:** P1/P2/P3 · **Status:** TERBUKA/DIPERBAIKI (commit ...) · **Case:** TC-...
- **Langkah reproduksi:** 1. ... 2. ...
- **Diharapkan:** ... · **Terjadi:** ...
- **Akar masalah:** ... · **Test pencegah:** path test yang gagal sebelum perbaikan
```
