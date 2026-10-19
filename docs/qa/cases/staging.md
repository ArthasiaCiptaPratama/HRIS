# Kasus Uji — Staging Vercel (D-036)

Otomasi: `API` = `/mnt/winD/WORK/Magang/QA/2026-09-29-staging/api.ts` (Bun + supabase-js, login sungguhan), `UI` = `.../ui.ts` (Playwright Chromium, login lewat form). Kasus per role/viewport memakai sufiks `-<ROLE>[-desktop|-mobile]`.

| ID | Prioritas | Aturan | Role/grant | Prasyarat | Langkah | Hasil diharapkan | Otomasi |
|---|---|---|---|---|---|---|---|
| TC-STG-001 | P1 | D-036, PLAN §3.3 | — | deploy staging | GET /health | 200, `checks.database = ok` | API |
| TC-STG-002 | P2 | PROMPT §5 | — | — | GET path tak dikenal | 404 `NOT_FOUND`, `error.requestId` = header `X-Request-Id` | API |
| TC-STG-003 | P3 | PROMPT §5 | — | — | Kirim `X-Request-Id` | Dipantulkan apa adanya | API |
| TC-STG-004 | P3 | PROMPT §5 OpenAPI | — | — | GET /openapi.json, /docs | 200, ≥ 20 path | API |
| TC-STG-005 | P1 | keamanan | — | — | Header respons /health | HSTS, nosniff, X-Frame-Options, Referrer-Policy, `Cache-Control: private, no-store` | API |
| TC-STG-006 | P1 | PROMPT §5 CORS | — | — | Preflight dari web & origin asing | Web 204 + `Access-Control-Allow-Origin` web; asing tanpa ACAO | API |
| TC-STG-007 | P1 | CODEMAP §7 | — | `CRON_SECRET` | GET /api/cron/email-retry tanpa/salah/benar | 401 / 401 / 200 | API |
| TC-STG-010 | P1 | PROMPT §5 | tanpa token | — | GET /me | 401 `UNAUTHENTICATED` | API |
| TC-STG-011 | P1 | Supabase Auth | HR | — | Login password salah | Ditolak (`Invalid login credentials`) | API |
| TC-STG-012 | P1 | D-005, §4.3 | SA/HR/MGR/EMP | akun uji | Login password → GET /me | 200, role sesuai | API |
| TC-STG-013 | P1 | core/auth | EMP | token sah | Token diubah | 401 | API |
| TC-STG-020 | P1 | §4.3 karyawan | 4 role | — | GET /employees | SA/HR/MGR 200, EMP 403 | API |
| TC-STG-021 | P2 | D-035 | 4 role | — | GET /employees/summary | SA/HR/MGR 200, EMP 403 | API |
| TC-STG-022 | P2 | §4.1 | 4 role | — | GET /employees/manager-options | SA/HR 200, MGR/EMP 403 | API |
| TC-STG-023 | P3 | §4.3 direktori | 4 role | — | GET /org-structure | semua 200 | API |
| TC-STG-024 | P3 | §4.3 kebijakan | 4 role | — | GET /master-data | semua 200 | API |
| TC-STG-025 | P1 | §4.3 akun | 4 role | — | GET /accounts | SA/HR 200, MGR/EMP 403 | API |
| TC-STG-026 | P1 | §4.2 grant | 4 role | — | GET /grants | SA 200, lain 403 | API |
| TC-STG-027 | P1 | §4.3 audit | 4 role | — | GET /audit-logs | SA 200, lain 403 | API |
| TC-STG-028 | P3 | notifikasi | 4 role | — | GET /notifications | semua 200 | API |
| TC-STG-029 | P2 | data staging | SA | seed | GET /employees?active=true | total 19, `no-store` | API |
| TC-STG-030 | P1 | D-035 MANAGER tim | MGR | — | GET /employees | Hanya tim (berisi Rizky) | API |
| TC-STG-031 | P1 | §4.2 🔑 | HR tanpa grant | — | GET /employees/:rizky?view=full | 200, key `personal`/`bankAccount`/`familyMembers` tidak ada | API |
| TC-STG-032 | P1 | §4.2 audit | SA | — | GET detail view=full | Key sensitif ada; audit `employee.sensitive.read` bertambah | API |
| TC-STG-033 | P1 | D-035 need-to-know | SA | — | GET detail view=work | Tanpa key sensitif, tanpa audit baru | API |
| TC-STG-034 | P1 | §4.3 tim | MGR | — | Detail anggota tim / luar tim | 200 tanpa sensitif / 404 | API |
| TC-STG-035 | P1 | §4.3 sendiri | EMP | — | Detail diri / orang lain | 200 + sensitif / 404 | API |
| TC-STG-036 | P2 | PROMPT §5 | SA | — | pageSize=101, id bukan UUID, view tak dikenal | 400 `VALIDATION_ERROR` | API |
| TC-STG-037 | P2 | PROMPT §5 | SA | — | Detail UUID acak | 404 | API |
| TC-STG-038 | P3 | D-035 cari | HR | — | GET /employees?q=Rizky | Hanya nama cocok | API |
| TC-STG-039 | P2 | D-035 kategori | SA | seed | GET /employees/summary | aktif 19, nonaktif 2, per kategori | API |
| TC-STG-040 | P1 | §4.3 tambah | MGR, EMP | — | POST /employees | 403 | API |
| TC-STG-041 | P2 | PROMPT §5 | HR | — | POST joinDate salah format | 400 | API |
| TC-STG-042 | P2 | §5.1 | HR | — | POST pegawai `QA-STG-<RUN>` | 201 | API |
| TC-STG-043 | P2 | ERD unik | HR | 042 | POST nomor sama | 409 | API |
| TC-STG-044 | P2 | D-035 | HR | 042 | PATCH nomor HP | 200 | API |
| TC-STG-045 | P2 | D-035 ubah status | HR | 042 | status-change → Pegawai Tetap; ulang status sama | 200; 409 | API |
| TC-STG-046 | P2 | D-035 nonaktif | HR | 045 | deactivate RESIGNATION | 200; muncul di `active=false` | API |
| TC-STG-047 | P2 | D-035 aktif kembali | HR | 046 | reactivate | 200; aktif; riwayat 4 (HIRED→…→REACTIVATED) | API |
| TC-STG-048 | P1 | §4.2 audit tulis | SA | 042–047 | GET /audit-logs | create, update, change_status, deactivate, reactivate tercatat | API |
| TC-STG-050 | P1 | D-005 | 4 role × 2 viewport | — | Login lewat form web | Masuk ke `/` | UI |
| TC-STG-051 | P1 | §4.3 + D-035 menu | 4 role × 2 viewport | — | Kunjungi halaman per role | Halaman boleh tampil; terlarang "Akses ditolak"; b–e & Arsip Maintenance | UI |
| TC-STG-052 | P1 | §4.2 🔑 UI | SA, HR | — | Detail Rizky → tab Pribadi | SA: data tampil; HR: "Data pribadi dilindungi" | UI |
| TC-STG-053 | P3 | D-035 cari UI | HR | 042 | Ketik `QA-STG-<RUN>` di pencarian | Pegawai uji muncul | UI |
| TC-STG-054 | P2 | kualitas | 4 role × 2 viewport | — | Pantau konsol & jaringan | 0 error JS; 0 respons ≥ 400 selain 403 yang disengaja | UI |
| TC-STG-055 | P1 | §4.5 sesi | EMP | login | Menu akun → Keluar, buka /profil | Kembali ke /login | UI |
| TC-STG-056 | P1 | guard route | tanpa sesi | — | Deep link /personal/... | Dialihkan ke /login | UI |
| TC-STG-057 | P2 | UX login | HR | — | Password salah di form | Tetap di /login + pesan "Email atau password salah…" | UI |
| TC-STG-058 | P3 | SPA fallback | — | — | GET /lupa-password langsung | 200, halaman tampil | UI |

