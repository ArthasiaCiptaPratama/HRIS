# Templat kartu fitur

Kartu fitur adalah **cache untuk agent**, bukan dokumen resmi. Sumber kebenaran tetap README fitur, `docs/codemap/` dan kode. Bila kartu berbeda dengan kode, kode yang menang dan kartu diperbaiki di tugas yang sama.

## Aturan

- Satu kartu per area, disimpan di `.claude/skills/fitur-kecil/kartu/<nama>.md`, plus satu baris di `kartu/INDEX.md`.
- **Panjang maksimal ±150 baris.** Tulis ringkas; detail lengkap tetap di README fitur, codemap dan kode.
- **Jangkar = path + nama simbol** (fungsi, konstanta, komponen, hook). Nomor baris boleh, tetapi cepat usang.
- `diverifikasi:` berisi sha pendek HEAD tempat worker **mulai** bekerja + tanggal. Isi nilai yang sama di baris `INDEX.md`.
- "Jalur yang dipantau" dipakai untuk `git diff --stat <sha> -- <jalur>`: cantumkan folder/file yang benar-benar dipakai area ini.
- Keputusan cukup ID + 1 baris; teks lengkap tetap di README fitur.
- **Larangan:** tidak ada rahasia (kunci, password, URL berisi kredensial, isi `.env`), tidak ada data karyawan asli (D-042), tidak ada nilai sensitif (NIK, NPWP, KK, rekening, alamat, gaji, selfie, dokumen) maupun nominal gaji/upah.

## Templat

```md
# Kartu: <area>

- **Area:** <mis. Absensi & punch>
- **Fitur:** <nama fitur> — [docs/features/<fitur>/README.md](../../../../docs/features/<fitur>/README.md)
- **Modul:** `apps/api/src/modules/<modul>/` · `apps/web/src/features/<fitur>/`
- **diverifikasi:** <sha> <YYYY-MM-DD>
- **Jalur yang dipantau:** `<path>` `<path>` `<path>`

## Ringkasan
<maksimal 5 baris: apa yang dicakup area ini, alur utamanya, siapa penggunanya>

## Keputusan aktif
- `<KODE>-D<n>` — <1 baris>
- OD terbuka: `<KODE>-OD<n>` — <1 baris> (jangan diputuskan; tanyakan ke pengguna)

## Peta file

### API — `apps/api/src/modules/<modul>/`
| Lapisan | File | Simbol penting |
|---|---|---|
| Routes | `<modul>.routes.ts` | `<route/handler>` |
| Policy | `<modul>.policy.ts` | `<fungsi policy>` |
| Service | `<modul>.service.ts` | `<fungsi>` |
| Repository | `<modul>.repository.ts` | `<fungsi>` |
| Contract/Zod | `<modul>.contract.ts` | `<skema>` |

### Shared — `packages/shared/src/`
| File | Simbol penting |
|---|---|
| `<file>` | `<tipe/aturan>` |

### Web — `apps/web/src/features/<fitur>/`
| Jenis | File | Simbol penting |
|---|---|---|
| Halaman | `pages/<file>.tsx` | `<komponen>` |
| Komponen | `components/<file>.tsx` | `<komponen>` |
| Hook/API | `<file>-api.ts` | `<hook>` |
| Akses UI | `access.ts` | `<fungsi>` |
| Saklar fitur | `apps/web/src/app/feature-flags.ts` | `<kunci>` (jalur rilis: jangan diubah di jalur ini) |

### Test
| Jenis | File |
|---|---|
| API integration | `apps/api/tests/integration/<folder>/<file>.test.ts` |
| API unit | `apps/api/src/modules/<modul>/__tests__/<file>.test.ts` |
| Web | `apps/web/tests/<file>.test.tsx` |

## Endpoint → policy → siapa
| Method & path | Fungsi policy | Siapa boleh |
|---|---|---|
| `GET /<path>` | `<fungsi>` | <role/cakupan> |

## Resep "cara menambah X"
(3–6 resep yang paling sering untuk area ini)

### R1. Menambah <X>
- File: `<path>` (`<simbol>`), `<path>` (`<simbol>`)
- Test yang diperluas: `<path test>`

### R2. Menambah <Y>
- File: ...
- Test yang diperluas: ...

## Cek & test area ini
- `bun run typecheck && bunx biome ci . && bun run check:boundaries`
- API: `<prefix lokal> bun run db:which && <prefix lokal> bun run --cwd apps/api test <file>`
- Web: `bun run --cwd apps/web test <file>`

## Dokumen yang wajib diperbarui
- `docs/features/<fitur>/README.md` (checklist) dan satu entri `docs/features/<fitur>/log.md`
- develop: `docs/codemap/<modul>.md`; branch rekan tim: "catatan codemap" di `log.md` (PROMPT §8)
- kartu ini + barisnya di `kartu/INDEX.md`

## Jebakan
- <hal yang mudah salah di area ini, 1 baris per poin>
```

`<prefix lokal>` = `DATABASE_URL=<nilai LOCAL_DATABASE_URL> DIRECT_URL=<nilai LOCAL_DIRECT_URL> STORAGE_PATH_PREFIX=<nilai LOCAL_STORAGE_PATH_PREFIX>` (lihat blok fakta di `SKILL.md`). Nilainya tidak pernah ditulis ke kartu.
