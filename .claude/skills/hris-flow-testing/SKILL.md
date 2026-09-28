---
name: hris-flow-testing
description: Cara menguji alur bisnis & akses HRIS di level API (bun test + PostgreSQL lokal): skenario flow multi-langkah, matriks akses role/grant sebagai tabel (TDD), test policy/service, dan aturan data uji. Use when writing or reviewing unit/integration tests for apps/api, testing a business flow (employee CRUD, approval, leave, payroll), the access matrix (PLAN §4.3), policies, or when fixing a bug that needs a failing test first.
---

# Pengujian Flow & Akses HRIS

Sumber: PROMPT §10 (jenis test), §11 (Definition of Done), PLAN §4.3 (matriks akses), §5 (aturan bisnis).

## Jenis test & lokasi

| Tingkat | Lokasi | Isi |
|---|---|---|
| Unit policy | `src/modules/<m>/__tests__/<m>.policy.test.ts` | Tabel `(role, grants, aksi, target) → boleh`, **TDD** |
| Unit service | `src/modules/<m>/__tests__/<m>.service.test.ts` | Aturan bisnis dengan repository palsu |
| Integration endpoint | `tests/integration/<m>/<resource>.test.ts` | HTTP via `app.request()` → PostgreSQL lokal: sukses, 400 validasi, 401, 403, 404 |
| Flow | `tests/integration/flows/<alur>.test.ts` | Beberapa request berurutan yang mewakili satu cerita pengguna |
| Web | `apps/web/tests/` (Vitest) | Form, guard route, komponen bersama |

## Alur kerja (per item checklist)

```
- [ ] Tulis baris matriks akses dari PLAN §4.3 untuk aksi baru → test policy MERAH
- [ ] Implement policy → HIJAU
- [ ] Integration: 1 sukses + 1 validasi (400) + 1 tanpa token (401) + 1 role ditolak (403) per endpoint
- [ ] Respons disaring: role tanpa grant TIDAK menerima field sensitif (cek key tidak ada, bukan hanya null)
- [ ] Aksi sensitif → assert baris audit log tertulis
- [ ] Flow test bila endpoint bagian dari cerita (mis. buat karyawan → isi data pribadi → lihat sebagai MANAGER tim)
- [ ] bun run test:api; bug fix = test gagal dulu (PROMPT §10)
```

## Aturan data uji

- Auth tidak memanggil Supabase: `createApp({ tokenVerifier: testVerifier })` + `createAuthFixture(RUN).loginAs(role, { grants, employeeId, isActive })` dari `tests/helpers/auth.ts` → `{ account, headers }`; panggil `cleanup()` di `afterAll`. Grant memakai nama enum Prisma (`EMPLOYEE_PERSONAL_READ`).
- Setiap file memakai penanda `RUN = crypto.randomUUID().slice(0, 8)` pada kunci bisnis (nomor karyawan, nama master) dan membersihkan datanya di `afterAll`, urut anak → induk.
- Factory di `tests/helpers/factories.ts`; NIK/NPWP fiktif berformat valid, tanpa data asli.
- `await expect(attempt(() => prismaQuery)).rejects...` (PrismaPromise perlu dibungkus, lihat skill `hris-db-schema`).
- Waktu: bekukan jam lewat parameter/fake clock, jangan bergantung jam mesin; logika harian memakai `Asia/Jakarta`.

Templat matriks akses, integration endpoint, dan flow: [TEMPLATES.md](TEMPLATES.md).
