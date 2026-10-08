// D-058 (Arsip gelombang 1d): ekspor Excel per kategori Arsip, mengikuti filter tabel. Isi = yang boleh
// dilihat aktor di layar (layanan daftar yang sama: cakupan PT, grant Keluarga/Bank/dokumen sensitif,
// alamat domisili & biaya pelatihan hanya bila berhak). Dibuat di server, tidak disimpan, diaudit.
import {
  ARCHIVE_EXPORT_MAX_ROWS,
  type ArchiveListCategory,
  buildWorkbook,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_STATUS_LABELS,
  EDUCATION_LEVEL_LABELS,
  EMPLOYMENT_CHANGE_LABELS,
  EXPIRY_STATE_LABELS,
  FAMILY_RELATIONSHIP_LABELS,
  GENDER_LABELS,
  MOVEMENT_TYPE_LABELS,
  TRAINING_TYPE_LABELS,
  type XlsxCell,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ForbiddenError } from "../../core/errors.ts";
import type { ArchiveExportQuery } from "./archive.schema.ts";
import { listArchive } from "./archive.service.ts";
import { listBankArchive, listFamilyArchive } from "./data-change.service.ts";
import { listArchiveDocuments } from "./document.service.ts";
import * as policy from "./employee.policy.ts";
import { type RequestContext, todayInJakarta } from "./employee.service.ts";

const SHEET: Record<ArchiveListCategory, string> = {
  contacts: "Data Kontak",
  educations: "Data Pendidikan",
  "position-histories": "Riwayat Jabatan",
  trainings: "Data Pelatihan",
  "work-experiences": "Data Riwayat Kerja",
  families: "Data Keluarga",
  "bank-accounts": "Data Bank",
  documents: "Data File",
};

interface EmployeeRef {
  employeeNumber: string;
  fullName: string;
  isActive: boolean;
  company: { code: string };
  department: { name: string } | null;
  position: { name: string };
}
const BASE_HEADERS = ["NIP", "Nama", "PT", "Departemen", "Jabatan", "Status karyawan"];
const base = (e: EmployeeRef): XlsxCell[] => [
  e.employeeNumber,
  e.fullName,
  e.company.code,
  e.department?.name ?? null,
  e.position.name,
  e.isActive ? "Aktif" : "Nonaktif",
];
const date = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : null;
const label = <K extends string>(labels: Record<K, string>, value: K | null | undefined) =>
  value ? (labels[value] ?? value) : null;

