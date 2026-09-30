---
name: hris-qa-docs
description: Menyusun dokumentasi QA HRIS di docs/qa/ — rencana uji (test plan) per target mingguan/fase, kasus uji (test case) per modul yang terlacak ke PLAN & PROGRESS, laporan eksekusi uji (test run) dengan bukti, laporan bug, dan arsip QA fitur yang sudah lulus ke Google Drive (rclone). Use when the user asks for QA documentation, test plan, test case, test scenario, UAT checklist, bug report, test report/"laporan pengujian", uploading/archiving QA results to Google Drive, or when a feature is finished and needs to be documented as tested.
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
- [ ] Fitur LEGIT (lihat "Arsip Google Drive") → susun folder arsip → TANYA izin → rclone sync → cek → catat di run & log PROGRESS
```

## Aturan

- Jangan menandai case LULUS tanpa menjalankannya di commit yang disebut. Case yang tidak dijalankan = `BELUM`.
- Bukti tidak boleh memuat data sensitif asli (PROMPT §3.7); pakai data dummy.
- **Lokasi bukti visual (WAJIB, permintaan pemilik projek 2026-09-29):** screenshot/trace/video hasil QA & testing disimpan di **`/mnt/winD/WORK/Magang/QA/<YYYY-MM-DD>-<target>/`** (di luar repo, tidak di-commit) — **bukan** di scratchpad sesi, `/tmp`, atau folder repo. Satu subfolder per sesi uji; path itu yang dirujuk di `runs/*.md`.
- Prioritas: P1 = akses/data sensitif/payroll/uang, P2 = aturan bisnis, P3 = tampilan.
- ID case tidak pernah dipakai ulang; case usang diberi status `DIHAPUS` + alasan.

Templat plan, case, run, dan bug: [TEMPLATES.md](TEMPLATES.md).

## Arsip Google Drive (permintaan pemilik projek 2026-09-30)

Drive = **arsip bersih** hasil QA per fitur untuk dibaca/dibagikan. Sumber utama tetap `docs/qa/` (repo) dan bukti lokal `/mnt/winD/WORK/Magang/QA/`.

- **Remote rclone:** `hris-qa:` (Google Drive, `root_folder_id` = folder QA pemilik projek). Belum ada / token kedaluwarsa → minta pemilik projek menjalankan `rclone config reconnect hris-qa:` (login lewat browser). **Jangan pernah mencetak isi `rclone.conf` atau log auth** (berisi token).
- **Hanya fitur yang LEGIT:** semua case P1/P2 fitur itu LULUS di lokal **dan** di staging setelah rilis, tanpa bug P1/P2 terbuka. Uji di tengah jalan, uji ulang, atau hasil lokal saja **tidak** diunggah.
- **Satu fitur = satu folder** `<YYYY-MM-DD>-<target>/` (sama dengan nama plan/run):
  - `plan.md`, `run.md` — salinan apa adanya dari `docs/qa/plans|runs/`
  - `cases.md` — **hanya** case fitur itu (judul + baris otomasi + header tabel + baris `TC-…` yang dirujuk plan), bukan seluruh file modul
  - `bugs/BUG-NNN-<slug>.md` — hanya bila ada bug terkait fitur
  - `screenshots/` — PNG dari folder bukti lokal; awali `lokal-` / `staging-` bila dari dua sesi. Script uji (`*.ts`), JSON, file uji lain **tidak** ikut
  - Format `.md` apa adanya (tanpa konversi ke Google Docs/PDF)
- **Tanpa penumpukan:** susun di folder sementara (scratchpad sesi), lalu `rclone sync` ke folder fitur itu — unggah ulang mengganti isi, bukan menambah. Jangan membuat folder kedua untuk fitur yang sama; jangan menyentuh folder lain di Drive.
- **Aksi keluar:** unggah ditanyakan ke pemilik projek **tepat sebelum** dijalankan (skill `hris-workflow`).
- Bukti hanya data dummy (email akun uji boleh tampak); tidak ada data sensitif asli.

Perintah: [TEMPLATES.md](TEMPLATES.md) bagian "Arsip Drive".
