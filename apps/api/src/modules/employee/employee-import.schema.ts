import { z } from "@hono/zod-openapi";
import {
  IMPORT_FIELD_KEYS,
  IMPORT_MAX_ROWS,
  type ImportFieldKey,
  orgUnitTypeSchema,
} from "@hris/shared";

// D-042: kontrak API import karyawan. Browser mengirim baris yang SUDAH dipetakan (field → nilai sel
// mentah); server menormalisasi & memvalidasi ulang semuanya (tidak percaya browser).

const fieldKey = z.enum(IMPORT_FIELD_KEYS as [ImportFieldKey, ...ImportFieldKey[]]);
// Nilai sel: tanggal dikirim sebagai string ISO; angka Excel tetap angka.
const cell = z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]);

const nameMap = z.record(z.string().max(250), z.uuid());
const rowKey = z.string().regex(/^\d{1,7}$/);
const unitValueKey = z.string().min(1).max(120);

/** D-064: pilihan HR untuk satu nilai kolom Departemen/Divisi (kunci `unitKey`). */
export const unitChoiceSchema = z.union([
  z.object({ unitId: z.uuid() }),
  /** Gabungkan dengan nilai lain di file (salah ketik/singkatan). */
  z.object({ sameAs: unitValueKey }),
  z.object({
    create: z.object({
      unitType: orgUnitTypeSchema,
      /** Induk: unit yang sudah ada, ATAU nilai lain di file (yang ikut dibuat/dicocokkan). */
      parentUnitId: z.uuid().nullable().optional(),
      parentKey: unitValueKey.nullable().optional(),
    }),
  }),
]);
export type UnitChoice = z.infer<typeof unitChoiceSchema>;
export const unitChoicesSchema = z
  .record(unitValueKey, unitChoiceSchema)
  .refine((value) => Object.keys(value).length <= 500, "Terlalu banyak nilai unit");

export const importBodySchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    fileSha256: z.string().regex(/^[a-f0-9]{64}$/, "SHA-256 heksadesimal"),
    mode: z.enum(["CREATE_ONLY", "UPSERT"]),
    /** PT bawaan untuk baris tanpa kolom perusahaan (D-040). */
    companyId: z.uuid().optional(),
    /** D-062: status kepegawaian bawaan untuk baris yang belum ada di sistem dan tanpa kolom status. */
    defaultEmploymentStatusId: z.uuid().optional(),
    /** D-062: status per baris (nomor baris file → id status), hanya untuk baris yang belum ada di sistem. */
    employmentStatusOverrides: z
      .record(z.string().regex(/^\d{1,7}$/), z.uuid())
      .refine((value) => Object.keys(value).length <= IMPORT_MAX_ROWS, "Terlalu banyak baris")
      .optional(),
    rows: z
      .array(
        z.object({
          sourceRow: z.number().int().min(1).max(1_000_000),
          raw: z.partialRecord(fieldKey, cell),
        }),
      )
      .min(1)
      .max(IMPORT_MAX_ROWS),
    /** Nama master data di file → id yang sudah ada (koreksi pengguna di pratinjau). */
    /** D-064: PT per baris (nomor baris file → id PT), mengalahkan kolom PT & PT bawaan. */
    companyOverrides: z
      .record(rowKey, z.uuid())
      .refine((value) => Object.keys(value).length <= IMPORT_MAX_ROWS, "Terlalu banyak baris")
      .optional(),
    /** D-064: pencocokan nilai Departemen/Divisi ke unit organisasi. */
    unitMapping: unitChoicesSchema.optional(),
    masterDataMapping: z
      .object({
        departments: nameMap.optional(),
        positions: nameMap.optional(),
        grades: nameMap.optional(),
        workLocations: nameMap.optional(),
      })
      .optional(),
  })
  .openapi("EmployeeImportRequest");
export type ImportBody = z.infer<typeof importBodySchema>;

