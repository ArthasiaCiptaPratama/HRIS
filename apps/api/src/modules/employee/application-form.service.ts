import { BusinessRuleError } from "../../core/errors.ts";
import { convertDocxToPdf, pdfConversionAvailable } from "../../core/pdf-convert.ts";
import { getMasterLookup } from "../organization/index.ts";
import { applicationFormData, renderApplicationForm } from "./application-form.ts";
import { getEmployee, type RequestContext } from "./employee.service.ts";

// EMP-D1: unduh Formulir Aplikasi (Word / PDF) dari detail karyawan — SA/HR (policy cetak sama dengan
// Print data), data pribadi hanya bila berhak, tercatat di audit `employee.printed` (format docx/pdf).

const JAKARTA_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PHOTO_TIMEOUT_MS = 10_000;

export type ApplicationFormFormat = "docx" | "pdf";

async function fetchPhoto(url: string | null): Promise<Uint8Array | null | "failed"> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : "failed";
  } catch {
    return "failed";
  }
}

/** Divisi = unit berjenis Divisi terdekat di atas (atau sama dengan) unit karyawan (D-050). */
async function divisionOf(departmentId: string | null): Promise<string | null> {
  if (!departmentId) return null;
  const { departments } = await getMasterLookup();
  const seen = new Set<string>();
  for (let unit = departments.get(departmentId); unit && !seen.has(unit.id); ) {
    if (unit.unitType === "DIVISION") return unit.name;
    seen.add(unit.id);
    unit = unit.parentId ? departments.get(unit.parentId) : undefined;
  }
  return null;
}

const safeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export async function exportApplicationForm(
  ctx: RequestContext,
  id: string,
  format: ApplicationFormFormat,
  now = new Date(),
) {
  // Cek layanan konversi sebelum membaca data (tidak ada audit untuk permintaan yang pasti gagal).
  if (format === "pdf" && !pdfConversionAvailable()) {
    throw new BusinessRuleError(
      "Unduhan PDF belum tersedia (layanan konversi belum dikonfigurasi). Unduh versi Word (.docx).",
    );
  }
  const detail = await getEmployee(ctx, id, "print", format);
  const [fetched, division] = await Promise.all([
    fetchPhoto(detail.photoUrl),
    divisionOf(detail.department?.id ?? null),
  ]);
  const { docx, photo } = renderApplicationForm(
    applicationFormData(detail, JAKARTA_DATE.format(now), { division }),
    fetched === "failed" ? null : fetched,
  );
  const base = safeName(
    `${detail.employeeNumber ?? "tanpa-nip"}-${detail.fullName}-formulir-aplikasi`,
  );
  const bytes = format === "pdf" ? await convertDocxToPdf(docx, `${base}.docx`) : docx;
  return {
    fileName: `${base}.${format}`,
    contentType: format === "pdf" ? "application/pdf" : DOCX,
    contentBase64: Buffer.from(bytes).toString("base64"),
    /** included · none (tanpa foto) · unsupported (format foto selain JPEG/PNG) · failed (gagal diambil). */
    photo: fetched === "failed" ? ("failed" as const) : photo,
  };
}