### Rilis gelombang 6 — Arsip & Layanan Mandiri (2026-10-13; script `QA/2026-10-13-staging-arsip/stg-arsip.ts`)

| ID | Prioritas | Aturan | Role/grant | Prasyarat | Langkah | Hasil diharapkan | Otomasi |
|---|---|---|---|---|---|---|---|
| TC-STG-059 | P1 | PLAN §4.5.1 / D-054 antrean | HR tanpa grant review | — | GET /data-changes | 403 | API A-01 |
| TC-STG-060 | P1 | D-008 grant dari DB | SA → HR | 059 | POST /grants `employee.changes.review` (alasan QA), lalu HR GET /data-changes tanpa login ulang | 201; HR 200 (audit grant) | API A-02 |
| TC-STG-061 | P1 | PLAN §4.2 Arsip (D-054) | SA / HR tanpa grant pribadi & rekening / MGR / EMP | — | GET /archive/contacts, /families, /bank-accounts | contacts SA/HR/MGR 200, EMP 403; families SA 200, HR & EMP 403; bank SA 200, HR & MGR 403 | API A-03 |
| TC-STG-062 | P1 | D-058 ekspor | SA / HR / MGR | — | GET /archive/educations/export | SA & HR 200 `{fileName .xlsx, rows, contentBase64}` (isi zip `PK`); MGR 403 | API A-04 |
| TC-STG-063 | P2 | D-055 katalog | SA | — | GET /document-types | 26 jenis | API A-05 |
| TC-STG-064 | P1 | D-054 data diri ESS | EMP | — | GET /self/employee-data | 200 data diri sendiri | API B-01 |
| TC-STG-065 | P2 | design §12.2 validasi | EMP | — | POST /data-changes EMERGENCY; ulang bagian sama | 201; ganda 409 | API B-02 |
| TC-STG-066 | P1 | PLAN §4.5.1 tidak memutus sendiri | EMP / HR ber-grant | 065 | Pemilik POST decision; HR REJECT tanpa alasan; REJECT beralasan | 403; 400; 200 | API B-03 |
| TC-STG-067 | P2 | design §12.2 setujui | EMP / HR ber-grant | 066 | Ajukan ulang → HR APPROVE → GET /self/employee-data | 201 → 200 → kontak darurat baru tampil | API B-04 |
| TC-STG-068 | P1 | PROMPT §3.7 notifikasi | EMP | 067 | GET /notifications | Ada notifikasi keputusan, tanpa nama/nomor kontak | API B-05 |
| TC-STG-069 | P2 | D-043 saklar `archive`/`selfService` | SA / HR / MGR / EMP | deploy gel. 6 | Buka Arsip (Kontak, File, Keluarga, Pendidikan), Jenis dokumen, Pengajuan Perubahan Data, `/ess` | Judul halaman sesuai, bukan "… sedang disiapkan" (Maintenance) | UI C-01 |
| TC-STG-070 | P1 | §4.3 Arsip bukan untuk EMP | EMP | — | Deep link /personal/arsip/kontak | "Akses ditolak" | UI C-02 |
| TC-STG-071 | P3 | Tampilan | EMP | — | HP 390 px `/ess` | Tanpa scroll horizontal | UI C-03 |
| TC-STG-072 | P2 | kualitas | 4 role | 069–071 | Pantau konsol & jaringan halaman | 0 error JS; 0 respons ≥ 400 selain 403/404 disengaja | UI C-04 |

