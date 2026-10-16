# Log — Fondasi

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

### 2026-10-16 — Staging pindah ke team Vercel Pro "Arthasia Akselerasi" (Oatse)
- **Dikerjakan (izin pemilik projek "ya"):** login akun `oatse2458@arthasia.com` di CLI (device flow, config terpisah; OTP tidak dibagikan) → transfer `hris-staging-api` & `hris-staging-web` (REST transfer-request: akun lama membuat, akun baru menerima) → cek env/cron/domain/proteksi → `gh secret set` `VERCEL_ORG_ID` & `VERCEL_TOKEN` (stdin) → `Deploy staging` (workflow_dispatch) → verifikasi.
- **Keputusan:** FND-D1 (akun Vercel produksi & staging = team Pro "Arthasia Akselerasi"; menjawab OD-4 bagian Vercel, mengubah D-036 (1)).
- **Verifikasi:** id project tetap; env api 14/14, web 4/4; 6 cron; domain tetap; SSO hanya preview; Deploy #38841245033 ✔ (3 job); deployment production terbaru oleh akun baru READY; health 200, web 200, cron 401; smoke Playwright ✔ (ulang setelah timeout cold start).
- **Masalah / catatan:** percobaan pertama menerima transfer 404 (variabel shell kosong di lingkungan agen) → permintaan pertama tertunda dibiarkan kedaluwarsa, diulang lewat skrip Python. Cadangan nilai env tidak bisa (env *sensitive*) — tidak dibutuhkan karena env ikut transfer. Token deploy pernah tertulis di chat → rotasi.
- **Berikutnya:** cabut token lama akun `oatse`; project produksi saat OD-4 Supabase siap. Token deploy yang pernah tertulis di chat: pemilik projek memutuskan **tidak dirotasi** (2026-10-16).

### 2026-10-15 — Panduan pindah deployment ke akun Vercel Pro (Oatse)
- **Dikerjakan (permintaan pemilik projek):** `pindah-akun-vercel.md` — inventaris 2 project staging (id, root, region, proteksi), 18 env api + 4 env web (nama saja), 6 cron `vercel.json` (+ 3 cron TM belum terdaftar), 5 secret GitHub, URL Supabase Auth; jalur A transfer project (fitur Vercel transfer-request) vs B buat baru; verifikasi (`vercel crons ls`, health, 401 cron, email, storage); rollback; peluang setelah Pro.
- **Keputusan:** belum — pemilik projek memilih jalur (A/B), tujuan akun (staging/produksi, terkait OD-4), dan domain sendiri.
- **Verifikasi:** rujukan D-016/D-029/D-030/D-036 & RELEASE §6 dicek; batas cron Hobby vs Pro **belum diverifikasi** dari halaman harga (ditandai di dokumen). MCP Vercel tidak punya akses scope `oatses-projects` (403) sehingga pengaturan project dibaca dari D-036 & workflow, bukan dashboard.
- **Masalah / catatan:** —
- **Berikutnya:** jalankan saat pemilik projek siap (setiap langkah tulis ditanya).

### 2026-10-13 — Perapihan dokumen instruksi: induk → folder per fitur (Oatse)
- **Dikerjakan (grill 3 putaran, rencana disetujui pemilik projek):** PROGRESS 271 KB → **induk 10 KB** (status per fitur + PIC + branch, fokus, blocker, OD, backlog, log ringkas); checklist per fase → `docs/features/<fitur>/README.md` (12 fitur, kode prefix FND/IAM/ORG/EMP/IMP/ONB/ARS/DSB/TM/KTR/PAY/HRD); `docs/design/*` → `features/*/design.md` (`git mv`); log sesi lama → `archive/log-2026-09.md`, `archive/log-2026-10.md` (utuh); §1–§2 lama + antrean #1–#49 → `archive/progress-fokus-2026-10-13.md`; PLAN §8–§9 (53 KB) → `decisions.md` utuh + indeks satu baris di PLAN §8; CODEMAP §6 + pohon file per modul → `docs/codemap/<modul>.md` + `database.md`; baru `RELEASE.md` (jalur D-043, antrean aktif, saklar `FEATURES` per jalur, riwayat rilis, Rilis 1, wajib pra-produksi) & `docs/README.md` (peta baca).
- **Keputusan (pemilik projek):** nomor `D-001`–`D-073`/`OD-1`–`OD-15` dibekukan; keputusan baru berprefix fitur (`TM-D1`, `TM-OD1`, lintas `X-D1`) di README fitur; rekan tim (Mat) hanya menulis folder fiturnya, induk diperbarui saat merge ke develop; QA tetap di `docs/qa/` (ditautkan dari README fitur). Aturan ditulis di PROMPT §1, §2, §8 "Aturan untuk rekan tim", §12, §13; CLAUDE.md; skill `hris-workflow`, `hris-qa-docs`, `hris-db-schema`.
- **Verifikasi:** script tautan + anchor (slug GitHub) **669 tautan, 0 rusak** (di luar `archive/`, yang sengaja tidak diubah) · script pembanding isi: setiap baris PROGRESS/PLAN/CODEMAP/desain lama ada di lokasi baru, kecuali judul bagian, kalimat pengantar, aturan lama & templat log yang sengaja diganti (diperiksa satu per satu) · biome ✔ · typecheck ✔ · `db:check` ✔ · `db:migrate` "Already in sync" · test shared 200 · api 676 · web 253 ✔.
- **Masalah / catatan:** script perbaikan rujukan sempat mengubah komentar di migrasi `20261005083543_add_document_types_and_versions/migration.sql` → **dikembalikan** (aturan emas #11; komentar lama `design/arsip-karyawan.md` di file migrasi itu dibiarkan). Rujukan bagian lama di `archive/` (mis. "PROGRESS §2") sengaja tidak diubah. Komentar path desain di 13 file kode/skema diperbarui (komentar saja).
- **Berikutnya:** commit + push (izin), Mat pull develop sebelum lanjut; ukur ulang setelah beberapa sesi apakah README fitur besar (import 13 KB, TM 12 KB) perlu diringkas.
