# Hasil Uji — Foto Profil & Bucket Supabase (2026-09-29)

- **Commit:** working tree di atas `7b22afc` (belum di-commit) · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal Linux + Storage staging · **Bun/PG:** 1.4.2 / PostgreSQL 17
- **Perintah & ringkasan:**
  - Migrasi `20260929100000_add_employee_photo` (lokal) → `db:check` "No difference detected."
  - `bun run storage:setup` (staging) → `employee-photos: dibuat` lalu diulang `diperbarui` (idempoten); MCP: bucket `public=false`, 2 097 152 byte, jpeg/png/webp
  - `bun run typecheck` ✔ · `bunx biome ci .` ✔ (206 file) · `bun run check:boundaries` ✔ (182 modul) · `bun run test` ✔ (shared 10 · api 265 · web 64; SMTP dikosongkan)
  - Smoke Storage staging (script di scratchpad): unggah via token + anon ✔, info ✔, baca signed URL 200 ✔, URL publik **400**, anon list **0**, token ke path lain **ditolak**, GIF **ditolak**, objek uji dihapus (MCP: 0 objek)
  - Playwright login sungguhan: `ui.ts` → **9/9 LULUS**
  - File .xlsx (openpyxl + Pillow): 2 gambar (logo + foto), foto JPEG 600×787, anchor (1,8)→(9,24), 244 merge
  - Advisor security staging: tanpa temuan baru (hanya INFO `_prisma_migrations` & WARN leaked password yang sudah diketahui)

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-046 | LULUS | POL 10 baris baru (62 pass) |
| TC-EMP-047 … TC-EMP-050 | LULUS | FOTO 7 pass (`photo.test.ts`) |
| TC-EMP-051 | LULUS | smoke Storage staging (lihat ringkasan) |
| TC-EMP-052 | LULUS | DET 3 test; UI `hr-detail-dengan-foto.png`, `hr-daftar-dengan-foto.png`, `emp-profil-dengan-foto.png`, `emp-profil-foto-dihapus.png` |
| TC-EMP-053 | LULUS | PRN 7 test; file `hr-Data Pegawai - ACP-2023-0007 - Agus Pratama.xlsx` |

**Bukti:** `/mnt/winD/WORK/Magang/QA/2026-09-29-foto-profil/` (foto uji lanskap 1600×1000 dengan pita merah kiri-kanan untuk membuktikan pemotongan 3:4).

**Temuan selama uji (diperbaiki):** avatar tampak kosong selama foto dimuat → inisial kini selalu di bawah foto.

**Data tersisa (disengaja):** foto uji Agus Pratama di DB lokal + 1 objek di bucket staging (untuk dilihat pemilik projek); 4 audit foto di DB lokal.

## Sesi staging (setelah deploy `adbe6ca`, `Deploy staging` #36556445220)
- **Env:** https://hris-staging-web.vercel.app + api staging, login Supabase sungguhan HR & MGR, Playwright Chromium 1440×900. MCP: migrasi `add_employee_photo` selesai, kolom `photo_path` ada.
- **Hasil:** 6/6 LULUS — HR unggah foto (Agus Pratama) → tampil 600×800 dari signed URL bucket private; Print data berfoto (JPEG 600×787 di xlsx); hapus foto → inisial; MANAGER tanpa tombol kamera; konsol bersih.
- **Bukti:** `/mnt/winD/WORK/Magang/QA/2026-09-29-foto-profil-staging/`. Staging dibersihkan (0 pegawai berfoto; audit 1 update + 1 delete).

**Kesimpulan:** memenuhi kriteria rencana. **Bug terbuka:** tidak ada.
**Belum diverifikasi:** browser selain Chromium; Windows. Tampilan foto di Excel sudah dicek pemilik projek.
