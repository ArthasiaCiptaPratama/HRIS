import { parseArgs } from "node:util";
import { z } from "zod";
import { disconnectPrisma } from "../src/core/db.ts";
import {
  approveNormalPendingPunches,
  registerAttendanceIntegrations,
} from "../src/modules/attendance/index.ts";

// EMP-D8 P1: bawaan hanya ringkasan jumlah; --apply diperlukan untuk menulis keputusan sistem.
const usage =
  "Usage: bun run db:approve-normal-punches [--apply] [--company <uuid>] [--before <YYYY-MM-DD>]";
try {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      apply: { type: "boolean", default: false },
      company: { type: "string" },
      before: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const options = z
    .object({ apply: z.boolean(), company: z.uuid().optional(), before: z.iso.date().optional() })
    .parse(values);
  registerAttendanceIntegrations();
  const result = await approveNormalPendingPunches({
    apply: options.apply,
    ...(options.company ? { companyId: options.company } : {}),
    ...(options.before ? { before: options.before } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.failed > 0) process.exitCode = 1;
} catch {
  process.stderr.write(`Failed to approve normal pending punches. ${usage}\n`);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
