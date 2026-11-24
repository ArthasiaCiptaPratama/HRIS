# Rekrutmen (Talent Acquisition)

> **Kode prefix:** `REC` · **Fase:** usulan setelah Rilis 1 (lihat REC-D5) · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** `recruitment` (usulan)
> **Status:** Rencana. Riset + rancangan ditulis 2026-11-24, grill berjalan; **belum ada kode** (implementasi menunggu persetujuan pengguna)

Modul baru `recruitment`: lowongan → kandidat → alur tahap modular (maju/mundur) → form kandidat yang bisa dikustom
(tautan tanpa login) → wawancara dengan tautan Meet otomatis → diterima → diserahkan ke Penerimaan (D-045).
Permintaan pengguna 2026-11-24 10:22 WIB (lewat supervisor-79; teks lengkap di `.handoff/2026-11-24-1022-supervisor-ke-HRIS-recruitment-plan.md`).

Dokumen fitur ini: **README** (status, checklist, keputusan) · [design.md](design.md) · [research.md](research.md) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

- [~] **Rencana** (2026-11-24)
  - [x] Muat konteks: PLAN §1–4/§7, CODEMAP, pola modul api (employee/approval/notification), nav web, Penerimaan (D-045)
  - [x] Riset web 9 topik + verifikasi versi/lisensi pustaka di registry npm → [research.md](research.md)
  - [x] Rancangan: istilah, alur, mesin status, form builder, portal, wawancara, akses, model data, API, folder, fase → [design.md](design.md)
  - [x] Grill batch 1 (Q1–Q5) dijawab pengguna → REC-D1–D5
  - [x] Grill batch 2 (Q6–Q10): Q6/Q7/Q10 = a → REC-D7–D9; Q8 → REC-OD2/OD3 tetap terbuka; Q9 → analisis di batch 3 (REC-OD5)
  - [x] Grill batch 3 (Q9 ulang, Q11–Q14) → REC-D10–D14
  - [ ] Persetujuan rencana oleh pengguna → commit docs ke develop
- [ ] **R0 Fondasi**: skema `recruitment` + migrasi, lowongan, kandidat (manual/CV/URL), grup nav "Rekrutmen" + saklar, policy + matriks akses, audit
- [ ] **R1 Alur**: template alur + blok tahap, salin ke lowongan, papan kanban, maju/lompat/mundur + riwayat, tolak/mundur/buka lagi
- [ ] **R2 Form + portal**: definisi form berversi, builder, renderer, tautan bertoken, unggah file, minta data tambahan, persetujuan PDP
- [ ] **R3 Wawancara**: jadwal, provider manual → Google Meet, undangan & pengingat, penilaian, tampilan pewawancara
- [ ] **R4 Diterima → Penerimaan** (D-045)
- [ ] **R5 PDP & talent pool**: retensi + anonimisasi otomatis, hapus atas permintaan
- [ ] R6 lanjut (opsional, per keputusan): impor CSV kandidat, MPP + approval, lowongan publik + CAPTCHA, isi otomatis CV (AI), Zoom, laporan

## Keputusan

