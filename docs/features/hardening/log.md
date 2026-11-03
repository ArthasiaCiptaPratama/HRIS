# Log — Hardening

Entri terbaru di **atas**. Format satu entri (salin):

```
### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

Log sebelum 2026-10-13 ada di [archive/log-2026-09.md](../../archive/log-2026-09.md) dan [archive/log-2026-10.md](../../archive/log-2026-10.md) (cari judul atau D-xxx fitur ini).

### 2026-11-03 — Perbaikan audit keamanan A–D (Oatse + Codex)
- **Dikerjakan:** checklist "Review keamanan" A–D (4 branch fitur dari develop `014d8a0`, satu commit per temuan). Implementasi oleh worker Codex (A sol-high, B sol-medium, C sol-high, D sol-medium), review diff penuh + verifikasi ulang oleh sesi HRIS. Koreksi review: C mempertahankan `BusinessRuleError` + pesan lama untuk path tidak valid (kontrak app mobile); D `escapeCsvCell` tidak mengubah angka negatif. Upgrade zod/nodemailer dikerjakan sendiri.
- **Keputusan:** HRD-D1 (Q2), HRD-D2 (Q1), HRD-D3 (Q3). Q4 ke Backlog.
- **Verifikasi:** per branch di tree asli: `bun run typecheck` ✔ · `bunx biome ci .` ✔ (1 warning lama) · `bun run check:boundaries` ✔ · test API: A 1083/1083 (cw), B 1176/1176, C 1066/1066, D shared 346 + api 1040 + web 338 ✔ (setelah upgrade dependency). Sebelumnya 21 test merah karena DB lokal `hris` belum menerima migrasi `20261102080000_app_create_idempotency` → `prisma migrate deploy` (lokal).
- **Masalah / catatan:** EMPLOYEE GET `/attendance/days` kini 403 (web sudah menyembunyikannya; app tidak memakai). Server dev hanya 127.0.0.1 (akses LAN putus; adb reverse tetap). Akun SA/HR yang email akunnya = alamat login NIK tidak bisa lupa password (HRD-D1). Irisan file dengan HRIS/mobile-app: `attendance/roster.service.ts`, `leave.service.ts`.
- **Berikutnya:** gabung A–D ke develop (lapor supervisor), rilis staging = kata pengguna; validasi header/CSP staging.

