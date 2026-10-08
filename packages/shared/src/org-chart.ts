import { z } from "zod";

// D-051: pos jabatan = "kursi" di bagan (job vs position). Jabatan (master) tetap katalog nama yang
// dipakai form & import; satu jabatan bisa punya banyak pos (mis. tiga "Assisten Bor" di bawah operator
// berbeda). Pos menyimpan atasan (garis tegas), atasan fungsional (garis putus-putus) & jumlah slot.

export const ORG_POST_HEADCOUNT_MAX = 50;

export const orgPostCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, "2–40 huruf besar, angka, atau tanda hubung.");

export const orgPostInputSchema = z
  .object({
    /** Kode stabil opsional (mis. "ACP-KTT") untuk mencocokkan data dari file. */
    code: orgPostCodeSchema.nullable().optional(),
    positionId: z.uuid("Pilih jabatan."),
    reportsToId: z.uuid().nullable().optional(),
    functionalReportsToId: z.uuid().nullable().optional(),
    headcount: z
      .number("Jumlah slot harus berupa angka.")
      .int("Jumlah slot bilangan bulat.")
      .min(1, `Jumlah slot 1–${ORG_POST_HEADCOUNT_MAX}.`)
      .max(ORG_POST_HEADCOUNT_MAX, `Jumlah slot 1–${ORG_POST_HEADCOUNT_MAX}.`)
      .default(1),
    /** Urutan kiri → kanan di antara pos bersaudara. */
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .refine(
    (value) =>
      !value.reportsToId ||
      !value.functionalReportsToId ||
      value.reportsToId !== value.functionalReportsToId,
    {
      message: "Atasan fungsional tidak boleh sama dengan atasan langsung.",
      path: ["functionalReportsToId"],
    },
  );
export type OrgPostInput = z.infer<typeof orgPostInputSchema>;

/** PATCH: semua field opsional; aturan atasan ≠ atasan fungsional dicek ulang setelah digabung. */
export const orgPostUpdateSchema = z.object({
  code: orgPostCodeSchema.nullable().optional(),
  positionId: z.uuid().optional(),
  reportsToId: z.uuid().nullable().optional(),
  functionalReportsToId: z.uuid().nullable().optional(),
  headcount: z.number().int().min(1).max(ORG_POST_HEADCOUNT_MAX).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export type OrgPostUpdate = z.infer<typeof orgPostUpdateSchema>;

interface PostLink {
  id: string;
  reportsToId: string | null;
}

const MAX_DEPTH = 200;

/** True bila menjadikan `newParentId` atasan `postId` membuat struktur melingkar. */
export function wouldCreatePostCycle(
  posts: readonly PostLink[],
  postId: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false;
  const parentOf = new Map(posts.map((post) => [post.id, post.reportsToId]));
  let cursor: string | null = newParentId;
  for (let depth = 0; cursor && depth < MAX_DEPTH; depth += 1) {
    if (cursor === postId) return true;
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

export type ReportLine = "solid" | "functional";

/**
 * D-052: pos milik PT lewat unitnya; unit tanpa PT = fungsi korporat grup (`companyId: null`).
 * Garis tegas hanya di dalam PT yang sama (korporat ke korporat); garis putus-putus juga boleh ke
 * fungsi korporat (mis. HR Manager PT → HC Senior Manager grup).
 */
export function canReportTo(
  child: { companyId: string | null },
  parent: { companyId: string | null },
  line: ReportLine,
): boolean {
  if (child.companyId === parent.companyId) return true;
  return line === "functional" && parent.companyId === null;
}

/**
 * D-053: atasan langsung otomatis untuk setiap pemegang pos = pemegang pos atasan terdekat (naik terus
 * melewati pos kosong) yang boleh menjadi atasan (PLAN §4.1: akun MANAGER/SUPER_ADMIN aktif). Pos
 * berisi banyak orang → pemegang pertama sesuai urutan `holders`.
 */
export function resolvePostManagers(input: {
  posts: readonly PostLink[];
  holders: readonly { employeeId: string; postId: string }[];
  eligibleManagers: ReadonlySet<string>;
}): Map<string, string | null> {
  const parentOf = new Map(input.posts.map((post) => [post.id, post.reportsToId]));
  const holdersOf = new Map<string, string[]>();
  for (const holder of input.holders) {
    const list = holdersOf.get(holder.postId) ?? [];
    list.push(holder.employeeId);
    holdersOf.set(holder.postId, list);
  }
  const result = new Map<string, string | null>();
  for (const holder of input.holders) {
    let manager: string | null = null;
    let cursor = parentOf.get(holder.postId) ?? null;
    for (let depth = 0; cursor && depth < MAX_DEPTH && cursor !== holder.postId; depth += 1) {
      const found = (holdersOf.get(cursor) ?? []).find(
        (id) => id !== holder.employeeId && input.eligibleManagers.has(id),
      );
      if (found) {
        manager = found;
        break;
      }
      cursor = parentOf.get(cursor) ?? null;
    }
    result.set(holder.employeeId, manager);
  }
  return result;
}
