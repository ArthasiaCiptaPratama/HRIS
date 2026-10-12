# Template email Supabase Auth — Akselerasi Arthasia

Dipasang manual di **Supabase Dashboard › Authentication › Emails › Templates** (staging & produksi; belum ada access token Management API). Variabel `{{ .ConfirmationURL }}` diisi Supabase; tautan kembali ke `redirectTo` aplikasi (`<web>/auth/callback`, D-045/D-048).

| Template Supabase | Subject | Isi |
|---|---|---|
| **Invite user** (undangan calon/karyawan, D-045) | `Undangan aktivasi akun Akselerasi Arthasia` | [invite.html](invite.html) |
| **Reset password** (lupa password, D-048) | `Atur ulang password Akselerasi Arthasia` | [recovery.html](recovery.html) |

Catatan: email aplikasi lain (keputusan onboarding, notifikasi) dikirim SMTP aplikasi dengan subjek `[Akselerasi Arthasia] …` — bukan template Supabase.
