---
name: hris-workflow
description: Aturan alur kerja & pelaporan wajib untuk SETIAP tugas di repo HRIS — rencana yang menunggu persetujuan, status singkat per poin, verifikasi, pembaruan PROGRESS (checklist, langkah tambahan, log), izin aksi keluar, dan format laporan akhir (ringkasan, yang dikerjakan, hasil verifikasi, temuan, butuh dari pengguna, langkah berikutnya). Use at the start and end of any task in this repo — code, docs, config, schema, deploy, "kerjakan", "lanjut", "laporkan", "next step", "progress" — before writing any plan or final report.
---

# Alur Kerja HRIS

Menjalankan PROMPT §2 (Orientasi → Rencana → Kerjakan → Verifikasi → Catat) dengan aturan yang disepakati pemilik projek (grill 2026-09-28). Skill domain (`hris-db-schema`, `hris-flow-testing`, `hris-e2e-playwright`, `hris-qa-docs`) tetap dipakai untuk isi pekerjaannya.

## Kapan harus berhenti & bertanya

| Situasi | Aturan |
|---|---|
| Pertanyaan, penjelasan, menampilkan isi file | Langsung jawab, laporan ringkas. Tanpa rencana. |
| Pemeriksaan read-only (test, typecheck, status CI, MCP `SELECT`, advisor) | Langsung jalankan, laporkan hasil. |
| Semua tugas lain (kode, dokumen, konfigurasi, skema, deploy) | **Rencana dulu, tunggu persetujuan.** |
| Aksi keluar: commit, push, PR/merge, deploy, tulis ke Supabase/GitHub/Vercel/akun luar | **Tanya tepat sebelum menjalankan, setiap aksi**, walau rencana sudah disetujui. |
| Branch `main` | Tidak disentuh sama sekali kecuali pengguna memintanya eksplisit. |
| Jalur rilis (D-043): merge develop ke `HRIS/Oatse/rilis`, ubah `FEATURES` di rilis, perbaikan di folder `HRIS-rilis` | Persiapan rilis/presentasi → **rencana dulu**; aksi keluarnya tetap ditanya satu per satu. Cek dulu folder/branch yang aktif (`git worktree list`). |
| Keputusan terbuka (OD) atau mengubah keputusan PLAN | Berhenti, jelaskan opsi + rekomendasi, tunggu jawaban. |
| Temuan di luar cakupan tugas (masalah lama, migrasi/perbaikan tambahan) | Jangan dikerjakan; laporkan di "Temuan" dan usulkan. |
| Cek gagal pada perubahan milik tugas ini | Perbaiki sebagai bagian tugas; bila tidak bisa, berhenti dan laporkan. |

## Alur

```
1. Orientasi   baca PROMPT §3, PROGRESS §2 + checklist fase aktif, PLAN/CODEMAP yang relevan
2. Rencana     templat "Rencana" (TEMPLATES.md) → TUNGGU persetujuan
3. Kerjakan    poin demi poin; setelah tiap poin:
               - jalankan cek relevan (tabel di bawah)
               - ubah checklist PROGRESS ([ ]→[~]→[x]) begitu poin selesai & terverifikasi
               - langkah baru yang muncul → sub-item fase aktif "(tambahan YYYY-MM-DD) alasan";
                 di luar fase aktif → PROGRESS §5 Backlog, tidak dikerjakan
               - tulis status singkat (1–3 kalimat), lalu LANJUT otomatis
4. Verifikasi  sebelum menyatakan selesai: typecheck + lint + boundaries + seluruh test
5. Catat       PROGRESS §2 Fokus + entri log §6 (sekali, di akhir), CODEMAP, PLAN bila ada keputusan
6. Laporan     templat "Laporan akhir"; aksi keluar (commit/push/PR) diusulkan di "Butuh dari Anda"
```

## Verifikasi per jenis perubahan

| Perubahan | Cek minimal per poin |
|---|---|
| Kode api/web/shared | `bun run typecheck`, `bunx biome ci .`, test yang relevan |
| Import/modul baru | + `bun run check:boundaries` |
| Skema Prisma | `db:migrate`, `db:generate`, rerun "Already in sync", `db:check`, test integration (skill `hris-db-schema`) |
| Endpoint | test policy + integration (sukses, 400, 401, 403) (skill `hris-flow-testing`) |
| Workflow/CI/deploy | parse YAML, simulasi lokal bila bisa; setelah push: status run + id run |
| Staging Supabase | MCP read-only: tabel/migrasi + `get_advisors` security & performance |
| Dokumen saja | grep konsistensi rujukan (D-xxx, OD-x, nama file) |

Sebelum selesai/commit: `bun run typecheck && bunx biome ci . && bun run check:boundaries && bun run test`.

## Aturan pelaporan

- Hasil ditulis **apa adanya**: perintah + hasil nyata (jumlah test, id run CI, pesan error). Gagal ditulis gagal.
- Yang tidak bisa dicek ditandai **"belum diverifikasi"** + alasan; jangan ditulis selesai.
- Klaim yang ternyata salah dikoreksi terang-terangan di laporan berikutnya.
- Status: `✔` lulus · `✘` gagal · `⚠` lulus dengan catatan · `—` belum diverifikasi.
- Bahasa Indonesia; rujuk item PROGRESS, D-xxx, OD-x, dan `file:baris` bila membantu.

Templat rencana, status per poin, laporan akhir, dan entri PROGRESS: [TEMPLATES.md](TEMPLATES.md).