export const commitBodySchema = importBodySchema
  .extend({ previewHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .openapi("EmployeeImportCommit");
export type CommitBody = z.infer<typeof commitBodySchema>;

const issueSchema = z.object({
  field: fieldKey.nullable(),
  code: z.string(),
  severity: z.enum(["ERROR", "WARNING"]),
});

export const previewSchema = z
  .object({
    counts: z.object({
      total: z.number().int(),
      create: z.number().int(),
      update: z.number().int(),
      skip: z.number().int(),
      error: z.number().int(),
      blank: z.number().int(),
      // D-060: lampiran Google Drive yang akan masuk antrean.
      attachments: z.number().int(),
    }),
    // TANPA nilai: hanya aksi, identitas baris, nama field yang berubah, dan kode masalah.
    rows: z.array(
      z.object({
        sourceRow: z.number().int(),
        action: z.enum(["CREATE", "UPDATE", "SKIP", "ERROR"]),
        employeeNumber: z.string().nullable(),
        fullName: z.string().nullable(),
        companyCode: z.string().nullable(),
        /** D-064: asal PT baris (kolom file, pilihan per baris, PT bawaan, data karyawan lama). */
        companySource: z.enum(["FILE", "ROW", "DEFAULT", "EXISTING"]).nullable(),
        /** D-062: true = belum ada di sistem (akan dibuat); status per baris hanya untuk baris ini. */
        newEmployee: z.boolean(),
        /** D-062: status kepegawaian terpilih untuk baris baru (file / per baris / bawaan), null bila belum. */
        employmentStatusId: z.uuid().nullable(),
        changes: z.array(z.string()),
        issues: z.array(issueSchema),
        attachments: z.number().int(),
      }),
    ),
    /** D-064: nilai unik kolom Departemen/Divisi & hasil pencocokannya (tanpa data karyawan). */
    units: z.array(
      z.object({
        /** "<id PT atau ->:<unitKey>" — nilai dicocokkan per PT. */
        key: z.string(),
        name: z.string(),
        companyId: z.uuid().nullable(),
        companyCode: z.string().nullable(),
        /** Nama unit baru yang akan dibuat (bisa berakhiran kode PT bila bentrok). */
        newName: z.string().nullable(),
        columns: z.array(z.enum(["departmentName", "divisionName"])),
        rows: z.number().int(),
        status: z.enum(["MATCHED", "CHOSEN", "NEW", "NEEDS_REVIEW", "INVALID"]),
        unitId: z.uuid().nullable(),
        sameAs: z.string().nullable(),
        create: z
          .object({
            unitType: orgUnitTypeSchema,
            parentUnitId: z.uuid().nullable(),
            parentKey: z.string().nullable(),
          })
          .nullable(),
        suggestions: z.array(
          z.object({
            unitId: z.uuid().nullable(),
            key: z.string().nullable(),
            name: z.string(),
            reason: z.enum(["SAME_NAME", "SPELLING", "ABBREVIATION", "CONTAINS"]),
          }),
        ),
      }),
    ),
    masterData: z.object({
      departments: z.array(z.string()),
      positions: z.array(z.object({ department: z.string(), name: z.string() })),
      grades: z.array(z.string()),
      workLocations: z.array(z.string()),
    }),
    /** Field sensitif di file yang dilewati karena aktor tidak berhak menulisnya. */
    skippedFields: z.array(fieldKey),
    previewHash: z.string(),
  })
  .openapi("EmployeeImportPreview");
export type ImportPreview = z.infer<typeof previewSchema>;

export const importJobSchema = z
  .object({
    id: z.uuid(),
    actorAccountId: z.uuid(),
    companyId: z.uuid().nullable(),
    fileName: z.string(),
    mode: z.enum(["CREATE_ONLY", "UPSERT"]),
    totalRows: z.number().int(),
    createdCount: z.number().int(),
    updatedCount: z.number().int(),
    skippedCount: z.number().int(),
    errorCount: z.number().int(),
    skippedFields: z.array(z.string()),
    createdAt: z.iso.datetime(),
  })
  .openapi("EmployeeImportJob");
export type ImportJobDto = z.infer<typeof importJobSchema>;

export const importJobDetailSchema = importJobSchema
  .extend({
    issues: z.array(
      z.object({
        sourceRow: z.number().int(),
        sourceColumn: z.string().nullable(),
        field: z.string().nullable(),
        code: z.string(),
        severity: z.enum(["ERROR", "WARNING"]),
      }),
    ),
  })
  .openapi("EmployeeImportJobDetail");

// ── D-060: lampiran Google Drive ─────────────────────────────────────────────

export const attachmentStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "DONE",
  "SKIPPED",
  "FAILED",
]);
export const importAttachmentsSchema = z
  .object({
    jobId: z.uuid(),
    /** false = GOOGLE_SERVICE_ACCOUNT_JSON belum diisi (antrean menunggu). */
    driveConfigured: z.boolean(),
    counts: z.object({
      total: z.number().int(),
      pending: z.number().int(),
      done: z.number().int(),
      skipped: z.number().int(),
      failed: z.number().int(),
    }),
    // Tanpa ID/tautan Drive dan tanpa isi file.
    items: z.array(
      z.object({
        id: z.uuid(),
        sourceRow: z.number().int(),
        employeeNumber: z.string().nullable(),
        fullName: z.string(),
        field: z.string(),
        target: z.string(),
        fileCount: z.number().int(),
        status: attachmentStatusSchema,
        reason: z.string().nullable(),
      }),
    ),
  })
  .openapi("EmployeeImportAttachments");
export type ImportAttachmentsDto = z.infer<typeof importAttachmentsSchema>;
export const pendingAttachmentJobsSchema = z
  .array(
    z.object({
      jobId: z.uuid(),
      fileName: z.string(),
      createdAt: z.iso.datetime(),
      pending: z.number().int(),
      failed: z.number().int(),
    }),
  )
  .openapi("EmployeeImportPendingAttachments");

export const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const signatureParamSchema = z.object({ signature: z.string().regex(/^[a-f0-9]{64}$/) });
export const mappingSchema = z
  .object({
    signature: z.string(),
    // header ternormalisasi → field (atau null = diabaikan)
    mapping: z.record(z.string().max(250), fieldKey.nullable()),
    /** D-064: pilihan unit organisasi yang diingat untuk Form ini. */
    unitChoices: unitChoicesSchema,
    updatedAt: z.iso.datetime(),
  })
  .openapi("EmployeeImportMapping");
export const mappingBodySchema = z
  .object({
    mapping: z.record(z.string().max(250), fieldKey.nullable()),
    unitChoices: unitChoicesSchema.optional(),
  })
  .openapi("EmployeeImportMappingBody");
