// Print data PDF: sematkan template "Formulir Data Karyawan" (PDF dari HR) ke kode api sebagai base64 supaya
// ikut bundel (Vercel/Docker) tanpa berkas terpisah — pola sama dengan logo kop (`src/core/brand-logo.ts`).
// Pakai: ganti `templates/formulir-data-karyawan.pdf` → `bun run templates:embed` → sesuaikan posisi isian
// di `employee-form-pdf.ts` bila tata letak berubah (posisi tetap, EMP-OD2) → commit.
const SOURCE = new URL("../templates/formulir-data-karyawan.pdf", import.meta.url);
const TARGET = new URL("../src/modules/employee/employee-form-template.ts", import.meta.url);

const base64 = Buffer.from(await Bun.file(SOURCE).arrayBuffer()).toString("base64");
const lines = base64.match(/.{1,100}/g) ?? [];
const body = `// DIBUAT OTOMATIS oleh \`bun run templates:embed\` dari \`apps/api/templates/formulir-data-karyawan.pdf\` — jangan diedit.
// Template PDF "Formulir Data Karyawan" (HR) — latar Print data karyawan.
export const EMPLOYEE_FORM_TEMPLATE_BASE64 = [
${lines.map((l) => `  "${l}",`).join("\n")}
].join("");
`;
await Bun.write(TARGET, body);
process.stdout.write(
  `template disematkan: ${base64.length.toLocaleString("id-ID")} karakter base64 → ${TARGET.pathname}\n`,
);
