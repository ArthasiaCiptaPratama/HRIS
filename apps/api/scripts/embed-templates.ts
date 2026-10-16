// EMP-D1: sematkan template dokumen (.docx) ke kode api sebagai base64 supaya ikut bundel (Vercel/Docker)
// tanpa berkas terpisah — pola sama dengan logo kop (`src/core/brand-logo.ts`).
// Pakai: ubah `templates/formulir-aplikasi.docx` di Word → `bun run templates:embed` → commit keduanya.
const SOURCE = new URL("../templates/formulir-aplikasi.docx", import.meta.url);
const TARGET = new URL("../src/modules/employee/application-form-template.ts", import.meta.url);

const base64 = Buffer.from(await Bun.file(SOURCE).arrayBuffer()).toString("base64");
const lines = base64.match(/.{1,100}/g) ?? [];
const body = `// DIBUAT OTOMATIS oleh \`bun run templates:embed\` dari \`apps/api/templates/formulir-aplikasi.docx\` — jangan diedit.
// EMP-D1: template Formulir Aplikasi (bertanda docxtemplater) yang diisi data karyawan.
export const APPLICATION_FORM_TEMPLATE_BASE64 = [
${lines.map((l) => `  "${l}",`).join("\n")}
].join("");
`;
await Bun.write(TARGET, body);
process.stdout.write(
  `template disematkan: ${base64.length.toLocaleString("id-ID")} karakter base64 → ${TARGET.pathname}\n`,
);
