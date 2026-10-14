# Template email Supabase Auth — Akselerasi Arthasia

Dipasang manual di **Supabase Dashboard › Authentication › Emails › Templates** (staging & produksi; belum ada access token Management API). Variabel `{{ .ConfirmationURL }}` diisi Supabase; tautan kembali ke `redirectTo` aplikasi (`<web>/auth/callback`, D-045/D-048).

| Template Supabase | Subject | Isi |
|---|---|---|
| **Invite user** (undangan calon/karyawan, D-045) | `Undangan aktivasi akun Akselerasi Arthasia` | [invite.html](invite.html) |
| **Reset password** (lupa password, D-048) | `Atur ulang password Akselerasi Arthasia` | [recovery.html](recovery.html) |

Catatan: email aplikasi lain (keputusan onboarding, notifikasi) dikirim SMTP aplikasi dengan subjek `[Akselerasi Arthasia] …` — bukan template Supabase.

## Logo & tampilan (2026-10-12)
- Gaya **surat resmi**: logo lengkap kiri atas + identitas PT di kanan, garis hijau tua (`#0b4d2c`, warna logo), salam "Yth.", tombol persegi, penutup "Hormat kami, Tim Human Resources", catatan kaki kecil. Tabel + gaya inline (Gmail/Outlook/Apple Mail), lebar maks 560 px, ada tautan cadangan.
- Logo: [`logo-arthasia-email.png`](logo-arthasia-email.png) (dari logo resmi transparan, dipotong & diratakan di atas putih agar aman di mode gelap; 264 × 265 px, tampil 66 px) di-host di **Supabase Storage bucket publik `public-assets`**: `https://iwgzuwcxsxnbjibhbqgh.supabase.co/storage/v1/object/public/public-assets/email/logo-arthasia-email.png`. Tidak memakai base64 (diblokir klien email); gambar dari domain web Vercel tidak tampil di preview dashboard Supabase.
- Alternatif jsDelivr dari GitHub hanya jalan selama repo publik — tidak dipakai agar template tidak bergantung pada visibilitas repo.
- **Produksi:** unggah logo yang sama ke bucket publik project Supabase produksi lalu ganti URL-nya saat Rilis 1.