/** Data satu kategori → baris sheet (header + isi) dan jumlah total sesuai filter. */
async function sheetRows(
  ctx: RequestContext,
  category: ArchiveListCategory,
  query: ArchiveExportQuery,
): Promise<{ rows: XlsxCell[][]; total: number }> {
  const common = {
    page: 1,
    pageSize: ARCHIVE_EXPORT_MAX_ROWS,
    q: query.q,
    companyId: query.companyId,
    departmentId: query.departmentId,
    employees: query.employees,
  };
  const list = {
    ...common,
    level: query.level,
    type: query.type,
    movementType: query.movementType,
    source: query.source,
  };
  switch (category) {
    case "contacts": {
      const { data, meta } = await listArchive(ctx, category, list);
      const rows = data as {
        employee: EmployeeRef;
        phoneNumber: string | null;
        workEmail: string | null;
        personalEmail: string | null;
        emergencyContactName: string | null;
        emergencyContactRelationship: string | null;
        emergencyPhone: string | null;
        domicileAddress?: string | null;
      }[];
      // Kolom alamat hanya bila aktor boleh membaca data pribadi minimal satu baris.
      const address = rows.some((r) => "domicileAddress" in r);
      return {
        total: meta.total,
        rows: [
          [
            ...BASE_HEADERS,
            "No. HP",
            "Email kantor",
            "Email pribadi",
            "Kontak darurat",
            "Hubungan",
            "No. HP darurat",
            ...(address ? ["Alamat domisili"] : []),
          ],
          ...rows.map((r) => [
            ...base(r.employee),
            r.phoneNumber,
            r.workEmail,
            r.personalEmail,
            r.emergencyContactName,
            r.emergencyContactRelationship,
            r.emergencyPhone,
            ...(address ? [r.domicileAddress ?? null] : []),
          ]),
        ],
      };
    }
    case "educations": {
      const { data, meta } = await listArchive(ctx, category, list);
      const rows = data as {
        employee: EmployeeRef;
        level: keyof typeof EDUCATION_LEVEL_LABELS | null;
        schoolName: string;
        major: string | null;
        entryYear: number | null;
        graduationYear: number | null;
      }[];
      return {
        total: meta.total,
        rows: [
          [
            ...BASE_HEADERS,
            "Jenjang",
            "Sekolah/universitas",
            "Jurusan",
            "Tahun masuk",
            "Tahun lulus",
          ],
          ...rows.map((r) => [
            ...base(r.employee),
            label(EDUCATION_LEVEL_LABELS, r.level),
            r.schoolName,
            r.major,
            r.entryYear,
            r.graduationYear,
          ]),
        ],
      };
    }
    case "trainings": {
      const { data, meta } = await listArchive(ctx, category, list);
      const rows = data as {
        employee: EmployeeRef;
        trainingField: string;
        organizer: string | null;
        type: keyof typeof TRAINING_TYPE_LABELS | null;
        startDate: string | null;
        endDate: string | null;
        hours: number | null;
        trainingYear: number | null;
        duration: string | null;
        cost?: number | null;
      }[];
      const cost = rows.some((r) => "cost" in r);
      return {
        total: meta.total,
        rows: [
          [
            ...BASE_HEADERS,
            "Bidang pelatihan",
            "Penyelenggara",
            "Jenis",
            "Mulai",
            "Selesai",
            "Jam",
            "Tahun",
            "Durasi",
            ...(cost ? ["Biaya (Rp)"] : []),
          ],
          ...rows.map((r) => [
            ...base(r.employee),
            r.trainingField,
            r.organizer,
            label(TRAINING_TYPE_LABELS, r.type),
            date(r.startDate),
            date(r.endDate),
            r.hours,
            r.trainingYear,
            r.duration,
            ...(cost ? [r.cost ?? null] : []),
          ]),
        ],
      };
    }
    case "work-experiences": {
      const { data, meta } = await listArchive(ctx, category, list);
      const rows = data as {
        employee: EmployeeRef;
        companyName: string;
        position: string | null;
        startYear: number | null;
        endYear: number | null;
        description: string | null;
      }[];
      return {
        total: meta.total,
        rows: [
          [...BASE_HEADERS, "Perusahaan", "Jabatan", "Tahun mulai", "Tahun selesai", "Keterangan"],
          ...rows.map((r) => [
            ...base(r.employee),
            r.companyName,
            r.position,
            r.startYear,
            r.endYear,
            r.description,
          ]),
        ],
      };
    }
    case "position-histories": {
      const { data, meta } = await listArchive(ctx, category, list);
      const rows = data as {
        employee: EmployeeRef;
        changeType: keyof typeof EMPLOYMENT_CHANGE_LABELS;
        source: "SYSTEM" | "MANUAL";
        effectiveDate: string;
        movementType: keyof typeof MOVEMENT_TYPE_LABELS | null;
        fromPosition: { name: string } | null;
        toPosition: { name: string } | null;
        toPositionName: string | null;
        toDepartmentName: string | null;
        fromCompany: { code: string } | null;
        toCompany: { code: string } | null;
        decreeNumber: string | null;
        note: string | null;
      }[];
      return {
        total: meta.total,
        rows: [
          [
            ...BASE_HEADERS,
            "Tanggal efektif",
            "Perubahan",
            "Jenis mutasi",
            "Sumber",
            "Dari jabatan",
            "Ke jabatan",
            "Ke unit",
            "Dari PT",
            "Ke PT",
            "No. SK",
            "Catatan",
          ],
          ...rows.map((r) => [
            ...base(r.employee),
            date(r.effectiveDate),
            label(EMPLOYMENT_CHANGE_LABELS, r.changeType),
            label(MOVEMENT_TYPE_LABELS, r.movementType),
            r.source === "MANUAL" ? "Input riwayat lama" : "Sistem",
            r.fromPosition?.name ?? null,
            r.toPosition?.name ?? r.toPositionName,
            r.toDepartmentName,
            r.fromCompany?.code ?? null,
            r.toCompany?.code ?? null,
            r.decreeNumber,
            r.note,
          ]),
        ],
      };
    }
    case "families": {
      const { data, meta } = await listFamilyArchive(ctx, {
        ...common,
        relationship: query.relationship,
      });
      return {
        total: meta.total,
        rows: [
          [
            ...BASE_HEADERS,
            "Nama anggota",
            "Hubungan",
            "Jenis kelamin",
            "Tempat lahir",
            "Tanggal lahir",
            "Usia saat didata",
            "Pendidikan",
            "Pekerjaan",
            "Alamat kerja",
            "No. HP",
          ],
          ...data.map((r) => [
            ...base(r.employee),
            r.name,
            label(FAMILY_RELATIONSHIP_LABELS, r.relationship),
            label(GENDER_LABELS, r.gender),
            r.birthPlace,
            date(r.birthDate),
            r.ageAtEntry,
            r.education,
            r.occupation,
            r.workAddress,
            r.phoneNumber,
          ]),
        ],
      };
    }
    case "bank-accounts": {
      const { data, meta } = await listBankArchive(ctx, common);
      return {
        total: meta.total,
        rows: [
          [...BASE_HEADERS, "Bank", "No. rekening", "Atas nama"],
          ...data.map((r) => [...base(r.employee), r.bankName, r.accountNumber, r.accountHolder]),
        ],
      };
    }
    case "documents": {
      const { data, meta } = await listArchiveDocuments(ctx, {
        ...common,
        documentTypeId: query.documentTypeId,
        category: query.category,
        expiry: query.expiry,
      });
      return {
        total: meta.total,
        rows: [
          [
            ...BASE_HEADERS,
            "Jenis dokumen",
            "Kategori",
            "Nomor",
            "Tanggal terbit",
            "Kedaluwarsa",
            "Masa berlaku",
            "Versi",
            "Status",
            "Catatan",
            "Diunggah",
          ],
          ...data.map((r) => [
            ...base(r.employee),
            r.documentType.name,
            label(DOCUMENT_CATEGORY_LABELS, r.documentType.category),
            r.documentNumber,
            date(r.issuedAt),
            date(r.expiresAt),
            label(EXPIRY_STATE_LABELS, r.expiryState),
            r.version,
            label(DOCUMENT_STATUS_LABELS, r.status),
            r.note,
            date(r.uploadedAt),
          ]),
        ],
      };
    }
  }
}

