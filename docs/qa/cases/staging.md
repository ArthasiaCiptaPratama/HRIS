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