### Rilis gel. 7 — Aset & APD (ARS-D1–D6), Time Management terpasang tersembunyi (2026-10-14)

Otomasi: `PW` = `/mnt/winD/WORK/Magang/QA/2026-10-14-staging-aset/qa-aset.ts` (langkah L-01…L-12, sama dengan QA lokal TC-EMP-215…226), `TM` = `.../tm-hidden.ts`, `MCP` = Supabase MCP read-only.

| ID | Prioritas | Aturan | Role/grant | Prasyarat | Langkah | Hasil diharapkan | Otomasi |
|---|---|---|---|---|---|---|---|
| TC-STG-073 | P1 | D-043 rilis, PROMPT §3.11 | — | `Deploy staging` gel. 7 | Cek `_prisma_migrations`, skema `asset`, GET /health | 35 migrasi, 0 gagal, terakhir `20261013095006_add_asset_module`; 5 tabel `asset`; health 200 `database ok`; web 200 | MCP · API |
| TC-STG-074 | P1 | PROMPT §3.5, cron | — | 073 | GET /api/cron/asset-daily tanpa secret; GET /api/v1/asset-categories tanpa login | 401; 401 | API |
| TC-STG-075 | P2 | D-043 saklar `timeManagement` false | SA / EMP | 073 | Buka /time/absen-harian, /time/roster, /time/kalender, /time/cuti, /absen | Halaman "… sedang disiapkan" atau "Akses ditolak" (SA tanpa data karyawan); menu TM berlabel SEGERA; isi TM tidak tampil | TM |
| TC-STG-076 | P2 | ARS-D1 master | SA | — | = TC-EMP-215 | Kategori + 2 jenis APD tersimpan | PW L-01 |
| TC-STG-077 | P1 | ARS-D4 kode & harga | SA | 076 | = TC-EMP-216 (PT dipilih) | Seri kosong ditahan; kode `ACP-<KAT>-0001`; harga tampil untuk SA | PW L-02 |
| TC-STG-078 | P1 | ARS-D3 serah-terima | SA | 077 | = TC-EMP-217 | Dipegang, belum dikonfirmasi | PW L-03 |
| TC-STG-079 | P1 | ARS-D2 BAST PDF | SA | 078 | = TC-EMP-218 | PDF lengkap (logo, pihak, kode, SN, batas kembali), tanpa harga | PW L-04 |
| TC-STG-080 | P2 | ARS-D2 scan BAST | SA | 079 | = TC-EMP-219 (storage staging) | "Scan BAST terlampir" | PW L-05 |
| TC-STG-081 | P1 | ARS-D3 MANAGER | MGR | 078 | = TC-EMP-220 | Aset tim tanpa harga & tanpa kelola | PW L-06 |
| TC-STG-082 | P1 | ARS-D3 HR tanpa grant | HR | 078 | = TC-EMP-221 | Lihat saja | PW L-07 |
| TC-STG-083 | P2 | ARS-D1 APD | SA | 076 | = TC-EMP-222 | Tampil di Pembagian APD | PW L-08 |
| TC-STG-084 | P1 | ARS-D2 konfirmasi | EMP | 078, 083 | = TC-EMP-223 | Aset & APD "Diterima karyawan" | PW L-09 |
| TC-STG-085 | P3 | Tampilan | EMP | — | = TC-EMP-224 (HP 390 px) | Tanpa scroll horizontal | PW L-10 |
| TC-STG-086 | P2 | ARS-D6 keluar | SA | 078, 083 | = TC-EMP-225 (tanpa simpan) | Peringatan aset/APD belum kembali | PW L-11 |
| TC-STG-087 | P1 | ARS-D2/D5 pengembalian | SA | 078 | = TC-EMP-226 | Perbaikan; BAST pengembalian, nomor beda dari BAST serah; 0 error JS/5xx seluruh alur | PW L-12 |

