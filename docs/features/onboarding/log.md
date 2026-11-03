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

### 2026-11-03 — Lindungi unggahan HR di wizard (Oatse + Codex)
- **Dikerjakan:** konfirmasi memakai validasi path ketat, menolak referensi dokumen aktif/soft-deleted sebelum akses metadata/cleanup, dan menangani benturan saat konfirmasi sebagai 409. `removable`, hapus, dan penggantian dokumen tunggal kini mensyaratkan akun pengunggah sama dengan pemilik, termasuk kandidat.
- **Keputusan:** brief audit keamanan 6/R2 bagian C; unggahan HR dikoreksi lewat HR.
- **Verifikasi:** regresi gagal sebelum perbaikan; 71/71 test terarah lulus (termasuk alur normal dan penghapusan unggahan sendiri). Typecheck, Biome, boundaries lulus; `bun run test:api` pada DB lokal sementara terisolasi 1109/1109 lulus (89 file, 4294 assertion), DB sementara sudah dihapus.
- **Masalah / catatan:** test pada DB bersama bertabrakan dengan proses test paralel; tanpa perubahan migrasi atau dependency. Belum dirilis.
- **Berikutnya:** review supervisor dan integrasi ke develop.

