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

### 2026-11-11 — Zona HO/Site resmi di unit (ORG-D5) + mode edit layar sempit (ORG-D6) (Oatse)
- **Dikerjakan:** handoff supervisor 09:25 (backlog bagan). ORG-D5: enum `OrgZone` + `departments.zone` (null = ikut induk), migrasi `20261111022710_org_unit_zone` dengan backfill "Site…" → SITE, `unitZones` dari kolom, `zone` di kontrak `/org-chart`, `/master-data`, daftar admin unit (+ `canEditZone`), create/update unit SA, `PUT /departments/{id}/zone` + policy `canManageUnitZone` + audit, seed akar Site; web: field Zona di form unit, kolom Zona (pilihan langsung bila berhak), draf bagan membawa zona unit. ORG-D6: hook `useCompactEdit`, Mode edit di semua lebar, tanpa seret di layar sempit/sentuh, toolbar ikon + pusatkan kartu, titik + 32 px, bilah edit ikon menempel di bawah (portal).
- **Keputusan:** ORG-D5, ORG-D6 (ORG-D4 aturan nama diganti; ORG-D2 (1) "desktop saja" diubah).
- **Verifikasi:** zona efektif DB lokal sebelum vs sesudah migrasi identik (26 unit, 8 Site, 0 selisih; SQL rekursif); `bun run typecheck` ✔; `bunx biome ci .` ✔ (1 warning lama); `check:boundaries` ✔ (560 modul); `db:check` ✔ + rerun "Already in sync"; test shared 362 · api 1307 (baru `unit-zone.test.ts` 6, policy ORG-D5 7) · web 352 (`--maxWorkers=4`; baru `org-chart-compact-edit` 3, master data zona 1) ✔; Zen headless (iframe 390 & 768 px, akun SA lokal) 2 screenshot `QA/2026-11-11-org-chart-mobile/` (01 = sebelum perbaikan).
- **Masalah / catatan:** Codex kena batas pemakaian (sampai 13:12) → BE dikerjakan sendiri. Temuan uji Zen diperbaiki: toolbar kartu terpotong di 390 px (→ ikon saja + pusatkan kartu), bilah edit di bawah lipatan layar (`position: fixed` terkurung leluhur `animate-fade-up` ber-transform → portal ke `body`), transisi `setCenter` tidak jalan di headless (→ `duration: 0`). Screenshot lokal memuat nama asli (DB lokal) — jangan diunggah.
- **Berikutnya:** rilis staging (kata pengguna; migrasi mengisi zona otomatis), kabari Mat (migrasi), uji di HP/tablet sungguhan.

### 2026-11-10 — Rilis staging gel. 22/23 + pembersihan nama asli di repo (Oatse)
- **Dikerjakan:** rilis staging oleh sesi `hris-rilis-0d`: gel. 22 develop `33d6c42` (ORG-D1 L0–L7, ORG-D2, ORG-D4; migrasi 53 → 58) dan gel. 23 develop `a95d62d` (IMP-D1). Data staging dibersihkan dan bagan PDF 06.11 diisi ulang (55 `ASLI-`; 8 akun uji = Magang L0 tanpa pos; akun HR & MGR di jabatan lama). Di develop: nama asli di RELEASE #80, catatan ORG-D3/koreksi bagan, contoh IMP-D1, dan dua catatan lama diganti peran/nama fiktif (`a95d62d`). PROGRESS/CODEMAP dirapikan.
- **Keputusan:** —
- **Verifikasi:** `Deploy staging` #42780975386 ✔ dan #42796846160 ✔ (rincian `HRIS-rilis/docs/RELEASE.md` §4); `a95d62d`: typecheck ✔, biome ✔, test import-chart-holder shared 11 · api 3 ✔, CI #42793861373 ✔.
- **Masalah / catatan:** 1 nama depan asli tersisa di pesan commit `02dff2f` (tulis ulang riwayat = kata pengguna); 3 pos CD2 kosong di staging belum diputuskan; mode edit hanya ≥ 1024 px.
- **Berikutnya:** uji login Karyawan/HR di staging lewat browser; kolom resmi zona HO/Site (Backlog).

### 2026-11-10 — Level L0 Magang (tambahan ORG-D1) (Oatse)
- **Dikerjakan:** enum `PositionLevel` + `L0` (migrasi ADD VALUE), shared `POSITION_LEVELS` …L1B, L0 + label "L0 · Magang", token `--org-l0` teal (terang `oklch(0.64 0.09 195)`, gelap `oklch(0.75 0.09 195)`; tidak bentrok dengan abu L7/biru L3/hijau L5), demo dashboard. Legenda kanvas, master data, laporan/pivot mengikuti `POSITION_LEVELS` otomatis.
- **Keputusan:** tambahan ORG-D1 (kutipan pengguna ±14:58 WIB "Buat level baru L0", untuk jabatan Magang karyawan uji staging tanpa pos).
- **Verifikasi:** lihat laporan sesi (typecheck, biome, db:check, test shared/organisasi/web).
- **Berikutnya:** rilis staging oleh `hris-rilis-0d`.

