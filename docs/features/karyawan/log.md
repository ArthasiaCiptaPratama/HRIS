# Log — Karyawan — Personal Management

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

### 2026-10-15 — Tampilan header detail karyawan (Oatse)
- **Dikerjakan (rencana disetujui pemilik projek):** checklist "Tampilan header detail karyawan". Banner warna logo + pola statis (revisi atas masukan: celah putih di kiri banner = `border-l` panel → dihapus; pola shape ditambah; tanpa animasi), kartu header, status karyawan vs status akun dipisah (beberapa putaran masukan: dua "Aktif" membingungkan → Status Karyawan "Magang | Masih bekerja", Akses Aplikasi "Bisa login / Tidak bisa login", teks rapi tanpa badge & titik, sebab di tooltip, peran akun hanya di tab Kepegawaian; pemilik projek: "untuk sementara boleh gini"), pop-up perbesar foto profil.
- **Keputusan:** tidak ada keputusan baru (warna logo hanya token lokal halaman ini; tetap tanpa gradien sesuai tema D-035).
- **Verifikasi:** typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ · test web **283** (`employee-detail.test.tsx` +3: status terpisah, pop-up foto & tombol kamera, tanpa foto) · build ✔ · screenshot Playwright 1440/1024/390 px terang & gelap, scroll horizontal 0, 0 error JS.
- **Masalah / catatan:** header sempat diubah Mat (template pas foto, merge `e400586`) — perubahan ini hanya tampilan di atasnya. Istilah "Akses Aplikasi" masih bisa diganti (opsi: hapus dari header / "Akun HRIS") — sementara dipertahankan.
- **Berikutnya:** izin commit; pertimbangkan warna brand aplikasi mengikuti logo (usulan terpisah).

