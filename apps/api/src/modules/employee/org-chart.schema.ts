import { z } from "@hono/zod-openapi";
import { orgUnitTypeSchema, positionLevelSchema } from "@hris/shared";

// D-051: bagan organisasi berbasis pos jabatan. Isi = kolom direktori (PLAN §4.3: nama, jabatan,
// unit, email kantor) — tanpa data pribadi, sehingga boleh untuk semua role di PT-nya.

const companyRef = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

export const orgChartQuerySchema = z.object({ companyId: z.uuid().optional() });

export const orgChartSchema = z
  .object({
    company: companyRef,
    /** PT yang boleh dipilih aktor (pemilih PT). */
    companies: z.array(companyRef),
    units: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        unitType: orgUnitTypeSchema,
        parentId: z.uuid().nullable(),
        /** true = fungsi korporat grup (unit tanpa PT, D-052). */
        corporate: z.boolean(),
      }),
    ),
    posts: z.array(
      z.object({
        id: z.uuid(),
        positionName: z.string(),
        level: positionLevelSchema.nullable(),
        departmentId: z.uuid(),
        corporate: z.boolean(),
        reportsToId: z.uuid().nullable(),
        functionalReportsToId: z.uuid().nullable(),
        headcount: z.number().int(),
        sortOrder: z.number().int(),
        holders: z.array(
          z.object({ id: z.uuid(), fullName: z.string(), photoUrl: z.string().nullable() }),
        ),
      }),
    ),
    /** Karyawan aktif PT ini yang belum ditempatkan di pos mana pun. */
    unplacedCount: z.number().int(),
    /** SA/HR: klik kotak membuka detail karyawan; role lain: kartu profil kerja. */
    canOpenDetail: z.boolean(),
    /** SA: tautan ke Master Data › Pos jabatan. */
    canManage: z.boolean(),
  })
  .openapi("OrgChart");
export type OrgChart = z.infer<typeof orgChartSchema>;

export const orgPersonCardSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    photoUrl: z.string().nullable(),
    position: z.string(),
    department: z.string().nullable(),
    company: z.object({ code: z.string(), name: z.string() }),
    workLocation: z.string().nullable(),
    workEmail: z.string().nullable(),
  })
  .openapi("OrgPersonCard");
export type OrgPersonCard = z.infer<typeof orgPersonCardSchema>;
