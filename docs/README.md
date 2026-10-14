# Dokumen HRIS — peta baca

Dokumen disusun **induk → anak**: induk memberi gambaran besar dan tautan, anak berisi detail. Baca seperlunya; jangan membaca semua file.

## Alur baca awal sesi

1. **[PROMPT.md](PROMPT.md)** — aturan emas (§3) dan protokol sesi. Wajib.
2. **[PROGRESS.md](PROGRESS.md)** — induk: status per fitur, fokus, blocker, keputusan terbuka.
3. **`features/<fitur>/README.md`** — fitur yang akan dikerjakan: checklist, keputusan, sisa pekerjaan, tautan QA & kode.
4. Bila perlu saja:
   - [PLAN.md](PLAN.md) — model akses (§4), aturan bisnis (§5), arsitektur (§3), roadmap (§7), indeks keputusan (§8).
   - `features/<fitur>/design.md` — desain rinci fitur.
   - [CODEMAP.md](CODEMAP.md) → `codemap/<modul>.md` — lokasi file per modul.
   - [decisions.md](decisions.md) — isi lengkap D-001–D-073 & OD-1–OD-15.
   - [RELEASE.md](RELEASE.md) — sebelum push/merge/rilis apa pun.

## Isi folder

| Lokasi | Isi | Diubah oleh |
|---|---|---|
| `PROMPT.md` | Protokol, aturan emas, konvensi, template prompt | Pemilik projek / saat aturan berubah |
| `PROGRESS.md` | Induk status per fitur, fokus, blocker, OD, backlog, log ringkas | Saat branch digabung ke develop |
| `PLAN.md` | Tujuan, arsitektur, akses, aturan bisnis, roadmap, indeks keputusan | Saat ada keputusan baru (indeks) |
| `CODEMAP.md` | Struktur root, standar modul, peta modul, cron, env, script | Saat struktur lintas modul berubah |
| `RELEASE.md` | Jalur develop/rilis, antrean push/rilis aktif, saklar `FEATURES`, riwayat rilis, wajib pra-produksi | Setiap push/merge/rilis |
| `decisions.md` | Isi lengkap keputusan lama (dibekukan) | Hanya penandaan "(diganti oleh …)" |
| `features/<fitur>/` | `README.md` status + checklist + keputusan berprefix · `design.md` · `log.md` | PIC fitur, di branch-nya |
| `codemap/<modul>.md` | Pohon file api & web + tabel per modul; `database.md` = skema/migrasi/seed | Saat modul berubah (rekan tim: saat merge) |
| `archive/` | Log sesi lama & snapshot PROGRESS lama (tidak diubah) | – |
| `qa/` | Rencana, kasus, laporan uji, bug (skill `hris-qa-docs`) | Saat QA |
| `erd/`, `email-templates/` | ERD dbml, template email Supabase | Saat skema/template berubah |

## Fitur & kode prefix keputusan

| Fitur | Kode | PIC |
|---|---|---|
| [fondasi](features/fondasi/README.md) | FND | Oatse |
| [iam](features/iam/README.md) | IAM | Oatse |
| [organisasi](features/organisasi/README.md) | ORG | Oatse |
| [karyawan](features/karyawan/README.md) | EMP | Oatse |
| [import-karyawan](features/import-karyawan/README.md) | IMP | Oatse |
| [onboarding](features/onboarding/README.md) | ONB | Oatse |
| [arsip](features/arsip/README.md) | ARS | Oatse |
| [dashboard](features/dashboard/README.md) | DSB | Mat |
| [time-management](features/time-management/README.md) | TM | Mat |
| [kontrak](features/kontrak/README.md) | KTR | – |
| [payroll](features/payroll/README.md) | PAY | – |
| [hardening](features/hardening/README.md) | HRD | – |

Keputusan baru: `<KODE>-D1`, `<KODE>-D2`, …; keputusan terbuka: `<KODE>-OD1`; lintas fitur: `X-D1`. Nomor lama `D-001`–`D-073` dan `OD-1`–`OD-15` tetap berlaku dan tidak dipakai ulang ([PROMPT §12](PROMPT.md#12-mencatat-keputusan)).

## Fitur baru

Salin folder fitur yang paling mirip, kosongkan checklist & log, pilih kode prefix 2–4 huruf yang belum dipakai, lalu tambahkan barisnya di tabel di atas dan di [PROGRESS — Status per fitur](PROGRESS.md#status-per-fitur).
