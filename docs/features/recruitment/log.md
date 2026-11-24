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