export async function exportArchive(
  ctx: RequestContext,
  category: ArchiveListCategory,
  query: ArchiveExportQuery,
) {
  if (!policy.canExportArchive(ctx.actor)) throw new ForbiddenError();
  // Tanpa Storage: ekspor tidak butuh URL foto (menghindari ribuan tanda tangan URL).
  const { rows, total } = await sheetRows({ ...ctx, storage: undefined }, category, query);
  if (total > ARCHIVE_EXPORT_MAX_ROWS) {
    throw new BusinessRuleError(
      `Hasil filter ${total.toLocaleString("id-ID")} baris; maksimal ${ARCHIVE_EXPORT_MAX_ROWS.toLocaleString("id-ID")} baris per file. Persempit filter (mis. per PT atau unit).`,
    );
  }
  const bytes = buildWorkbook([{ name: SHEET[category], rows }]);
  const count = rows.length - 1;
  // Filter dicatat tanpa teks pencarian (bisa berisi nama orang).
  const filters = Object.fromEntries(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, key === "q" ? true : value]),
  );
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
    action: "employee.archive.export",
    entityType: "employee.archive",
    entityId: category,
    after: { filters, rows: count },
  });
  const company = query.companyId && rows[1] ? String(rows[1][2]).toLowerCase() : "semua-pt";
  return {
    fileName: `arsip-${category}-${company}-${todayInJakarta()}.xlsx`,
    rows: count,
    contentBase64: Buffer.from(bytes).toString("base64"),
  };
}
