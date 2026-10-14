# Hasil Uji — Aset & APD gel. 2a, lokal (2026-10-14)

- **Commit:** develop `e378730` (+ perbaikan nomor BAST unik & badge "—" di daftar pegangan, di-commit bersama dokumen ini) · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal (DB `hris`, Auth staging)
- **Perintah & ringkasan:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ (1 warning lama `employee-print.test.ts`) · `bun run check:boundaries` ✔ (417 modul) · `db:check` ✔ · `bun run test` → shared **215** · api **713** · web **262** — 0 gagal · build ✔
- **Script:** `/mnt/winD/WORK/Magang/QA/2026-10-14-aset-lokal/qa-aset.ts` — putaran akhir RUN 7175 **12/12**, 0 error JS/5xx (putaran 1–3 di `run1/`–`run3/`: kegagalan = selector script & sisa data run sebelumnya, lihat catatan).

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-215 | LULUS | L-01: kategori `Q7175` (seri wajib), Helm (wajib kembali), Sepatu (12 bulan) — `L-01.png` |
| TC-EMP-216 | LULUS | L-02: seri kosong ditahan; kode otomatis `ACP-Q7175-0001`; Rp 15.250.000 tampil untuk SA — `L-02.png` |
| TC-EMP-217 | LULUS | L-03: diserahkan ke Rizky, kembali paling lambat 16 Okt 2026, "Belum dikonfirmasi" — `L-03.png`; PT lain/terpegang/unik parsial di integration |
| TC-EMP-218 | LULUS | L-04: `BAST-serah-ACP-Q7175-0001-2026-10-14.pdf` — judul, pihak, kode, SN, batas kembali; tanpa harga — `L-04-bast-serah.png` |
| TC-EMP-219 | LULUS | L-05: scan diunggah → "Scan BAST terlampir" — `L-05.png` |
| TC-EMP-220 | LULUS | L-06: Andi (MGR) melihat aset Rizky tanpa harga & tombol kelola — `L-06.png` |
| TC-EMP-221 | LULUS | L-07: HR tanpa grant lihat saja — `L-07.png` |
| TC-EMP-222 | LULUS | L-08: Helm × 1 ukuran L — `L-08.png` |
| TC-EMP-223 | LULUS | L-09: aset & helm "Diterima karyawan"; tanpa harga — `L-09.png` |
| TC-EMP-224 | LULUS | L-10: HP 390 px scroll 0 — `L-10.png` |
| TC-EMP-225 | LULUS | L-11: peringatan 2 item di form nonaktifkan (tidak disimpan) — `L-11.png` |
| TC-EMP-226 | LULUS | L-12: kembali Rusak → Perbaikan; BAST pengembalian berisi kondisi & catatan; nomor `BAST-K/…/2B2A3F` ≠ `BAST-S/…` — `L-12-bast-kembali.png` |

**Catatan:**
- **Bug ditemukan & diperbaiki saat uji (P3):** nomor BAST pengembalian sama dengan BAST serah bila di hari yang sama (`BAST/<kode>/<tanggal>`), dan BAST APD sejenis untuk dua karyawan di hari sama juga bentrok → nomor kini `BAST-S|K|H|APD/<kode>/<tanggal>/<6 karakter id transaksi>` (`bastNumber`, test `asset-bast.test.ts` gagal dulu lalu lulus). Tidak dibuatkan file BUG terpisah karena ditemukan & diperbaiki sebelum commit fitur.
- Putaran 1: L-09/L-10 gagal karena selector (nama aset = nama kategori → 2 elemen). Putaran 2: L-09 gagal karena Helm RUN 6967 dari putaran 1 masih menunggu konfirmasi (dicek di DB: item RUN 7013 sudah dikonfirmasi) → pemeriksaan dibatasi ke item RUN berjalan. Putaran 3 (RUN 7069) 12/12; putaran akhir (RUN 7175) 12/12 setelah perbaikan nomor BAST.
- Pihak Pertama di BAST memakai email bila pengelola (SA) tidak tertaut data karyawan — sesuai desain, dicatat sebagai temuan tampilan.
- Data uji tersisa di DB **lokal**: kategori/jenis/aset `Q6967`, `Q7013`, `Q7069`, `Q7175` + pembagian Helm untuk Rizky; file scan BAST di storage staging berawalan `dev/oatse/`.

**Kesimpulan:** semua P1/P2 LULUS di lokal; tidak ada bug terbuka. Belum LEGIT (butuh uji staging setelah rilis) → belum diarsip ke Drive.
