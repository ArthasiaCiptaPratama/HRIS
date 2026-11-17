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
 * ORG-D9 (menggantikan D-053): atasan langsung otomatis setiap pemegang pos = pemegang aktif pos tepat di
 * atasnya (`reportsToId`), apa pun role/akunnya. Pos atas kosong → naik terus ke pos berikutnya. Pos atas
 * berisi lebih dari satu orang → NIK (`employeeNumber`) terkecil (urutan kode karakter; NIK kosong terakhir;
 * tidak bergantung pada urutan masukan). `holders` = pemegang aktif saja (disaring pemanggil).
 */
export function resolvePostManagers(input: {
  posts: readonly PostLink[];
  holders: readonly { employeeId: string; employeeNumber: string | null; postId: string }[];
}): Map<string, string | null> {
  type Holder = { employeeId: string; employeeNumber: string | null };
  const parentOf = new Map(input.posts.map((post) => [post.id, post.reportsToId]));
  const holdersOf = new Map<string, Holder[]>();
  for (const holder of input.holders) {
    const list = holdersOf.get(holder.postId) ?? [];
    list.push(holder);
    holdersOf.set(holder.postId, list);
  }
  // NIK kosong di urutan terakhir; NIK sama → id (tetap deterministik).
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  const byNumber = (a: Holder, b: Holder) => {
    if (a.employeeNumber === null || b.employeeNumber === null) {
      if (a.employeeNumber !== b.employeeNumber) return a.employeeNumber === null ? 1 : -1;
    } else if (a.employeeNumber !== b.employeeNumber) {
      return cmp(a.employeeNumber, b.employeeNumber);
    }
    return cmp(a.employeeId, b.employeeId);
  };
  for (const list of holdersOf.values()) list.sort(byNumber);
  const result = new Map<string, string | null>();
  for (const holder of input.holders) {
    let manager: string | null = null;
    let cursor = parentOf.get(holder.postId) ?? null;
    for (let depth = 0; cursor && depth < MAX_DEPTH && cursor !== holder.postId; depth += 1) {
      const found = (holdersOf.get(cursor) ?? []).find((h) => h.employeeId !== holder.employeeId);
      if (found) {
        manager = found.employeeId;
        break;
      }
      cursor = parentOf.get(cursor) ?? null;
    }
    result.set(holder.employeeId, manager);
  }
  return result;
}

export type OrgZone = "HO" | "SITE";

/**
 * ORG-D5 (menggantikan turunan nama ORG-D4): zona efektif tiap unit (id → HO/SITE). Zona tersimpan di
 * `departments.zone`; kosong = ikut leluhur terdekat yang diisi, akar kosong (atau leluhur tak dikenal) = HO.
 */
export function unitZones(
  units: readonly { id: string; parentId: string | null; zone: "HEAD_OFFICE" | "SITE" | null }[],
): Map<string, OrgZone> {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const result = new Map<string, OrgZone>();
  for (const unit of units) {
    let zone: OrgZone = "HO";
    let cursor: (typeof units)[number] | undefined = unit;
    for (let depth = 0; cursor && depth < MAX_DEPTH; depth += 1) {
      if (cursor.zone) {
        zone = cursor.zone === "SITE" ? "SITE" : "HO";
        break;
      }
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    result.set(unit.id, zone);
  }
  return result;
}
