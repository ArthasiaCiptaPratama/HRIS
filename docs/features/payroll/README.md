# Payroll

> **Kode prefix:** `PAY` · **Fase:** 8 · **PIC:** – · **Branch:** – · **Saklar `FEATURES`:** –
> **Status:** Belum mulai (menunggu OD-1–OD-3)

Komponen & struktur gaji, BPJS, PPh 21 TER, periode hitung → review → lock → terbit, slip gaji. Nominal gaji hanya SUPER_ADMIN.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 8 — Payroll
- [ ] Keputusan OD-1 (metode pajak), OD-2 (THR), OD-3 (verifikator)
- [ ] Golden cases disusun & diverifikasi pihak luar
- [ ] Skema + migrasi
- [ ] Konfigurasi tarif BPJS, TER, PTKP
- [ ] Komponen gaji & struktur gaji per karyawan
- [ ] Perhitungan (TDD): BPJS, PPh 21 TER, perhitungan ulang masa pajak terakhir, lembur, potongan
- [ ] Periode: hitung → review → lock → terbit; snapshot
- [ ] Slip gaji (lihat & unduh)
- [ ] Policy + test
- [ ] Web: konfigurasi, struktur gaji, proses payroll, slip

## Keputusan

Isi lengkap di [decisions.md](../../decisions.md).

- [D-011](../../decisions.md#d-011) Gaji hanya SA; HR ber-grant tutup periode absensi
- [D-012](../../decisions.md#d-012) BPJS + PPh 21 TER otomatis, tarif dari tabel

**Keputusan baru** (prefix `PAY-D1`, `PAY-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| – | – | – |

## Keputusan terbuka

- [OD-1](../../decisions.md#od-1) Metode PPh 21
- [OD-2](../../decisions.md#od-2) THR dihitung sistem?
- [OD-3](../../decisions.md#od-3) Verifikator golden cases payroll

OD baru: `PAY-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [payroll](../../codemap/payroll.md).

## QA

Belum ada dokumen QA.

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
