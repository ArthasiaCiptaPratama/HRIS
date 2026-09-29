# PROMPT — Protokol Kerja HRIS

> **Fungsi file ini:** menjelaskan **bagaimana bekerja** di projek ini: protokol setiap sesi, aturan emas, konvensi kode/API/DB/Git, Definition of Done, dan **template prompt siap salin**.
> Berlaku untuk **AI agent** (Claude Code, dll.) dan **developer manusia**. Ikuti aturan di sini apa adanya. Jika ada aturan yang menghalangi pekerjaan, **tanyakan dulu** sebelum melanggarnya.

---

## 1. Urutan Membaca di Awal Sesi

1. **`docs/PROMPT.md`** (file ini), terutama §3 Aturan Emas.
2. **`docs/PROGRESS.md` §2 Fokus Saat Ini** dan checklist fase aktif.
3. **`docs/PLAN.md`**: bagian yang relevan dengan tugas (model akses §4 dan aturan bisnis §5 hampir selalu relevan).
4. **`docs/CODEMAP.md`**: bagian modul/folder yang akan disentuh.
5. Kode yang benar-benar akan diubah.

Jangan membaca seluruh repo tanpa tujuan. Gunakan CODEMAP untuk langsung menuju file yang tepat.

---

## 2. Protokol Sesi

Rincian operasional (kapan bertanya, status per poin, pengisian PROGRESS, format laporan) ada di skill **`.claude/skills/hris-workflow/`**, yang wajib dipakai untuk setiap tugas.

| Langkah | Yang dilakukan |
|---|---|
| **1. Orientasi** | Baca sesuai §1. Sebutkan fase aktif, item checklist yang akan dikerjakan, dan keputusan terbuka yang relevan. |
| **2. Rencana** | Tulis rencana singkat: poin kerja, file yang akan dibuat/diubah, test, aksi keluar, dan risiko. **Selalu tunggu persetujuan** sebelum mulai (kecuali pertanyaan/penjelasan dan pemeriksaan read-only). |
| **3. Kerjakan** | Satu poin dalam satu waktu; setelah tiap poin: cek relevan, perbarui checklist PROGRESS, status singkat, lanjut. Langkah baru → sub-item fase aktif "(tambahan YYYY-MM-DD)". Test dulu untuk policy & payroll (TDD). Ikuti konvensi §4–§9. **Setiap aksi keluar** (commit, push, PR, deploy, tulis ke layanan luar) ditanyakan tepat sebelum dijalankan; `main` hanya atas permintaan eksplisit. |
| **4. Verifikasi** | Jalankan `bun run typecheck`, `bun run lint`, `bun run check:boundaries`, dan test yang relevan. Laporkan hasil apa adanya, termasuk yang gagal. |
| **5. Catat** | Perbarui **PROGRESS** (§2 Fokus + log sesi di akhir; checklist sudah per poin), **CODEMAP** (status & item baru), dan **PLAN** jika ada keputusan baru. Tutup dengan laporan akhir format `hris-workflow`. |

Sesi tidak dianggap selesai sebelum langkah 5 dilakukan.

---

## 3. Aturan Emas

1. **Kerjakan fase aktif saja.** Ide di luar fase masuk PROGRESS §5 Backlog.
2. **Jangan memutuskan keputusan terbuka (OD) sendiri.** Kalau tugas bergantung pada OD, berhenti dan tanyakan.
3. **Batas modul mutlak:** modul lain hanya boleh di-import lewat `modules/<modul>/index.ts`. Tidak ada query ke tabel modul lain, termasuk lewat `include` Prisma.
4. **FK lintas modul hanya ke modul inti** (`employee`, `organization`).
5. **Setiap endpoint punya cek akses eksplisit** di `<modul>.policy.ts`. Default-nya **tolak**. UI yang menyembunyikan tombol bukan pengganti cek di API.
6. **Nominal gaji hanya untuk SUPER_ADMIN.** Tidak ada endpoint, log, email, atau respons lain yang membocorkannya ke role lain.
7. **Data sensitif** (NIK, NPWP, KK, rekening, alamat, gaji, selfie, dokumen) **tidak pernah** ditulis ke log, pesan error, atau email.
8. **Semua input divalidasi dengan Zod** di batas sistem: body, query, params, env, file import, dan respons pihak luar.
9. **Waktu absensi selalu dari server.** Jam perangkat tidak pernah dipercaya.
10. **Tarif pajak/BPJS tidak pernah di-hardcode.** Selalu dari tabel konfigurasi.
11. **Migrasi yang sudah di-merge tidak pernah diedit.** Perubahan skema = migrasi baru.
12. **Prisma tidak pernah menyentuh skema milik Supabase** (`auth`, `storage`, dll.).
13. **Rahasia tidak pernah di-commit.** Hanya `.env.example` tanpa nilai. `SUPABASE_SERVICE_ROLE_KEY` tidak pernah ada di kode frontend.
14. **Aksi sensitif menulis audit log**: perubahan role/grant, akses & perubahan data sensitif, keputusan approval & override, semua aksi payroll.
15. **Jangan klaim selesai tanpa verifikasi.** Sebutkan perintah yang dijalankan dan hasilnya.
16. **Dokumen instruksi ikut diperbarui** di commit yang sama dengan perubahan kodenya.