### 2026-11-10 — Pembatalan jabatan rangkap ORG-D3 + koreksi data bagan (Oatse)
- **Dikerjakan:** ralat pengguna 11:30 WIB (via supervisor): tidak ada sistem rangkap. `git revert` kode ORG-D3 (shared `resolvePostManagers` kembali satu pos, operasi batch rangkap, badge "Rangkap", dialog & profil "Pos rangkap", import `secondary`); migrasi baru `20261110070000_drop_employee_secondary_posts` (file migrasi pembuat tetap, sudah di develop/CI). Data: Superintendent HR & GA & Assistant Manager F A T Vacant, pemegang HR Operational & IR Manager tidak merangkap, pemegang Finance Site tidak merangkap (tegas → Supervisor F&T, fungsional → KTT), pos Foreman Finance dihapus dari seed, DATA-ASLI, dan DB lokal.
- **Keputusan:** ORG-D3 dibatalkan; ORG-D4 penanda HO/Site (akar = unit bernama "Site …"), chip + filter Semua/HO/Site, pos zona lain yang tersambung garis tampil redup.
- **Verifikasi:** `bun run typecheck` ✔; `bunx biome ci .` ✔ (1 warning lama); `check:boundaries` ✔; `db:check` ✔ (migrasi DROP); test shared 349 · api 1291 · web 347 ✔; Zen headless: filter Site & HO (screenshot 13–14 di `QA/2026-11-10-org-chart-edit/`), Superintendent HR & GA & Assistant Manager F A T tampil Kosong.
- **Berikutnya:** kabar Mat (tanpa rangkap); kolom resmi zona HO/Site di unit (Backlog).

### 2026-11-10 — Mode edit bagan (ORG-D2), jabatan rangkap (ORG-D3), reset DB lokal + bagan PDF 06.11 (Oatse)
- **Dikerjakan:** 2a API (izin `org.structure.manage`, `org_chart_state` revisi + 409, `POST /org-chart/changes` + `/preview`, `/org-posts` tulis per PT; implementasi awal Codex sol-high, direview penuh lalu diterapkan); 2b–2c web mode edit (draf + undo/redo, titik biru, seret titik/kartu/avatar, toolbar, dialog pos/atasan/hapus, pratinjau dampak, 409 → muat ulang, beforeunload, PT terkunci); 2d jabatan rangkap; seed bagan bentuk "Orgchart Site 06.11.2026" (90 pos ACP + CD2 dummy, level dari judul jabatan, ambigu A1–A14 dijawab pengguna); `org:import-local` + kunci `secondary`; reset DB lokal (kutipan 10:57 "ya, reset DB lokal"), 4 akun uji dipulihkan dari cadangan, dummy lain + pos CD2 dihapus (kutipan 11:02 "ya, hapus dummy lokal").
- **Keputusan:** ORG-D2, ORG-D3 (+ pengecualian D-049 jabatan baru dari bagan).
- **Verifikasi:** `bun run typecheck` ✔; `bunx biome ci .` ✔ (1 warning lama); `check:boundaries` ✔ (557 modul); `db:check` ✔; test shared 351 · api 1292 (integration ORG-D2/D3 18) · web 344 (`--maxWorkers=4`) ✔; uji Zen headless 12 screenshot (`/mnt/winD/WORK/Magang/QA/2026-11-10-org-chart-edit/`).
- **Masalah / catatan:** temuan Zen diperbaiki — tombol + bertumpuk dengan tombol lipat, "Muat ulang bagan" setelah 409 tidak mengambil revisi baru, bilah edit menimpa kotak cari, penomoran ulang urutan saudara yang tidak perlu. Temuan security review (sinkron atasan & pratinjau HR lintas PT) diperbaiki `d35ed13`. Cleanup test awal Codex sempat menghapus seluruh `approval_requests` DB lokal (sebelum reset; tidak menyentuh staging). Animasi Radix tidak berjalan di tab Zen latar/headless (artefak otomasi; QA memakai CSS tanpa animasi). Typo PDF dikoreksi: "Assistant Bor III" di kolom Operator Bor I → Assistant Bor I, "Jetty Suprvisosr", "Envirotment", "Quality Controll"; kotak kanan "Superintendent External Relation" → Superintendent HR & GA (pemegang pos lain, rangkap). Seret kartu/titik diuji dengan event sintetis (mouse & HTML5 DnD).
- **Berikutnya:** rilis staging lewat HRIS-rilis (kata pengguna; seed/ data bagan staging terpisah), kabar Mat (migrasi + shared).

### 2026-11-10 — Level jabatan 1b–7 + warna bagan (ORG-D1) (Oatse)
- **Dikerjakan:** Task 1 handoff supervisor `2026-11-10-1012`: enum `PositionLevel` L7…L1B + migrasi pemetaan data lama, label shared, pemakai (report movementKind, report batch 2, dashboard pivot, employee sort, master data, profil, bagan), seed & demo, test; token `--org-l*` terang/gelap + latar tipis header kartu, legenda satu kolom.
- **Keputusan:** ORG-D1 (mengubah D-050 (4)).
- **Verifikasi:** `db:migrate` ✔ (rerun "Already in sync", `db:check` tanpa selisih; DB lokal L6 5 · L5 4 · L4 3 · L3 21 · L2 7 · L1A 21 · L1B 7 · kosong 15); `bun run typecheck` ✔; `bunx biome ci .` ✔ (1 warning lama); `check:boundaries` ✔; test shared 346 · api 1261 · web 339 (`--maxWorkers=4`) ✔.
- **Masalah / catatan:** selisih warna PDF 06.11.2026 vs legenda (legenda dipakai): kotak Helper Bor/Survey biru sedang (bukan biru tua) dan Helper Environment cokelat; banyak jabatan staf berwarna ungu (Wellsite, QC, Monitoring Controlling, Assistant Master Loading, General Admin, Paramedic, Admin Generalist, Operational Staff, Finance Site, staf HR/Legal korporat); jabatan Manager (HR Operational & IR Manager, External Relation Manager, Assistant Manager FAT) & Department Head oranye (= L4), bukan biru muda; Head of BD & Project hijau (= L5); kotak "Superintendent External Relation" tampil dua kali.
- **Berikutnya:** Task 2 bagan interaktif (API batch + izin `org.structure.manage`).