### Rilis gel. 8 — Surat Peringatan (ARS-D7–D15) + header detail karyawan, Time Management tetap tersembunyi (2026-10-15)

Otomasi: `PW` = `/mnt/winD/WORK/Magang/QA/2026-10-15-staging-sp/qa-staging-sp.ts` (langkah S-01…S-11, sama dengan QA lokal TC-EMP-227…237, tanpa hari ALPHA karena TM tersembunyi), `S12` = `.../qa-staging-s12.ts` (header + TM), `MCP` = Supabase MCP read-only.

| ID | Prioritas | Aturan | Role/grant | Prasyarat | Langkah | Hasil diharapkan | Otomasi |
|---|---|---|---|---|---|---|---|
| TC-STG-088 | P1 | D-043 rilis, PROMPT §3.11 | — | `Deploy staging` gel. 8 | Cek `_prisma_migrations`, skema `discipline`, GET /health | 37 migrasi, 0 gagal (+`20261015064508_employee_location_setting`, `20261015071500_add_discipline_module`); 5 jenis pelanggaran, masa berlaku 6; health 200 | MCP · API |
| TC-STG-089 | P1 | PROMPT §3.5, cron | — | 088 | GET /api/cron/discipline-daily tanpa secret | 401 | API |
| TC-STG-090 | P2 | D-043 saklar `timeManagement` false | SA | 088 | Buka /time/absen-harian, /time/lokasi-absen (baru), /absen | "… sedang disiapkan" / Akses ditolak (SA tanpa data karyawan) — TM tidak terbuka | S12 |
| TC-STG-091 | P2 | ARS-D8/D12 master | SA | — | = TC-EMP-227 | 5 jenis awal, jenis QA tersimpan (lalu diarsipkan), masa berlaku 6 | PW S-01 |
| TC-STG-092 | P1 | ARS-D10 draft | HR ber-grant write | grant diberikan SA | = TC-EMP-228 tanpa ALPHA | Draft, saran SP 1, "tidak punya hari ALPHA" | PW S-02 |
| TC-STG-093 | P2 | ARS-D7 PDF draft | HR | 092 | = TC-EMP-229 | Nomor "(draf, belum bernomor)" + tanda air | PW S-03 |
| TC-STG-094 | P1 | ARS-D8/D11 terbit | HR | 092 | = TC-EMP-230 | Nomor otomatis `001/SP1/HRD-ACP/X/2026`, berlaku s/d terbit + 6 bulan − 1 hari | PW S-04 |
| TC-STG-095 | P1 | ARS-D7 isi surat | HR | 094 | = TC-EMP-231 | Kop, nomor, data, uraian, berlaku, 3 tanda tangan | PW S-05 |
| TC-STG-096 | P1 | ARS-D7/D14 scan | HR ber-grant SP saja | 094 | = TC-EMP-232 (storage staging) | Terlampir sebagai dokumen `WARNING_LETTER` | PW S-06 |
| TC-STG-097 | P1 | ARS-D10 eskalasi | HR | 094 | = TC-EMP-233 | Alasan wajib, nomor manual, catatan PHK | PW S-07 |
| TC-STG-098 | P1 | ARS-D9/D13 atasan | MGR | 094 | = TC-EMP-234 | Tanpa alasan & tombol kelola; "Sudah disampaikan" | PW S-08 |
| TC-STG-099 | P1 | ARS-D9/D13 karyawan | EMP | 098 | = TC-EMP-235 (email nyata ke akun uji) | Notifikasi tanpa isi; "Berlaku · dikonfirmasi" | PW S-09 |
| TC-STG-100 | P2 | ARS-D13 akses & HP | EMP | — | = TC-EMP-236 | Akses ditolak; HP 390 px tanpa geser | PW S-10 |
| TC-STG-101 | P1 | ARS-D10 cabut + tab SP | HR | 097 | = TC-EMP-237 | Dicabut, saran kembali SP 2, tab SP detail karyawan | PW S-11 |
| TC-STG-102 | P2 | Tampilan header detail karyawan | SA | — | Buka detail Rizky | Banner "Profil Karyawan", "Status Karyawan : Karyawan Tetap \| Masih bekerja", "Akses Aplikasi : Bisa login"; 0 error JS | S12 |