---

## 4. Konvensi Kode (TypeScript)

- **TypeScript strict** (`"strict": true`). Hindari `any`; gunakan `unknown` + validasi Zod.
- **ESM** di semua workspace.
- **Penamaan:**
  - file `kebab-case` atau `<modul>.<peran>.ts`
  - variabel/fungsi `camelCase`
  - tipe/kelas/komponen React `PascalCase`
  - konstanta `UPPER_SNAKE_CASE`
- **Bahasa kode:** identifier, nama tabel/kolom, dan pesan log dalam **bahasa Inggris**. Teks yang tampil ke pengguna dalam **bahasa Indonesia**.
- **Tipe dari Zod:** `type X = z.infer<typeof xSchema>`. Jangan menulis tipe yang sama dua kali.
- **Error:** lempar turunan `AppError` (mis. `NotFoundError`, `ForbiddenError`, `ConflictError`, `BusinessRuleError`), jangan `throw new Error("...")` mentah di logika bisnis.
- **Uang:** jangan pernah memakai `number` JS untuk nominal. Pakai `Prisma.Decimal` untuk perhitungan dan tulis aturan pembulatan secara eksplisit.
- **Tanggal & waktu:** simpan `timestamptz` UTC. Logika bisnis harian (telat, hari kerja, periode) memakai zona `Asia/Jakarta` dari pengaturan sistem. Kolom tanggal murni (tanggal cuti, hari libur) memakai tipe `date`.
- **Komentar** hanya untuk menjelaskan *kenapa*, bukan *apa*. Aturan bisnis yang tidak jelas dari kode diberi rujukan ke PLAN (mis. `// PLAN §5.2: satu penolakan = REJECTED final`).
- **Format & lint:** Biome. Jangan menonaktifkan aturan tanpa komentar alasan.

### Layer dalam modul
| File | Boleh | Tidak boleh |
|---|---|---|
| `routes` | Definisi route OpenAPI, validasi, panggil policy & service, bentuk respons | Query Prisma, logika bisnis |
| `policy` | Keputusan akses murni: (aktor, aksi, target) → boolean/alasan | Query DB langsung (data target diberikan oleh pemanggil) |
| `service` | Aturan bisnis, transaksi, memanggil repository & `index.ts` modul lain, audit | Mengakses `Context` Hono, query Prisma langsung |
| `repository` | Query Prisma ke tabel modul sendiri | Aturan bisnis, akses tabel modul lain |
| `index.ts` | Mengekspor fungsi service yang boleh dipakai modul lain + tipe publik | Mengekspor repository atau detail internal |

---

## 5. Konvensi API

- **Base path:** `/api/v1`. Resource berupa **kata benda jamak kebab-case**: `/leave-requests`, `/work-locations`.
- **Aksi non-CRUD** memakai sub-resource kata kerja: `POST /leave-requests/:id/cancel`, `POST /approvals/:id/decide`.
- **Method:** `GET` baca · `POST` buat/aksi · `PATCH` ubah sebagian · `DELETE` hapus (soft delete bila data punya nilai arsip).
- **JSON field:** `camelCase`.
- **Envelope sukses:**
  ```json
  { "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 134 } }
  ```
  `meta` hanya ada pada daftar berpaginasi.
