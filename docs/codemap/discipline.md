# Codemap — `discipline`

> Modul surat peringatan (Arsip gelombang 2b, D-057 + ARS-D7–D14, 2026-10-15). Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [arsip](../features/arsip/README.md). Skema Postgres `discipline`; FK hanya ke `employee` & `organization` (PLAN §3.2). Dependensi satu arah: `discipline → attendance/index.ts, employee/index.ts, iam/index.ts, notification/index.ts, organization/index.ts` (tidak ada modul yang mengimpor `discipline` selain `app.ts`).

## API (`apps/api/src/modules/discipline/`)

```
├── index.ts                      [done] registerDisciplineRoutes, runDisciplineDaily
├── discipline.policy.ts          [done] canWriteLetters (SA / HR ber-grant employee.discipline.write di PT), canViewLetter (SA; HR read/write PT; MANAGER tim
│                                        atau atasan saat terbit; diri sendiri; draft hanya penulis), canSeeInternalNotes, canDeliver (atasan; tak terjangkau → penulis), canAcknowledge,
│                                        canManageViolationTypes, canReadDisciplineMasters, canChangeSettings (SA), letterListScope
├── discipline.repository.ts      [done] jenis pelanggaran, pengaturan (satu baris), SP (filter cakupan/status/berlaku/kedaluwarsa), update bersyarat
│                                        (`updateIfStatus`, `updateDraft`/`deleteDraft` hanya DRAFT, `confirmOnce`) agar aksi bersamaan tidak sama-sama lolos;
│                                        `numberTaken`; `activeLettersOf` = SP berlaku pada/sesudah tanggal terbit (tanggal mundur tidak menurunkan saran)
├── discipline.service.ts         [done] aturan ARS-D7–D13, audit `discipline.*` (alasan eskalasi & cabut di kolom reason), saran tingkat, nomor otomatis per
│                                        PT per tahun (lompati nomor terpakai; coba ulang bila bentrok); notifikasi gagal tidak menggagalkan respons, notifikasi in-app + email tanpa isi (PROMPT §3.7), bukti ALPHA lewat attendance
├── warning-letter-pdf.ts         [done] PDF SP dari template sistem (pdf-lib, A4, font standar WinAnsi, kop `core/brand-logo.ts`, multi-halaman,
│                                        tanda air DRAF untuk draft, 3 kolom tanda tangan)
├── discipline-daily.service.ts   [done] cron `discipline-daily`: ISSUED lewat berlaku s/d → EXPIRED (+ audit sistem); pengingat konfirmasi ≥ 2 hari (dedupe per SP)
├── discipline.schema.ts          [done] DTO OpenAPI (body longgar → divalidasi skema @hris/shared di service)
├── discipline.routes.ts          [done] 18 operasi (lihat CODEMAP §5)
└── __tests__/discipline.policy.test.ts  [done] matriks akses 27 kasus (TDD)
```

- Shared: `packages/shared/src/discipline.ts` — tingkat & status + label, `warningLetterState` (status tampilan), `suggestWarningLevel`, `isAboveSuggestion`, `formatWarningNumber` (`NNN/SPx/HRD-<PT>/<romawi>/<tahun>`), `warningEffectiveUntil`, skema input. Test `packages/shared/tests/discipline.test.ts`.
- Pendukung di modul lain (lewat `index.ts`): `attendance` → `alphaDaysForEvidence` (baca-saja hari ALPHA + surat pernyataan, `period.service.ts`; signed URL lampiran hanya bila `withUrls`); `employee` → `getEmployeeBriefs`, `listEmployeeBriefs`, `getEmployeeDocumentRef`; `iam` → `listDisciplineWriters`, `getAccountSummaries`, `getEmployeeAccountStates`; `employee.policy` `canRead/WriteDocuments` menerima grant SP untuk jenis `WARNING_LETTER` (ARS-D14).
- Laporan (2026-10-16): `report-data.service.ts` `listWarningLettersForReport` (+ `discipline.repository` `lettersForReport`) diekspor dari `index.ts` untuk modul [report](report.md) — tanpa uraian/alasan.
- Integration: `apps/api/tests/integration/discipline/warning-letters.test.ts` (18 skenario, termasuk 4 dari audit 2026-10-15: master & pengaturan, draft & akses, bukti ALPHA, terbit + nomor + notifikasi, eskalasi & nomor manual, terbit tak bisa diubah, lihat per role, konfirmasi idempoten, scan, PDF, cabut, cron kedaluwarsa + pengingat dedupe).

