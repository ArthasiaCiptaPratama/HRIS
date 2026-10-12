# Hasil Uji — Dashboard yang bisa diatur (D-065) + ringkasan SA/HR (2026-10-12)

- **Lokal:** test otomatis di develop `3272c53` — api 598 (termasuk `dashboard-pivot.test.ts`, `dashboard.test.ts`, `iam/dashboard-layout.test.ts`) · web 206 (`dashboard.test.tsx`, `dashboard-pivot-data.test.ts`) ✔; browser lokal setelah gabung branch Mat 2026-10-09 (Dashboard 89 karyawan, Tambah widget/Atur dashboard) ✔.
- **Staging (2026-10-12):** staging `hris-staging-web` / `hris-staging-api` (rilis gel. 4: rilis `6b5bae5`, `Deploy staging` #38205386868), Supabase staging · akun uji SA/HR/MGR/EMP · Playwright Chromium 1.56 (`/mnt/winD/WORK/Magang/QA/2026-10-12-staging-gel4/`). `c-dashboard.ts` → C-01–C-04, C-06, C-07 LULUS; C-05 GAGAL karena **asumsi skrip** (HR dikira punya grant aktif; grant `employee.personal.read` HR kedaluwarsa 2026-10-08 → template terkunci = benar). Diganti `c5-pribadi.ts` → C-05a & C-05b **LULUS**.

| ID | Hasil | Bukti / catatan |
|---|---|---|
| C-01 | LULUS | HR: ringkasan (Total/Aktif/Nonaktif/Masa kerja) + 11 widget + Tambah widget/Atur dashboard; `GET /dashboard` 200 — `staging-c-01-dashboard-hr.png` |
| C-02 | LULUS | Template "Jenis Kelamin per Kategori" ditambahkan & tetap ada setelah muat ulang |
| C-03 | LULUS | Buat grafik sendiri → "QA G4 Pivot" — `staging-c-03-editor.png`, `staging-c-03-pivot-ditambah.png` |
| C-04 | LULUS | Atur → hapus widget → Reset → toast, widget tambahan hilang — `staging-c-04-reset.png` |
| C-05a | LULUS | HR grant kedaluwarsa: template agama terkunci "Butuh grant baca data pribadi", API pivot agama 403 — `staging-c-05a-hr-terkunci.png` |
| C-05b | LULUS | SA: template terbuka; API pivot agama 200 berisi jumlah saja — `staging-c-05b-sa-terbuka.png` |
| C-06 | LULUS | MANAGER & EMPLOYEE: "Dashboard masih kosong", tanpa tombol; `/dashboard` & pivot 403/403 — `staging-c-06-dashboard-emp.png` |
| C-07 | LULUS | Susunan HR kembali bawaan (`layout: null`) |

| Case | Hasil | Otomasi / bukti |
|---|---|---|
| TC-EMP-091 | LULUS | DSH + WDSH; staging C-01, C-06 |
| TC-EMP-092 | LULUS | DSH; staging C-01 (angka ringkasan = jumlah karyawan staging saat uji) |
| TC-EMP-209 | LULUS | staging C-01, C-06 |
| TC-EMP-210 | LULUS | staging C-02 |
| TC-EMP-211 | LULUS | staging C-03 |
| TC-EMP-212 | LULUS | staging C-04, C-07 |
| TC-EMP-213 | LULUS | staging C-05a, C-05b |

**Catatan:** 0 error konsol (HR, MANAGER, EMPLOYEE). Grant HR uji kedaluwarsa → bila perlu menguji "HR dengan grant aktif", perpanjang grant lewat Administrasi › Akun.

**Kesimpulan:** LULUS lokal + staging — **LEGIT**. **Bug terbuka:** tidak ada.
