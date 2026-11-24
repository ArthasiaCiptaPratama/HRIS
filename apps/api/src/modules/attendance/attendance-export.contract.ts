import { z } from "@hono/zod-openapi";
import { assertExact } from "../../core/contract.ts";
import type { AttendanceExportFile } from "./attendance-export.service.ts";

// TM-D31: respons ekspor Excel data absen (web saja; bukan bagian APP_OPERATION_IDS).

export const attendanceExportFileSchema = z
  .object({
    fileName: z.string().openapi({ example: "absensi-2026-11-01_2026-11-30.xlsx" }),
    rows: z.number().int().openapi({ description: "Jumlah baris data (tanpa header/ringkasan)" }),
    contentBase64: z.string().openapi({ description: "Isi file .xlsx (base64)" }),
  })
  .openapi("AttendanceExportFile");

assertExact<z.infer<typeof attendanceExportFileSchema>, AttendanceExportFile>(true);
