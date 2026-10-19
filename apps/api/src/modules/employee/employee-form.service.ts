import { getMasterLookup } from "../organization/index.ts";
import { getEmployee, type RequestContext } from "./employee.service.ts";
import { employeeFormData } from "./employee-form.ts";
import { renderEmployeeFormPdf } from "./employee-form-pdf.ts";

// Print data karyawan (2026-10-19): unduh "Formulir Data Karyawan" (PDF dari template HR) dari detail —
// SA/HR (policy cetak), data pribadi & rekening hanya bila berhak, tercatat di audit `employee.printed`
// {format: pdf}. Menggantikan Print data .xlsx & Formulir Aplikasi Word (EMP-D1).

const JAKARTA_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
const PHOTO_TIMEOUT_MS = 10_000;

async function fetchPhoto(url: string | null): Promise<Uint8Array | null | "failed"> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : "failed";
  } catch {
    return "failed";
  }
}

/** Divisi = unit `DIVISION` terdekat di atas (atau sama dengan) unit karyawan (D-050). */
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

/**
 * `photoBase64` = pas foto JPEG/PNG yang disiapkan browser (foto profil tersimpan WebP; pdf-lib hanya
 * JPEG/PNG). Kosong → server mengambil foto profil sendiri (berhasil bila JPEG/PNG).
 */
export async function exportEmployeeForm(
  ctx: RequestContext,
  id: string,
  photoBase64: string | null = null,
  now = new Date(),
) {
  const detail = await getEmployee(ctx, id, "print", "pdf");
  const supplied =
    photoBase64 && detail.photoUrl ? new Uint8Array(Buffer.from(photoBase64, "base64")) : null;
  const [fetched, division] = await Promise.all([
    supplied ?? fetchPhoto(detail.photoUrl),
    divisionOf(detail.department?.id ?? null),
  ]);
  const { pdf, photo } = await renderEmployeeFormPdf(
    employeeFormData(detail, JAKARTA_DATE.format(now), { division }),
    fetched === "failed" ? null : fetched,
  );
  return {
    fileName: `${safeName(`${detail.employeeNumber ?? "tanpa-nip"}-${detail.fullName}-data-karyawan`)}.pdf`,
    contentType: "application/pdf" as const,
    contentBase64: Buffer.from(pdf).toString("base64"),
    /** included · none (tanpa foto) · unsupported (format foto selain JPEG/PNG) · failed (gagal diambil). */
    photo: fetched === "failed" ? ("failed" as const) : photo,
  };
}
