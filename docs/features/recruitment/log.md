# Log — Rekrutmen (Talent Acquisition)

Entri terbaru di **atas**. Format satu entri (salin):

```
### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** REC-Dn baru / REC-ODn terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

### 2026-11-24 — Urutan R0 ditegaskan, rencana R0 disimpan (Oatse)
- **Dikerjakan:** sesi hris-11 (handoff `.supervisor/PROMPT-REKRUTMEN.md`): orientasi, cek REC-D5 (Paket 1 EMP-D8 belum
  selesai, RELEASE #109–#111 belum staging), rencana rinci R0 ditulis dan disimpan di checklist README. Tanpa kode.
- **Keputusan:** REC-D15 (KUTIPAN PENGGUNA 11:15 WIB "Paket 1 dlu": R0 menunggu Paket 1 + rilis staging);
  REC-D16 (cakupan kandidat lewat lamaran per PT, disetujui supervisor-3e atas nama pengguna). Rencana R0 disetujui
  supervisor bersyarat REC-D15, plus syarat (a)–(c) di checklist.
- **Verifikasi:** dokumen saja.
- **Berikutnya:** Paket 1 EMP-D8 (fitur karyawan); R0 setelah Paket 1 + rilis staging.

### 2026-11-24 — Rencana implementasi disetujui (Oatse)
- **Dikerjakan:** docs rencana di develop `217c359` (CI 45323244640 ✔). KUTIPAN PENGGUNA 11:07 WIB lewat supervisor-79:
  "Rencana disetujui" (rencana implementasi R0–R5).
- **Keputusan:** rencana R0–R5 disetujui; urutan tetap REC-D5 (kode dimulai setelah Paket 1 EMP-D8 + rilis staging
  berikutnya). REC-D14 tetap memakai tafsiran supervisor (i) a + (ii) a sampai ada koreksi.
- **Verifikasi:** dokumen saja.
- **Berikutnya:** menunggu arahan tugas berikutnya lewat supervisor; R0 saat gilirannya tiba.

### 2026-11-24 — Riset, rancangan, grill rencana modul Rekrutmen (Oatse)
- **Dikerjakan:** handoff supervisor-79 (KUTIPAN PENGGUNA 10:22 WIB). Muat konteks (PLAN §1–4/§7, CODEMAP, pola modul
  api via subagen Explore, nav web, Penerimaan D-045). Riset web 10 pertanyaan lewat `agy-research` (Meet, Zoom,
  LinkedIn, UU PDP, form builder, ATS, mesin status, parsing CV, portal publik, letak onboarding); versi & lisensi
  pustaka dicek langsung ke registry npm. Ditulis: [research.md](research.md), [design.md](design.md), README
  (checklist R0–R6, keputusan). Grill lewat supervisor: batch 1 (Q1–Q5), batch 2 (Q6–Q10), batch 3 (Q9 ulang + Q11–Q14).
- **Keputusan:** REC-D1–D5 (pengguna 10:31 WIB), REC-D7–D9 (10:44 WIB), REC-D10–D14 (10:57 WIB; Q14 ditafsirkan
  supervisor (i) a + (ii) a), REC-D6 (usulan teknis pekerja). Terbuka: REC-OD2 (Workspace/admin), REC-OD3 (Zoom).
  Pertanyaan pengguna Q9 ("flow dari recruitment baru terima di Personal Management?") dijawab di design §3.1.
- **Verifikasi:** dokumen saja. Klaim riset yang belum dicek ke sumber primer ditandai "(belum diverifikasi)",
  terutama PP 33/2026 pelaksana UU PDP.
- **Masalah / catatan:** PLAN §1.3 menaruh Rekrutmen di backlog v1 → dibuka oleh REC-D5. Seksi nav Administrasi
  sekarang ber-id `recruitment` (Penerimaan), jadi harus diganti nama saat R0 agar tidak bentrok dengan grup baru.
  Alamat `/penerimaan` dipakai tautan notifikasi tersimpan, jadi tidak boleh berubah.
- **Berikutnya:** jawaban batch 3 → ringkasan rencana ke supervisor → persetujuan → commit docs. Implementasi R0
  setelah Paket 1 EMP-D8 + rilis staging berikutnya (REC-D5).