- **Envelope error:**
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Pesan untuk pengguna", "details": [ ... ], "requestId": "..." } }
  ```
- **Status code & kode error:**

| HTTP | `code` | Kapan |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input tidak lolos Zod |
| 401 | `UNAUTHENTICATED` | Token tidak ada/tidak valid/kedaluwarsa |
| 403 | `FORBIDDEN` | Login, tapi tidak berhak (role/grant/tim) |
| 404 | `NOT_FOUND` | Data tidak ada **atau** tidak boleh diketahui keberadaannya |
| 409 | `CONFLICT` | Duplikat / bentrok status (mis. kontrak overlap) |
| 422 | `BUSINESS_RULE_VIOLATION` | Melanggar aturan bisnis (mis. saldo cuti tidak cukup) |
| 500 | `INTERNAL_ERROR` | Tidak terduga (detail hanya di log server) |

- **Paginasi:** `?page=1&pageSize=20` (maks 100). **Filter:** query param bernama jelas (`?departmentId=&status=`). **Urutan:** `?sort=joinDate:desc`. **Pencarian:** `?q=`.
- **OpenAPI:** setiap route didefinisikan dengan `@hono/zod-openapi` (termasuk respons error), supaya dokumen di `/api/v1/openapi.json` selalu lengkap untuk tim mobile.
- **Respons disaring sesuai akses:** field sensitif dihilangkan dari respons (bukan hanya disembunyikan di UI) bila aktor tidak berhak.
- **Header:** `Authorization: Bearer <jwt Supabase>`, `X-Request-Id` (dibuat server bila tidak dikirim, dikembalikan di respons).

---

## 6. Konvensi Database & Prisma

- **Satu file `.prisma` per modul** di `apps/api/prisma/schema/`. Setiap model diberi `@@schema("<modul>")`.
- **Model** `PascalCase` tunggal → **tabel** `snake_case` jamak via `@@map`. **Field** `camelCase` → **kolom** `snake_case` via `@map`.
- **Primary key:** `id String @id @default(uuid()) @db.Uuid`.
- **Kolom wajib:** `createdAt`, `updatedAt`. Tambahkan `deletedAt` hanya untuk data yang di-soft delete.
- **Uang:** `Decimal @db.Decimal(15, 2)`. **Koordinat:** `Decimal @db.Decimal(9, 6)`.
- **Enum:** enum Prisma untuk himpunan tetap (status, role). Himpunan yang diatur SUPER_ADMIN (jenis izin, komponen gaji) disimpan di **tabel**, bukan enum.
- **Relasi lintas modul:** FK hanya ke `employee`/`organization` (PLAN §3.2). Di luar itu simpan UUID tanpa relasi.
- **Migrasi:**
  - lokal: `bun run db:migrate` (`prisma migrate dev --name <deskripsi_snake_case>`)
  - staging/produksi: `bun run db:deploy`
  - migrasi di-commit bersama perubahan skemanya
  - migrasi yang sudah di-merge **tidak pernah diedit**
- **SQL mentah** (mis. index khusus, constraint yang tidak didukung Prisma) ditambahkan ke file migrasi hasil `--create-only` dan diberi komentar alasan. SQL mentah tidak boleh merujuk skema milik Supabase (`auth`, `storage`), karena migrasi juga harus jalan di PostgreSQL lokal (D-023).
- **Transaksi:** perubahan yang harus atomik (approval final + potong saldo, lock payroll) memakai `prisma.$transaction`.
- **Seed** hanya berisi data dummy. Data asli tidak pernah masuk seed atau repo. Email di seed memakai plus-addressing milik developer (PLAN §3.3), bukan alamat fiktif yang bisa menerima email.
- **Portabilitas (D-023):** migrasi harus lulus di PostgreSQL polos dan di Supabase. Jangan memakai `CREATE EXTENSION` atau objek milik Supabase. Skema modul tidak pernah ditambahkan ke *Exposed schemas* Data API Supabase.

---

## 7. Konvensi Frontend

- Satu folder per modul di `src/features/<modul>/` berisi `pages/`, `components/`, `api.ts` (hook TanStack Query), dan `schemas.ts`.
- **Server state** lewat TanStack Query, bukan `useState` + `useEffect` fetch manual.
- **Form:** React Hook Form + `zodResolver`, memakai skema dari `@hris/shared` bila sama dengan API.
- **Tabel:** komponen `DataTable` bersama (TanStack Table) dengan paginasi server-side.
- **Akses di UI:** menu dan tombol disembunyikan memakai `lib/access.ts`, tapi **API tetap sumber kebenaran**. Tangani 403 dengan pesan yang jelas.
- **Teks UI** bahasa Indonesia. Format tanggal `dd MMM yyyy`, zona `Asia/Jakarta`, uang `Rp 1.234.567`.
- **Selfie:** ambil dari kamera (`getUserMedia`), kompres di client, upload ke signed URL. Input file dari galeri tidak disediakan.
- Komponen shadcn/ui di `components/ui/` boleh disesuaikan, tapi perubahan besar dicatat.

---

## 8. Konvensi Git

### Branch & alur
```
HRIS/Oatse/Linux-Windows ──PR──▶ HRIS/debug/database ──PR──▶ HRIS/debug/fe-be ──PR──▶ main
```
| Branch | Fungsi | Syarat PR masuk |
|---|---|---|
| `HRIS/Oatse/Linux-Windows` | Kerja harian | – |
| `HRIS/debug/database` | Verifikasi migrasi di PostgreSQL **lokal** & CI | `db:reset` + `db:migrate` bersih di lokal, seed jalan, CI (migrasi dari DB kosong + test integration) hijau |
| `HRIS/debug/fe-be` | Uji integrasi FE+BE di **staging** (Vercel project staging, D-036 + Supabase staging) | CI hijau, `db:deploy` ke staging sukses, uji manual alur yang berubah |
| `main` | Stabil / produksi | CI hijau, review pembimbing/atasan |

- Branch kerja **tidak boleh** diberi sub-branch `HRIS/Oatse/Linux-Windows/...`, karena Git menolak nama yang sekaligus branch dan "folder". Jika butuh branch sementara, gunakan nama sejajar, mis. `HRIS/Oatse/eksperimen-x`.
- Jangan force-push ke `HRIS/debug/*` atau `main`.

### Commit
- **Conventional Commits tanpa scope**, deskripsi **bahasa Indonesia**, huruf kecil, tanpa titik di akhir:
  - `feat: tambah endpoint daftar karyawan`
  - `fix: saldo cuti tidak kembali saat dibatalkan`
  - `refactor: pisahkan kalkulasi bpjs dari service payroll`
  - `test: tambah golden case pph21 k/2`
  - `docs: perbarui codemap modul attendance`
  - `chore: perbarui dependensi prisma`
- Tipe yang dipakai: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`.
- Satu commit = satu perubahan logis. Perubahan skema + migrasi + kode yang memakainya boleh dalam satu commit.

### Checklist PR
- [ ] Item checklist PROGRESS yang dikerjakan disebutkan
- [ ] Typecheck, lint, boundaries, test hijau
- [ ] Tidak ada import lintas modul selain `index.ts`
- [ ] Endpoint baru punya policy + test akses
- [ ] Tidak ada data sensitif di log/respons yang tidak berhak
- [ ] Migrasi baru (jika ada) sudah dicoba di PostgreSQL lokal
- [ ] PROGRESS, CODEMAP (dan PLAN bila perlu) diperbarui

---

## 9. Cross-Platform (Dual Boot Linux & Windows)

- `.gitattributes` memaksa **LF** (`* text=auto eol=lf`). Jangan mengubah line ending secara manual.
- **Semua script ditulis sebagai script Bun/TypeScript** atau perintah `bun` di `package.json`. Tidak ada bash/PowerShell khusus satu OS.
- Path di kode memakai `node:path` (`path.join`), bukan string dengan `/` atau `\` yang di-hardcode.
- Hindari nama file yang hanya berbeda huruf besar/kecil (Windows tidak case-sensitive).
- Docker (untuk PostgreSQL lokal): Docker Engine di Linux, Docker Desktop (WSL2) di Windows.
- Setiap perubahan pada tooling (script, config build) diverifikasi di **kedua OS** sebelum masuk `HRIS/debug/*`.

---

## 10. Testing

| Jenis | Lokasi | Wajib untuk |
|---|---|---|
| Unit api (`bun test`) | `modules/<modul>/__tests__/` | Setiap service & policy |
| Integration api (`bun test`) | `apps/api/tests/integration/` | Setiap endpoint: sukses, validasi, dan akses ditolak |
| Unit web (Vitest) | `apps/web/tests/` | Form penting, guard route, komponen bersama |
| E2E (Playwright) | `e2e/` | Alur utama (Fase 9). Berjalan di lokal (API + PostgreSQL lokal) dengan login sungguhan ke Supabase staging memakai akun uji khusus |

- **TDD wajib** untuk policy (matriks akses PLAN §4.3) dan kalkulasi payroll.
- **Matriks akses dites sebagai tabel:** satu baris = `(role, grant, aksi, target) → boleh/tidak`.
- **Golden cases payroll:** kasus yang diverifikasi pihak luar (OD-3), hasil harus sama sampai rupiah terakhir.
- **Setiap perbaikan bug disertai test** yang gagal sebelum perbaikan.
- Auth di test memakai verifier pengganti (`loginAs(role, grants)`), tidak memanggil Supabase Auth.
- Test integration berjalan terhadap PostgreSQL lokal (di CI: service container Postgres versi yang sama) dan membersihkan datanya sendiri. Storage dan Admin API Supabase diganti stub di test.

---

## 11. Definition of Done

Sebuah item checklist dianggap **selesai** jika:
1. Kode mengikuti konvensi §4–§9.
2. Test sesuai §10 ditulis dan **lulus**.
3. `typecheck`, `lint`, `check:boundaries` hijau.
4. Endpoint baru tercantum di OpenAPI dengan skema request/respons/error.
5. Cek akses sesuai PLAN §4 dan dites.
6. Aksi sensitif menulis audit log.
7. UI terkait (jika bagian dari item) bisa dipakai end-to-end di lokal.
8. PROGRESS dan CODEMAP diperbarui.

Sebuah **fase** selesai jika semua itemnya selesai **dan** kriteria selesai fase di PLAN §7 terpenuhi.

---

## 12. Mencatat Keputusan

- Keputusan arsitektur/bisnis baru → PLAN §8 sebagai `D-xxx` (ID berikutnya) + satu baris di log PROGRESS.
- Keputusan terbuka baru → PLAN §9 sebagai `OD-x` + PROGRESS §4.
- OD terjawab → pindahkan ke PLAN §8, ubah status di PROGRESS §4, catat di log.
- Mengubah keputusan lama: jangan menghapus baris lama. Tandai `(diganti oleh D-yyy)`.

---

## 13. Template Prompt

Salin dan isi bagian dalam `<...>`.

### 13.1 Mulai sesi
```
Mulai sesi kerja HRIS. Ikuti protokol docs/PROMPT.md §1–§2:
baca PROMPT, PROGRESS §2, lalu bagian PLAN dan CODEMAP yang relevan.
Laporkan: fase aktif, item checklist berikutnya, OD yang relevan,
lalu usulkan rencana kerja sesi ini. Jangan menulis kode sebelum rencana saya setujui.
```

### 13.2 Kerjakan item checklist
```
Kerjakan item PROGRESS Fase <N>: "<teks item>".
Ikuti PROMPT §3 (aturan emas) dan §11 (Definition of Done).
Tulis rencana singkat dulu (file yang diubah, test, risiko), lalu kerjakan.
Akhiri dengan hasil verifikasi dan pembaruan PROGRESS & CODEMAP.
```

### 13.3 Buat modul baru
```
Buat kerangka modul "<modul>" sesuai CODEMAP §4 dan §6.<x>:
file prisma/schema/<modul>.prisma dengan @@schema("<modul>"), index.ts, routes, service,
repository, policy, schema, dan __tests__. Patuhi batas modul (PLAN §3.2).
Tulis test policy dulu berdasarkan matriks PLAN §4.3 untuk modul ini.
```

### 13.4 Tambah endpoint
```
Tambah endpoint <METHOD> /api/v1/<path> di modul <modul>.
Tujuan: <apa yang dilakukan>. Siapa yang boleh: <role/grant/tim sesuai PLAN §4.3>.
Wajib: skema Zod + OpenAPI, policy + test akses (boleh & ditolak), test integration,
audit log jika sensitif, pembaruan CODEMAP §5–§6.
```

### 13.5 Perbaiki bug
```
Bug: <deskripsi>. Langkah reproduksi: <langkah>. Diharapkan: <hasil benar>. Terjadi: <hasil salah>.
Tulis test yang gagal karena bug ini dulu, cari akar masalahnya (bukan gejalanya),
perbaiki, pastikan test lulus, lalu catat di log PROGRESS.
```

### 13.6 Review kode
```
Review perubahan di branch ini terhadap <branch tujuan>. Periksa terutama:
batas modul (hanya import index.ts), cek akses per endpoint, kebocoran data sensitif
(log/respons/email), validasi Zod, migrasi, dan kesesuaian dengan PLAN.
Urutkan temuan dari yang paling berbahaya.
```

### 13.7 Ambil keputusan
```
Saya perlu memutuskan <topik / OD-x>. Jelaskan opsi-opsinya dengan tabel perbandingan,
dampaknya ke PLAN/CODEMAP, dan rekomendasimu. Setelah saya memilih,
catat sesuai PROMPT §12.
```

### 13.8 Akhiri sesi
```
Akhiri sesi. Perbarui PROGRESS (checklist + entri log sesi sesuai template),
CODEMAP (status & item baru), dan PLAN jika ada keputusan baru.
Tampilkan ringkasan: yang selesai, hasil verifikasi, dan langkah berikutnya.
Usulkan pesan commit (Conventional Commits tanpa scope, bahasa Indonesia).
```
