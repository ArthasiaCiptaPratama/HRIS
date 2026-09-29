// Uji SMTP end-to-end (D-025/D-032): transporter nodemailer ke Gmail sungguhan.
// Pakai: bun run verify:smtp -- --to <email> [--from <email>]
// Tujuan: mengirim SATU email uji dari akun pengirim yang dikonfigurasi di .env,
// membuktikan App Password + host/port bekerja end-to-end. Bukan bagian dari aplikasi.
//
// Aman (PROMPT §3.7): tidak mengirim data sensitif; log tidak memuat SMTP_PASS.
import { parseArgs } from "node:util";
import nodemailer from "nodemailer";
import { z } from "zod";

const out = (line: string) => process.stdout.write(`${line}\n`);

const { values } = parseArgs({
  options: {
    to: { type: "string" },
    from: { type: "string" },
  },
});

const recipient = z.email().safeParse(values.to?.trim().toLowerCase());
if (!recipient.success) {
  out("Gunakan: bun run verify-smtp -- --to <email-penerima> [--from <email-pengirim>]");
  process.exit(1);
}

const env = z
  .object({
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_USER: z.email(),
    SMTP_PASS: z.string().min(1),
    EMAIL_FROM: z.string().min(1),
  })
  .safeParse(process.env);

if (!env.success) {
  out(
    `Env SMTP kurang: ${env.error.issues
      .map((i) => i.path.join("."))
      .join(", ")} (isi SMTP_HOST/PORT/USER/PASS & EMAIL_FROM di .env root)`,
  );
  process.exit(1);
}

const cfg = env.data;
const fromAddress = (values.from ?? cfg.EMAIL_FROM).trim();

const transport = nodemailer.createTransport({
  host: cfg.SMTP_HOST,
  port: cfg.SMTP_PORT,
  secure: cfg.SMTP_PORT === 465,
  requireTLS: cfg.SMTP_PORT !== 465,
  auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS },
});

async function main() {
  out(`Host           : ${cfg.SMTP_HOST}:${cfg.SMTP_PORT}`);
  out(`From           : ${fromAddress}`);
  out(`To             : ${recipient.data}`);

  await transport.verify();
  out("Verify         : OK (STARTTLS/handshake berhasil, kredensial diterima)");

  const now = new Date();
  const stamp = now.toISOString().replace("T", " ").slice(0, 16);
  const subject = `[HRIS Staging] Uji SMTP end-to-end ${stamp}`;
  const text = [
    "Email uji dari skrip verify-smtp (HRIS).",
    `Waktu (UTC)    : ${now.toISOString()}`,
    `Dari           : ${fromAddress}`,
    `Tujuan         : ${recipient.data}`,
    "",
    "Jika email ini masuk, jalur SMTP aplikasi ke Gmail berfungsi.",
  ].join("\n");

  const info = await transport.sendMail({
    from: fromAddress,
    to: recipient.data,
    subject,
    text,
  });

  // nodemailer: info.response = "250 2.0.0 OK ..."; info.messageId = "<...@gmail.com>"
  const responseFirstLine = String(info.response ?? "")
    .split("\n")[0]
    ?.trim();
  out("Send           : OK");
  out(`SMTP response  : ${responseFirstLine || "(kosong)"}`);
  out(`Message-ID     : ${info.messageId}`);
}

try {
  await main();
} catch (error) {
  // Pesan saja; tidak mencetak env/kunci.
  out(`Gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  transport.close();
}
