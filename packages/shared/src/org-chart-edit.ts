import { z } from "zod";
import { ORG_POST_HEADCOUNT_MAX } from "./org-chart.ts";
import { positionInputSchema } from "./organization.ts";

// ORG-D2: mode edit bagan organisasi. Klien mengumpulkan draf ubahan (undo/redo) lalu mengirimnya
// sekaligus; server menerapkan berurutan dalam SATU transaksi (gagal satu → batal semua), dengan
// konkurensi optimistis lewat nomor revisi bagan (beda → 409). Pos/jabatan baru dirujuk dengan id
// sementara "tmp:<slug>" sampai tersimpan.

export const ORG_CHART_TEMP_PREFIX = "tmp:";
export const ORG_CHART_CHANGES_MAX = 500;

export const orgChartTempIdSchema = z
  .string()
  .regex(/^tmp:[A-Za-z0-9_-]{1,40}$/, "Id sementara tidak sah.");
/** Rujukan pos/jabatan: UUID yang sudah ada atau id sementara dari operasi sebelumnya di batch yang sama. */
export const orgChartRefSchema = z.union([z.uuid(), orgChartTempIdSchema]);
export type OrgChartRef = z.infer<typeof orgChartRefSchema>;

export const isOrgChartTempId = (id: string) => id.startsWith(ORG_CHART_TEMP_PREFIX);

const headcount = z
  .number("Jumlah slot harus berupa angka.")
  .int("Jumlah slot bilangan bulat.")
  .min(1, `Jumlah slot 1–${ORG_POST_HEADCOUNT_MAX}.`)
  .max(ORG_POST_HEADCOUNT_MAX, `Jumlah slot 1–${ORG_POST_HEADCOUNT_MAX}.`);
const sortOrder = z.number().int().min(0).max(999);

export const orgChartChangeSchema = z.discriminatedUnion("op", [
  /** Jabatan baru di tempat (pengecualian D-049, ORG-D2): hanya membuat; unit harus di PT cakupan. */
  z.object({
    op: z.literal("createPosition"),
    tempId: orgChartTempIdSchema,
    name: positionInputSchema.shape.name,
    departmentId: z.uuid("Pilih unit organisasi."),
    level: positionInputSchema.shape.level.unwrap(),
  }),
  z.object({
    op: z.literal("createPost"),
    tempId: orgChartTempIdSchema,
    positionId: orgChartRefSchema,
    reportsToId: orgChartRefSchema.nullable(),
    functionalReportsToId: orgChartRefSchema.nullable().default(null),
    headcount,
    sortOrder: sortOrder.default(0),
  }),
  /** Field yang tidak dikirim tidak diubah; null = hapus atasan. */
  z.object({
    op: z.literal("updatePost"),
    postId: orgChartRefSchema,
    positionId: orgChartRefSchema.optional(),
    reportsToId: orgChartRefSchema.nullable().optional(),
    functionalReportsToId: orgChartRefSchema.nullable().optional(),
    headcount: headcount.optional(),
    sortOrder: sortOrder.optional(),
  }),
  /** Arsip lunak; hanya bila pos kosong & tanpa bawahan aktif (garis tegas maupun fungsional). */
  z.object({ op: z.literal("archivePost"), postId: orgChartRefSchema }),
  /** Tempatkan karyawan aktif ke pos (jabatan karyawan ikut jabatan pos); postId null = lepas dari pos. */
  z.object({
    op: z.literal("placeEmployee"),
    employeeId: z.uuid(),
    postId: orgChartRefSchema.nullable(),
  }),
]);
export type OrgChartChange = z.infer<typeof orgChartChangeSchema>;
export type OrgChartChangeOp = OrgChartChange["op"];

export const orgChartChangeBatchSchema = z.object({
  /** PT bagan yang sedang diedit (pos korporat ikut tampil; hanya SA yang boleh mengubahnya). */
  companyId: z.uuid(),
  /** Revisi bagan saat draf dimulai (GET /org-chart → revision). */
  baseRevision: z.number().int().min(0),
  changes: z.array(orgChartChangeSchema).min(1).max(ORG_CHART_CHANGES_MAX),
});
export type OrgChartChangeBatch = z.infer<typeof orgChartChangeBatchSchema>;

/** Label orang/pos dalam ringkasan dampak (tanpa data pribadi: kolom direktori saja). */
const personRef = z.object({ id: z.uuid(), fullName: z.string() });

export const orgChartChangePreviewSchema = z.object({
  /** Revisi saat ini di server (sama dengan baseRevision bila belum ada editor lain). */
  revision: z.number().int(),
  posts: z.array(
    z.object({
      /** UUID pos lama atau id sementara pos baru. */
      postId: z.string(),
      label: z.string(),
      kind: z.enum(["CREATED", "UPDATED", "ARCHIVED"]),
      /** Uraian singkat berbahasa Indonesia, mis. "Atasan: KTT → Superintendent Engineer". */
      details: z.array(z.string()),
    }),
  ),
  createdPositions: z.array(z.object({ name: z.string(), unitName: z.string() })),
  placements: z.array(
    z.object({
      employee: personRef,
      fromPost: z.string().nullable(),
      toPost: z.string().nullable(),
    }),
  ),
  /** D-053: karyawan yang atasan langsung otomatisnya berganti (managerOverride tidak disentuh). */
  managerChanges: z.array(
    z.object({
      employee: personRef,
      fromManager: personRef.nullable(),
      toManager: personRef.nullable(),
    }),
  ),
  /**
   * Pengajuan (cuti/izin/lembur/koreksi, dst.) yang masih menunggu persetujuan milik karyawan yang
   * atasannya berganti. Tetap diproses penyetuju lama (ORG-D2).
   */
  pendingRequests: z.array(
    z.object({ employee: personRef, subjectType: z.string(), count: z.number().int() }),
  ),
});
export type OrgChartChangePreview = z.infer<typeof orgChartChangePreviewSchema>;

export const orgChartChangeResultSchema = z.object({
  revision: z.number().int(),
  /** id sementara → UUID tersimpan (pos & jabatan baru). */
  createdIds: z.record(z.string(), z.uuid()),
  managersUpdated: z.number().int(),
});
export type OrgChartChangeResult = z.infer<typeof orgChartChangeResultSchema>;
