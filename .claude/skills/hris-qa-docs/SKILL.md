---
name: hris-qa-docs
description: Menyusun dokumentasi QA HRIS di docs/qa/ — rencana uji (test plan) per target mingguan/fase, kasus uji (test case) per modul yang terlacak ke PLAN & PROGRESS, laporan eksekusi uji (test run) dengan bukti, dan laporan bug. Use when the user asks for QA documentation, test plan, test case, test scenario, UAT checklist, bug report, test report/"laporan pengujian", or when a feature is finished and needs to be documented as tested.
---

# Dokumentasi QA HRIS

Tujuan: setiap fitur punya jejak **aturan (PLAN) → kasus uji → test otomatis/manual → hasil**. Bahasa Indonesia, tanpa data asli.

## Struktur

```
docs/qa/
├── README.md                         # indeks: daftar plan, suite, run terakhir
├── plans/<YYYY-MM-DD>-<target>.md    # rencana uji per target mingguan/fase
├── cases/<modul>.md                  # kasus uji per modul (ID stabil TC-<MODUL>-NNN)
├── runs/<YYYY-MM-DD>-<target>.md     # hasil eksekusi (commit, env, lulus/gagal, bukti)
└── bugs/BUG-NNN-<slug>.md            # satu file per bug
```

Buat folder/README saat pertama dipakai, lalu catat di CODEMAP §1.

## Alur

```
- [ ] Plan: ruang lingkup = item PROGRESS target ini; sebut aturan PLAN yang diuji & yang TIDAK diuji
- [ ] Cases: turunkan dari PLAN §4.3 (akses) & §5 (aturan bisnis): jalur sukses, validasi, akses ditolak, batas/edge
- [ ] Tiap case isi "Otomasi": path test (bun/vitest/playwright) atau "manual"
- [ ] Jalankan: bun run typecheck, lint, check:boundaries, test (+ e2e bila ada); salin ringkasan output APA ADANYA
- [ ] Run report: commit SHA, env (lokal/staging), versi, hasil per case, bukti (path screenshot/trace), bug terbuka
- [ ] Gagal → bug report + test yang gagal dulu (skill hris-flow-testing)
- [ ] Perbarui docs/qa/README.md dan log PROGRESS
```

## Aturan

- Jangan menandai case LULUS tanpa menjalankannya di commit yang disebut. Case yang tidak dijalankan = `BELUM`.
- Bukti tidak boleh memuat data sensitif asli (PROMPT §3.7); pakai data dummy.
- **Lokasi bukti visual (WAJIB, permintaan pemilik projek 2026-09-29):** screenshot/trace/video hasil QA & testing disimpan di **`/mnt/winD/WORK/Magang/QA/<YYYY-MM-DD>-<target>/`** (di luar repo, tidak di-commit) — **bukan** di scratchpad sesi, `/tmp`, atau folder repo. Satu subfolder per sesi uji; path itu yang dirujuk di `runs/*.md`.
- Prioritas: P1 = akses/data sensitif/payroll/uang, P2 = aturan bisnis, P3 = tampilan.
- ID case tidak pernah dipakai ulang; case usang diberi status `DIHAPUS` + alasan.

Templat plan, case, run, dan bug: [TEMPLATES.md](TEMPLATES.md).
