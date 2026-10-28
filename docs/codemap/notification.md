# Codemap — `notification`

> Detail modul `notification`, dipindah utuh dari `CODEMAP.md` §2/§3/§6 pada 2026-10-13. Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [iam](../features/iam/README.md).

## API (`apps/api/src/modules/`)

```
│   │   ├── notification/             [done] `notify()` (in-app + email, tidak pernah melempar, gagal → outbox), `retryEmailOutbox()`, `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`; `configureNotification()` dipanggil app (+ `push: PushSender`, MOB-D6); `notify({ target? })` juga mengirim push FCM ke perangkat penerima (`pushToAccount`, token 404 dihapus, tidak pernah melempar); `POST /me/devices` (daftar/perbarui token, token pindah ke akun terakhir) & `DELETE /me/devices/{token}` (idempoten, hanya milik sendiri) — MOB 2026-10-21
```

## Web (`apps/web/src/features/`)

```
│       ├── notification/             [done] Lonceng (unread, 5 terbaru, 60 dtk), halaman Notifikasi, tandai baca (gaya seragam 2026-09-30: `PageHeader`, `ListPanel`, `EmptyState`, `TablePagination`)
```

## Tabel & rincian

### `notification`
| Tabel | Isi penting |
|---|---|
| `notifications` | `recipient_account_id` (tanpa FK), `type`, `title`, `body?`, `link?`, `dedupe_key?` (unik per penerima), `target_type?` + `target_id?` (MOB-D6: layar tujuan app mobile; nilai TM di `TM_NOTIFICATION_TARGETS`, + `ROSTER_EDIT` 2026-10-28 untuk pengajuan perubahan jadwal oleh HR), `read_at?` |
| `push_devices` | MOB-D6: token FCM app mobile — `account_id` (tanpa FK), `token` (unik), `platform` (enum `PushPlatform`: ANDROID), `app_version?`, `last_seen_at`; dihapus saat logout, saat FCM menjawab 404, dan oleh `forgetRecipient` |
| `email_outbox` | Email gagal kirim: `to_email`, `subject`, `text_body`, `status` (PENDING/SENT/FAILED), `attempts` (maks 5), `last_error`, `next_attempt_at` (30 menit, lalu +1 jam × percobaan) |

Pemicu (PLAN §5.6), dari modul `iam` setelah transaksi commit: grant diberikan/dicabut (ke penerima), grant akan kedaluwarsa ≤ 3 hari (cron, `dedupe_key`), perubahan SUPER_ADMIN/Utama (undangan SA, ubah role SA, nonaktif/aktif SA, serah-terima & pemulihan Utama → semua SUPER_ADMIN aktif). Email lokal hanya log (D-025).

---