| Kode | Keputusan | Dasar |
|---|---|---|
| <a id="rec-d1"></a>REC-D1 | **Tautan rapat:** Google Meet otomatis lewat satu akun/kalender khusus rekrutmen (service account + domain-wide delegation), dengan abstraksi `MeetingProvider` (Meet · Zoom nanti · manual). Tempel tautan manual selalu tersedia sebagai cadangan. Meet aktif setelah REC-OD2 terjawab. | Pengguna Q1 = a (2026-11-24 10:31 WIB) |
| <a id="rec-d2"></a>REC-D2 | **Aktor:** HR_ADMIN (PT yang ditugaskan) + SA mengelola semuanya; pewawancara = akun tertaut karyawan, hanya lamaran yang ia wawancarai + penilaian miliknya. Tanpa role baru. MPP oleh MANAGER = fase lanjut. Pewawancara eksternal dianggap tidak ada; bila ada cukup jadi tamu undangan kalender. | Pengguna Q2 = a; Q8(iv) |
| <a id="rec-d3"></a>REC-D3 | **Data kandidat:** HR membuat kandidat, lalu mengirim tautan form bertoken (tanpa login, kedaluwarsa, sekali kirim) per tahap / untuk data tambahan. Halaman lowongan publik terbuka = fase lanjut. | Pengguna Q3 = b |
| <a id="rec-d4"></a>REC-D4 | **Menu:** grup headbar **"Rekrutmen"** di antara Waktu dan Administrasi; sub-menu Talent Acquisition (Lowongan, Kandidat, Jadwal Wawancara, Template). Di balik `FEATURES.recruitment` (mati di staging/produksi sampai dirilis). | Pengguna Q4 = a |
| <a id="rec-d5"></a>REC-D5 | **Prioritas:** rencana diselesaikan sekarang (dokumen saja); implementasi R0+ dimulai **setelah Paket 1 EMP-D8 + rilis staging berikutnya**. Membuka cakupan PLAN §1.3 ("Rekrutmen" di backlog v1) atas permintaan pengguna. | Pengguna Q5 = a |
| <a id="rec-d6"></a>REC-D6 | **Teknis (usulan pekerja, bisa ditinjau):** mesin status = aturan transisi di kode + riwayat append-only + konkurensi optimistis (tanpa XState/workflow engine); alur disalin ke lowongan (tanpa versi template alur); form = definisi JSON berversi + zod yang dibangkitkan dan dipakai bersama api/web; builder dibuat sendiri di atas `@dnd-kit` yang sudah terpasang; Meet/Zoom lewat `fetch` + `core/google-auth.ts`. **Tanpa pustaka baru** di R0–R5. | [research.md](research.md) §2, §3, §8 |
| <a id="rec-d7"></a>REC-D7 | **Tanpa scraping LinkedIn.** Template "Sumber kandidat": URL profil LinkedIn sebagai tautan + isi manual, unggah CV, impor CSV/Excel ekspor portal lowongan (R6), atau kandidat mengisi sendiri lewat tautan form. Alasan: User Agreement §8.2, preseden hiQ (2022) & Proxycurl (2025), UU PDP. | Pengguna Q6 = a (10:44 WIB); [research §5](research.md#5-scraping-linkedin) |
| <a id="rec-d8"></a>REC-D8 | **Fase awal tanpa AI** untuk isi otomatis CV: CV disimpan, HR/kandidat mengisi form. AI (ekstraksi lokal `unpdf`/`mammoth` + LLM) = fase lanjut di balik saklar, dengan persetujuan kandidat + perjanjian pemrosesan data vendor (UU PDP Pasal 56). | Pengguna Q7 = a |
| <a id="rec-d9"></a>REC-D9 | **Masa simpan data pelamar:** lamaran ditolak/mundur → data kandidat dianonimkan otomatis **12 bulan setelah lowongan ditutup**, kecuali kandidat setuju masuk Talent Pool (persetujuan terpisah, bisa ditarik). Setiap form kandidat wajib centang persetujuan pemrosesan data (teks + versi disimpan). HR punya tombol "Hapus data kandidat" untuk permintaan hapus (≤ 3×24 jam, UU PDP). Diterima → data pindah ke data karyawan. | Pengguna Q10 = a |
| <a id="rec-d10"></a>REC-D10 | **Rekrutmen → Penerimaan:** tahap Diterima punya dialog "Terima & kirim ke Penerimaan" (data terisi otomatis; HR melengkapi status kepegawaian, tanggal masuk, atasan) yang membuat calon karyawan D-045 + undangan. Kolom Diterima menampilkan status Penerimaan + pintasan "Buka di Penerimaan". **Menu Penerimaan Karyawan Baru pindah ke Personalia › Pengelolaan Karyawan** (alamat `/penerimaan` tetap; tidak bergantung saklar recruitment; screenshot sebelum commit). Alur: [design §3.1](design.md#31-alur-lintas-menu-rekrutmen--personalia--penerimaan-rec-d10). | Pengguna Q9 = C (10:57 WIB) |
| <a id="rec-d11"></a>REC-D11 | **Dua jenis template:** template **alur** (susunan blok tahap, disalin ke lowongan, bisa diubah per lowongan) dan template **form** (isian kandidat/internal, berversi). Bawaan: 3 template alur (Staf kantor, Operator/site massal, Magang) + 6 template form (Lamaran umum, Data lengkap pra-onboarding, Pengumpulan dokumen, Reference check, Penilaian wawancara, Data tambahan cepat). | Pengguna Q11 = a |
| <a id="rec-d12"></a>REC-D12 | **Iterasi mundur dua cara:** (1) "Kembalikan ke tahap…" ke tahap mana pun yang sudah dilewati (wajib alasan; aksi tahap diulang, jawaban lama jadi nilai awal); (2) "Minta data tambahan" tanpa pindah tahap (HR memilih field; kandidat menerima form kecil). | Pengguna Q12 = a |
| <a id="rec-d13"></a>REC-D13 | **Template global** (dipakai semua PT), dikelola SA + HR_ADMIN; template bawaan sistem tidak bisa diubah, hanya disalin. | Pengguna Q13 = a |
| <a id="rec-d14"></a>REC-D14 | **Penawaran** hanya status (dikirim/diterima/ditolak kandidat) + lampiran surat bila ada, **tanpa nominal gaji** (nominal gaji hanya SUPER_ADMIN, PLAN §4.1); surat PDF otomatis + approval = fase lanjut. **Penilaian:** pewawancara baru melihat penilaian orang lain setelah mengirim penilaiannya sendiri. | Pengguna Q14 = a (tafsiran supervisor: (i) a dan (ii) a; dikoreksi bila salah) |

## Keputusan terbuka

| Kode | Pertanyaan | Rekomendasi | Status |
|---|---|---|---|
| <a id="rec-od1"></a>REC-OD1 | "Scraping LinkedIn" (Q6) | – | **terjawab → REC-D7** |
| <a id="rec-od2"></a>REC-OD2 | Google Workspace domain sendiri? Siapa admin Workspace (izin domain-wide delegation satu kali)? | Rancangan jalan dengan tautan manual; Meet dinyalakan setelah terjawab | pengguna 10:41 WIB: "belum tahu" |
| <a id="rec-od3"></a>REC-OD3 | Zoom berbayar? | Zoom = fase lanjut setelah dikonfirmasi (akun gratis: rapat maks 40 menit) | pengguna: "harusnya ada, belum dikonfirmasi" |
| <a id="rec-od4"></a>REC-OD4 | Isi otomatis dari CV dengan AI (Q7) | – | **terjawab → REC-D8** |
| <a id="rec-od5"></a>REC-OD5 | Hubungan dengan Penerimaan & letak menunya (Q9) | – | **terjawab → REC-D10** |
| <a id="rec-od6"></a>REC-OD6 | Masa simpan data pelamar (Q10) | – | **terjawab → REC-D9** |
| <a id="rec-od7"></a>REC-OD7 | Daftar template bawaan (Q11) | – | **terjawab → REC-D11** |

## Kode

Belum ada. Struktur rencana: [design §12](design.md#12-struktur-folder).

## QA

Belum ada.
