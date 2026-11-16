# Log — Onboarding karyawan baru

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

### 2026-11-16 — Ubah email & batalkan undangan akun (ONB-D1) (Oatse)
- **Dikerjakan:** item "Ubah email & batalkan undangan akun belum login + perbaikan antrean (ONB-D1)": iam `retireUnusedEmployeeAccount` (+ `authUserCreatedByInvite` dari audit), `getEmployeeAccountStates.authEmail`; employee `cancelInvitation`/`changeInvitationEmail` + route `DELETE /onboarding/{employeeId}/invitation`, `PUT /onboarding/{employeeId}/invitation-email` (operationId eksplisit); antrean: `EMAIL_MISMATCH`, cek ulang `QUEUED` + `markInvitation` bersyarat, cek akun milik karyawan sebelum cek email; web Penerimaan menu ⋯ (Ubah email undangan / Batalkan undangan + konfirmasi), label kode baru, petunjuk di dialog Undang Karyawan Terdaftar.
- **Keputusan:** ONB-D1 (README). Penyempurnaan supervisor: user Auth yang sudah ada sebelum undangan tidak di-ban/dianonimkan.
- **Verifikasi:** test API onboarding 23/23 (10 kasus baru: ubah email + ban/anonim, antrean `EMAIL_CHANGED`, 409/422/400, akses 404/403/401, batalkan + undang ulang, user Auth bersama tidak disentuh (batal & ubah email), sudah login 422 + karyawan existing utuh, `EMAIL_MISMATCH` + 409 kirim ulang, kirim ulang email sama SENT, operationId); web onboarding 6/6. Uji nyata Supabase Auth lokal (GoTrue v2.197.0, proyek sementara, Mailpit): kontrol undangan sah; undangan & tautan atur password lama setelah ban+anonim ditolak "Email link is invalid or has expired"; pembanding ban saja → "User is banned", ganti email saja → ditolak; user Auth yang tidak disentuh tetap sah. Bukti `/mnt/winD/WORK/Magang/QA/2026-11-16-onb-d1-tautan/`. Verifikasi penuh 2026-11-16: typecheck ✔ · `biome ci` ✔ (720 file, 1 peringatan lama `roster-edit.service.ts`) · boundaries ✔ (566 modul) · test shared 375 · api 1356/1356 (102 file, serial) · web 371/371 (52 file).
- **Masalah / catatan:** temuan — kirim ulang ke akun yang sudah ada dulu selalu gagal `EMAIL_HAS_ACCOUNT` (urutan cek), ikut diperbaiki. `supabase/config.toml` repo gagal diam-diam (exit 1 tanpa pesan) di Supabase CLI 3.1.0 & 2.54 ("failed to parse config") di Linux — uji memakai proyek sementara; belum diperbaiki (di luar cakupan).
- **Berikutnya:** commit + push develop (keputusan supervisor), lalu rilis bersama antrean berikutnya.

### 2026-11-03 — Lindungi unggahan HR di wizard (Oatse + Codex)
- **Dikerjakan:** konfirmasi memakai validasi path ketat, menolak referensi dokumen aktif/soft-deleted sebelum akses metadata/cleanup, dan menangani benturan saat konfirmasi sebagai 409. `removable`, hapus, dan penggantian dokumen tunggal kini mensyaratkan akun pengunggah sama dengan pemilik, termasuk kandidat.
- **Keputusan:** brief audit keamanan 6/R2 bagian C; unggahan HR dikoreksi lewat HR.
- **Verifikasi:** regresi gagal sebelum perbaikan; 71/71 test terarah lulus (termasuk alur normal dan penghapusan unggahan sendiri). Typecheck, Biome, boundaries lulus; `bun run test:api` pada DB lokal sementara terisolasi 1109/1109 lulus (89 file, 4294 assertion), DB sementara sudah dihapus.
- **Masalah / catatan:** test pada DB bersama bertabrakan dengan proses test paralel; tanpa perubahan migrasi atau dependency. Belum dirilis.
- **Berikutnya:** review supervisor dan integrasi ke develop.