## Web (`apps/web/src/features/discipline/`, 2026-10-15)

```
├── api.ts                          [done] hook jenis pelanggaran, pengaturan, daftar/detail SP, SP karyawan, SP saya, saran tingkat, kandidat ALPHA,
│                                          mutasi (draft, terbit, cabut, disampaikan, terima, scan); downloadWarningLetter
├── schemas.ts                      [done] subset respons API
├── components/letter-display.tsx   [done] LevelBadge, StateBadge, ConfirmBadge
├── components/letter-list.tsx      [done] LetterCard, PdfButton, ScanButton (unggah dokumen WARNING_LETTER → tautkan), ConfirmButtons,
│                                          EmployeeWarningLettersTab (tab SP detail karyawan), MyWarningLetters (Layanan Mandiri). Tanpa impor fitur employee
├── components/letter-forms.tsx     [done] DraftDialog (EmployeePicker, saran tingkat, alasan eskalasi, hari ALPHA), IssueDialog (nomor otomatis/manual), RevokeDialog
├── pages/warning-letters-page.tsx  [done] /personal/arsip/peringatan — daftar + filter, panel ?sp=<id>
└── pages/violation-types-page.tsx  [done] /master-data/jenis-pelanggaran — jenis pelanggaran + masa berlaku (SA)
```

Pemasangan: `app/router.tsx` (route `arsip/peringatan` sebelum `arsip/:section`, `master-data/jenis-pelanggaran`), `route-preload.ts`, `navigation.ts` (menu Riwayat Peringatan & Master Data › Jenis Pelanggaran), `feature-flags.ts` (`discipline`), `lib/access.ts` (`viewWarningLetters`, `manageWarningLetters`, `viewDisciplineMasters`), `employee-detail-sheet.tsx` (tab SP), `ess-page.tsx` (tab Surat peringatan, `?tab=` dari URL). Test: `apps/web/tests/discipline.test.tsx`.

## Tabel & rincian

| Tabel | Isi penting |
|---|---|
| `violation_types` | `code` (2–10) unik, `name` unik, `links_attendance` (jenis mangkir boleh ditautkan ke hari ALPHA), `is_active`; 5 jenis awal di migrasi |
| `warning_letters` | karyawan (FK), PT (FK, saat draft), `level` (SP1–SP3), jenis, `incident_date?`, `description` (≤ 4000), `status` (DRAFT/ISSUED/EXPIRED/REVOKED), `suggested_level?`, `escalation_reason?`, `number` unik + `number_year`/`number_seq` (unik per PT per tahun), `issued_at`/`effective_until`, `manager_employee_id` (atasan saat terbit), `delivered_at/by`, `acknowledged_at`, `scan_document_id` (UUID dokumen WARNING_LETTER tanpa FK), `revoked_at/by/reason`; CHECK: draft tanpa nomor/tanggal, non-draft wajib nomor & tanggal, berlaku s/d > terbit, dicabut wajib waktu & alasan, tahun+urut berpasangan |
| `warning_letter_alpha_days` | SP ↔ `attendance_day_id` (UUID tanpa FK) + `work_date` salinan; unik per SP + hari; ikut terhapus bersama draft |
| `discipline_settings` | satu baris (`id` = 1, CHECK), `validity_months` 1–24 (bawaan 6) |
