# Kontrak

> **Kode prefix:** `KTR` · **Fase:** 7 · **PIC:** – · **Branch:** – · **Saklar `FEATURES`:** –
> **Status:** Belum mulai

Jenis kontrak, CRUD, perpanjangan, terminasi, pengingat kontrak habis.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 7 — Contract
- [ ] Skema + migrasi
- [ ] Jenis kontrak, CRUD kontrak, perpanjangan, terminasi
- [ ] Aturan 1 kontrak aktif per karyawan, cek overlap
- [ ] Cron `contract-expiry`
- [ ] Policy + test
- [ ] Web: tab kontrak, daftar kontrak akan habis

## Keputusan

Belum ada keputusan khusus fitur.

**Keputusan baru** (prefix `KTR-D1`, `KTR-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| – | – | – |

## Keputusan terbuka

Tidak ada.

OD baru: `KTR-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [contract](../../codemap/contract.md).

## QA

Belum ada dokumen QA.

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
