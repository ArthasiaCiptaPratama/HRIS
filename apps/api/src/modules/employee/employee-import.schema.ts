import { z } from "@hono/zod-openapi";
import { IMPORT_FIELD_KEYS, IMPORT_MAX_ROWS, type ImportFieldKey } from "@hris/shared";

// D-042: kontrak API import karyawan. Browser mengirim baris yang SUDAH dipetakan (field → nilai sel
// mentah); server menormalisasi & memvalidasi ulang semuanya (tidak percaya browser).

const fieldKey = z.enum(IMPORT_FIELD_KEYS as [ImportFieldKey, ...ImportFieldKey[]]);
// Nilai sel: tanggal dikirim sebagai string ISO; angka Excel tetap angka.
const cell = z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]);

const nameMap = z.record(z.string().max(250), z.uuid());

export const importBodySchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    fileSha256: z.string().regex(/^[a-f0-9]{64}$/, "SHA-256 heksadesimal"),
    mode: z.enum(["CREATE_ONLY", "UPSERT"]),
    /** PT bawaan untuk baris tanpa kolom perusahaan (D-040). */
    companyId: z.uuid().optional(),
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
    }),
    // TANPA nilai: hanya aksi, identitas baris, nama field yang berubah, dan kode masalah.
    rows: z.array(
      z.object({
        sourceRow: z.number().int(),
        action: z.enum(["CREATE", "UPDATE", "SKIP", "ERROR"]),
        employeeNumber: z.string().nullable(),
        fullName: z.string().nullable(),
        companyCode: z.string().nullable(),
        changes: z.array(z.string()),
        issues: z.array(issueSchema),
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
    updatedAt: z.iso.datetime(),
  })
  .openapi("EmployeeImportMapping");
export const mappingBodySchema = z
  .object({ mapping: z.record(z.string().max(250), fieldKey.nullable()) })
  .openapi("EmployeeImportMappingBody");
