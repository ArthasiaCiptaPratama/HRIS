# Log — Organisasi — master data & bagan

Entri terbaru di **atas**. Format satu entri (salin):

```
### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

Log sebelum 2026-10-13 ada di [archive/log-2026-09.md](../../archive/log-2026-09.md) dan [archive/log-2026-10.md](../../archive/log-2026-10.md) (cari judul atau D-xxx fitur ini).

### 2026-11-10 — Level jabatan 1b–7 + warna bagan (ORG-D1) (Oatse)
- **Dikerjakan:** Task 1 handoff supervisor `2026-11-10-1012`: enum `PositionLevel` L7…L1B + migrasi pemetaan data lama, label shared, pemakai (report movementKind, report batch 2, dashboard pivot, employee sort, master data, profil, bagan), seed & demo, test; token `--org-l*` terang/gelap + latar tipis header kartu, legenda satu kolom.
- **Keputusan:** ORG-D1 (mengubah D-050 (4)).
- **Verifikasi:** `db:migrate` ✔ (rerun "Already in sync", `db:check` tanpa selisih; DB lokal L6 5 · L5 4 · L4 3 · L3 21 · L2 7 · L1A 21 · L1B 7 · kosong 15); `bun run typecheck` ✔; `bunx biome ci .` ✔ (1 warning lama); `check:boundaries` ✔; test shared 346 · api 1261 · web 339 (`--maxWorkers=4`) ✔.
- **Masalah / catatan:** selisih warna PDF 06.11.2026 vs legenda (legenda dipakai): kotak Helper Bor/Survey biru sedang (bukan biru tua) dan Helper Environment cokelat; banyak jabatan staf berwarna ungu (Wellsite, QC, Monitoring Controlling, Assistant Master Loading, General Admin, Paramedic, Admin Generalist, Operational Staff, Finance Site, staf HR/Legal korporat); jabatan Manager (HR Operational & IR Manager, External Relation Manager, Assistant Manager FAT) & Department Head oranye (= L4), bukan biru muda; Head of BD & Project hijau (= L5); kotak "Superintendent External Relation" tampil dua kali.
- **Berikutnya:** Task 2 bagan interaktif (API batch + izin `org.structure.manage`).

