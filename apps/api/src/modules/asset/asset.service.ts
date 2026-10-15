import {
  type AssetCondition,
  type AssetStatus,
  assetCategoryInputSchema,
  assetInputSchema,
  assetStatusInputSchema,
  assignAssetInputSchema,
  attachBastInputSchema,
  type BastKind,
  type LoanState,
  loanState,
  markAssetLostInputSchema,
  nextAssetSequence,
  ppeAttachBastInputSchema,
  ppeIssueInputSchema,
  ppeReplacementDate,
  ppeReturnInputSchema,
  ppeTypeInputSchema,
  returnAssetInputSchema,
  suggestAssetCode,
} from "@hris/shared";
import type { z } from "zod";
import type { Actor, EmployeeTarget } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.ts";
import {
  type EmployeeBrief,
  getEmployeeBriefs,
  getEmployeeDocumentRef,
  listEmployeeBriefs,
} from "../employee/index.ts";
import { getAccountSummaries, getEmployeeAccountStates } from "../iam/index.ts";
import { notify } from "../notification/index.ts";
import { getMasterLookup, type MasterLookup } from "../organization/index.ts";
import * as policy from "./asset.policy.ts";
import * as repo from "./asset.repository.ts";
import { type BastDocumentKind, type BastLine, bastNumber, buildBastPdf } from "./asset-bast.ts";

// ARS-D1–D6 (Arsip gelombang 2a): aset per unit + pembagian APD. Aturan & keputusan:
// docs/features/arsip/README.md#keputusan. Data karyawan hanya lewat employee/index.ts (aturan emas #3).

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

/** Kode jenis dokumen BAST di katalog D-055. */
export const BAST_DOCUMENT_TYPE = "BAST_ASSET";

const JAKARTA_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
export const todayInJakarta = (now = new Date()) => JAKARTA_DATE.format(now);
const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const isoOrNull = (date: Date | null) => (date ? toIso(date) : null);

/** Audit F3: tanggal transaksi (serah, kembali, hilang, APD) tidak boleh melewati hari ini (WIB). */
function notInFuture(iso: string, label: string, now: Date) {
  if (iso > todayInJakarta(now)) throw new BusinessRuleError(`${label} tidak boleh di masa depan.`);
}

function parse<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

const audit = (
  ctx: RequestContext,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    reason?: string | null;
  },
  tx?: repo.AssetTx,
) =>
  writeAudit(
    {
      actorAccountId: ctx.actor.accountId,
      requestId: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
      ...entry,
    },
    tx,
  );

const target = (e: EmployeeBrief): EmployeeTarget => ({
  employeeId: e.id,
  managerId: e.managerId,
  companyId: e.companyId,
});

// --- DTO ---

const holderDto = (e: EmployeeBrief | undefined, id: string) => ({
  employeeId: id,
  fullName: e?.fullName ?? "(karyawan tidak ditemukan)",
  employeeNumber: e?.employeeNumber ?? null,
  companyId: e?.companyId ?? null,
  isActive: e?.isActive ?? false,
});

type AssignmentRow = Awaited<ReturnType<typeof repo.assignmentsOfEmployees>>[number];

function assignmentDto(
  a: Omit<AssignmentRow, "asset"> & { asset?: AssignmentRow["asset"] },
  briefs: Map<string, EmployeeBrief>,
  today: string,
) {
  return {
    id: a.id,
    asset: a.asset
      ? { id: a.asset.id, code: a.asset.code, name: a.asset.name, category: a.asset.category }
      : null,
    employee: holderDto(briefs.get(a.employeeId), a.employeeId),
    assignedAt: toIso(a.assignedAt),
    dueBackAt: isoOrNull(a.dueBackAt),
    loanState: (a.closedAt ? "NONE" : loanState(isoOrNull(a.dueBackAt), today)) as LoanState,
    conditionOut: a.conditionOut,
    closedAt: isoOrNull(a.closedAt),
    outcome: a.outcome,
    conditionIn: a.conditionIn,
    handoverDocumentId: a.handoverDocumentId,
    returnDocumentId: a.returnDocumentId,
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    note: a.note,
    closeNote: a.closeNote,
  };
}

function assetDto(
  ctx: RequestContext,
  a: repo.AssetWithOpen,
  briefs: Map<string, EmployeeBrief>,
  lookup: MasterLookup,
  today: string,
) {
  const open = a.assignments[0] ?? null;
  const company = lookup.companies.get(a.companyId);
  const location = a.workLocationId ? lookup.locations.get(a.workLocationId) : null;
  const seePrice = policy.canSeeAssetPrice(ctx.actor, a.companyId);
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    brand: a.brand,
    model: a.model,
    serialNumber: a.serialNumber,
    category: a.category,
    company: { id: a.companyId, code: company?.code ?? "", name: company?.name ?? "" },
    workLocation: location ? { id: location.id, name: location.name } : null,
    condition: a.condition,
    status: a.status,
    // ARS-D4: harga & tanggal beli hanya untuk pengelola aset PT itu (key ada, nilai null).
    purchaseDate: seePrice ? isoOrNull(a.purchaseDate) : null,
    purchasePrice: seePrice && a.purchasePrice !== null ? a.purchasePrice.toFixed(2) : null,
    canSeePrice: seePrice,
    canManage: policy.canManageAssets(ctx.actor, a.companyId),
    note: a.note,
    holder: open ? holderDto(briefs.get(open.employeeId), open.employeeId) : null,
    assignment: open ? assignmentDto(open, briefs, today) : null,
  };
}

export type ReplacementState = "NONE" | "OK" | "DUE" | "REPLACED";

function ppeDto(
  p: repo.PpeIssueWithType,
  briefs: Map<string, EmployeeBrief>,
  today: string,
  replaced: boolean,
) {
  const issuedAt = toIso(p.issuedAt);
  const due = ppeReplacementDate(issuedAt, p.ppeType.replaceAfterMonths);
  const state: ReplacementState = !due
    ? "NONE"
    : replaced
      ? "REPLACED"
      : due <= today
        ? "DUE"
        : "OK";
  return {
    id: p.id,
    ppeType: {
      id: p.ppeType.id,
      code: p.ppeType.code,
      name: p.ppeType.name,
      mustReturn: p.ppeType.mustReturn,
      replaceAfterMonths: p.ppeType.replaceAfterMonths,
    },
    employee: holderDto(briefs.get(p.employeeId), p.employeeId),
    quantity: p.quantity,
    size: p.size,
    issuedAt,
    replacementDue: due,
    replacementState: state,
    handoverDocumentId: p.handoverDocumentId,
    acknowledgedAt: p.acknowledgedAt?.toISOString() ?? null,
    returnedAt: isoOrNull(p.returnedAt),
    note: p.note,
  };
}

/** Pembagian yang sudah punya pembagian lebih baru sejenis untuk karyawan yang sama = sudah diganti. */
function replacedIds(rows: repo.PpeIssueWithType[]) {
  // Terbaru = tanggal terima terbesar, lalu waktu dibuat (utuh) sebagai pemecah seri (audit F4).
  const latest = new Map<string, { id: string; issued: number; created: number }>();
  for (const r of rows) {
    const key = `${r.employeeId}:${r.ppeTypeId}`;
    const issued = r.issuedAt.getTime();
    const created = r.createdAt.getTime();
    const cur = latest.get(key);
    if (!cur || issued > cur.issued || (issued === cur.issued && created > cur.created)) {
      latest.set(key, { id: r.id, issued, created });
    }
  }
  const keep = new Set([...latest.values()].map((v) => v.id));
  return new Set(rows.filter((r) => !keep.has(r.id)).map((r) => r.id));
}

// --- Master ---

const categoryDto = (c: Awaited<ReturnType<typeof repo.listCategories>>[number]) => ({
  id: c.id,
  code: c.code,
  name: c.name,
  requiresSerial: c.requiresSerial,
  isActive: c.isActive,
});
const ppeTypeDto = (t: Awaited<ReturnType<typeof repo.listPpeTypes>>[number]) => ({
  id: t.id,
  code: t.code,
  name: t.name,
  replaceAfterMonths: t.replaceAfterMonths,
  mustReturn: t.mustReturn,
  isActive: t.isActive,
});

function requireAssetUser(ctx: RequestContext) {
  if (ctx.actor.role === "EMPLOYEE") throw new ForbiddenError();
}

export async function listCategories(ctx: RequestContext) {
  requireAssetUser(ctx);
  return (await repo.listCategories()).map(categoryDto);
}

export async function saveCategory(ctx: RequestContext, id: string | null, raw: unknown) {
  if (!policy.canManageAssetMasters(ctx.actor)) throw new ForbiddenError();
  const input = parse(assetCategoryInputSchema, raw);
  const isActive = (raw as { isActive?: unknown } | null)?.isActive;
  try {
    if (!id) {
      const row = await repo.createCategory(input);
      await audit(ctx, {
        action: "asset.category.create",
        entityType: "asset_category",
        entityId: row.id,
        after: input,
      });
      return categoryDto(row);
    }
    const before = await repo.findCategory(id);
    if (!before) throw new NotFoundError();
    const row = await repo.updateCategory(id, {
      ...input,
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    });
    await audit(ctx, {
      action: "asset.category.update",
      entityType: "asset_category",
      entityId: id,
      before: categoryDto(before),
      after: categoryDto(row),
    });
    return categoryDto(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("Kode atau nama kategori sudah dipakai.");
    throw error;
  }
}

export async function listPpeTypes(ctx: RequestContext) {
  requireAssetUser(ctx);
  return (await repo.listPpeTypes()).map(ppeTypeDto);
}

export async function savePpeType(ctx: RequestContext, id: string | null, raw: unknown) {
  if (!policy.canManageAssetMasters(ctx.actor)) throw new ForbiddenError();
  const input = parse(ppeTypeInputSchema, raw);
  const isActive = (raw as { isActive?: unknown } | null)?.isActive;
  try {
    if (!id) {
      const row = await repo.createPpeType(input);
      await audit(ctx, {
        action: "asset.ppe_type.create",
        entityType: "ppe_type",
        entityId: row.id,
        after: input,
      });
      return ppeTypeDto(row);
    }
    const before = await repo.findPpeType(id);
    if (!before) throw new NotFoundError();
    const row = await repo.updatePpeType(id, {
      ...input,
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    });
    await audit(ctx, {
      action: "asset.ppe_type.update",
      entityType: "ppe_type",
      entityId: id,
      before: ppeTypeDto(before),
      after: ppeTypeDto(row),
    });
    return ppeTypeDto(row);
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError("Kode atau nama jenis APD sudah dipakai.");
    throw error;
  }
}

// --- Cakupan ---

/** Id karyawan dalam cakupan daftar (null = tanpa batas karyawan; [] = tidak ada). */
async function scopedEmployeeIds(
  actor: Actor,
  opts: { isActive?: boolean | null; q?: string | null } = {},
) {
  const scope = policy.assetListScope(actor);
  if (!scope) throw new ForbiddenError();
  if (scope.kind === "all" && !opts.q && opts.isActive == null) return { scope, ids: null };
  const rows = await listEmployeeBriefs({
    companyIds: scope.kind === "companies" ? scope.companyIds : null,
    managerId: scope.kind === "team" ? scope.managerId : null,
    isActive: opts.isActive ?? null,
    q: opts.q ?? null,
  });
  return { scope, ids: rows.map((r) => r.id) };
}

async function briefsFor(ids: string[]) {
  return getEmployeeBriefs(ids);
}

// --- Aset ---

export interface AssetListQuery {
  page: number;
  pageSize: number;
  q?: string | undefined;
  status?: AssetStatus | undefined;
  categoryId?: string | undefined;
  companyId?: string | undefined;
  workLocationId?: string | undefined;
  holderId?: string | undefined;
  overdue?: boolean | undefined;
}

export async function listAssets(ctx: RequestContext, query: AssetListQuery, now = new Date()) {
  const scope = policy.assetListScope(ctx.actor);
  if (!scope) throw new ForbiddenError();
  const today = todayInJakarta(now);
  let companyIds: string[] | null = scope.kind === "companies" ? scope.companyIds : null;
  if (query.companyId) {
    if (companyIds && !companyIds.includes(query.companyId)) companyIds = [];
    else companyIds = [query.companyId];
  }
  let holderIds: string[] | null = null;
  if (scope.kind === "team") {
    holderIds = (await listEmployeeBriefs({ managerId: scope.managerId })).map((e) => e.id);
  }
  if (query.holderId)
    holderIds = holderIds && !holderIds.includes(query.holderId) ? [] : [query.holderId];
  const { rows, total } = await repo.listAssets(
    {
      companyIds,
      holderIds,
      q: query.q?.trim() || null,
      status: query.status ?? null,
      categoryId: query.categoryId ?? null,
      workLocationId: query.workLocationId ?? null,
      overdueBefore: query.overdue ? toDate(today) : null,
    },
    (query.page - 1) * query.pageSize,
    query.pageSize,
  );
  const [briefs, lookup] = await Promise.all([
    briefsFor(rows.flatMap((r) => r.assignments.map((a) => a.employeeId))),
    getMasterLookup(),
  ]);
  return {
    data: rows.map((r) => assetDto(ctx, r, briefs, lookup, today)),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

async function loadAsset(ctx: RequestContext, id: string) {
  const asset = await repo.findAsset(id);
  if (!asset) throw new NotFoundError();
  const open = asset.assignments[0] ?? null;
  const briefs = await briefsFor(open ? [open.employeeId] : []);
  const holder = open ? briefs.get(open.employeeId) : undefined;
  // PROMPT §5: tidak berhak = 404 (keberadaan aset tidak dibocorkan).
  if (!policy.canViewAsset(ctx.actor, asset, holder ? target(holder) : null))
    throw new NotFoundError();
  return { asset, briefs };
}

export async function getAsset(ctx: RequestContext, id: string, now = new Date()) {
  const { asset, briefs } = await loadAsset(ctx, id);
  const today = todayInJakarta(now);
  const history = await repo.assignmentsOfAsset(id);
  const all = await briefsFor(history.map((h) => h.employeeId));
  for (const [k, v] of briefs) all.set(k, v);
  const lookup = await getMasterLookup();
  // SA & HR PT aset melihat seluruh riwayat; MANAGER/karyawan hanya pemegang yang terlihat olehnya.
  const seesAll = policy.canViewAsset(ctx.actor, asset, null);
  const visible = history.filter((h) => {
    const e = all.get(h.employeeId);
    return seesAll || (e ? policy.canViewEmployeeAssets(ctx.actor, target(e)) : false);
  });
  return {
    ...assetDto(ctx, asset, all, lookup, today),
    history: visible.map((h) => assignmentDto(h, all, today)),
  };
}

export async function suggestCode(ctx: RequestContext, companyId: string, categoryId: string) {
  if (!policy.canManageAssets(ctx.actor, companyId)) throw new ForbiddenError();
  const [lookup, category] = await Promise.all([getMasterLookup(), repo.findCategory(categoryId)]);
  const company = lookup.companies.get(companyId);
  if (!company || !category) throw new NotFoundError("Perusahaan atau kategori tidak ditemukan.");
  const prefix = `${company.code}-${category.code}-`;
  const seq = nextAssetSequence(await repo.codesWithPrefix(prefix), company.code, category.code);
  return { code: suggestAssetCode(company.code, category.code, seq) };
}

async function validateAssetInput(input: z.infer<typeof assetInputSchema>) {
  const [lookup, category] = await Promise.all([
    getMasterLookup(),
    repo.findCategory(input.categoryId),
  ]);
  const company = lookup.companies.get(input.companyId);
  if (!company || company.deleted)
    throw new BusinessRuleError("Perusahaan tidak ditemukan atau sudah diarsipkan.");
  if (!category) throw new BusinessRuleError("Kategori aset tidak ditemukan.");
  if (input.workLocationId && !lookup.locations.get(input.workLocationId)) {
    throw new BusinessRuleError("Lokasi kerja tidak ditemukan.");
  }
  if (category.requiresSerial && !input.serialNumber) {
    throw new ValidationError([
      { path: "serialNumber", message: `Kategori ${category.name} wajib nomor seri.` },
    ]);
  }
  return { company, category };
}

const assetData = (input: z.infer<typeof assetInputSchema>) => ({
  categoryId: input.categoryId,
  name: input.name,
  brand: input.brand,
  model: input.model,
  serialNumber: input.serialNumber,
  companyId: input.companyId,
  workLocationId: input.workLocationId,
  condition: input.condition,
  purchaseDate: input.purchaseDate ? toDate(input.purchaseDate) : null,
  purchasePrice: input.purchasePrice,
  note: input.note,
});

const uniqueAssetMessage = "Kode aset atau nomor seri sudah dipakai aset lain.";

export async function createAsset(ctx: RequestContext, raw: unknown, now = new Date()) {
  const input = parse(assetInputSchema, raw);
  if (!policy.canManageAssets(ctx.actor, input.companyId)) throw new ForbiddenError();
  const { company, category } = await validateAssetInput(input);
  if (!category.isActive) throw new BusinessRuleError("Kategori aset sudah tidak aktif.");
  // ARS-D4: kode otomatis bila kosong; tabrakan nomor urut bersamaan dicoba ulang.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await repo.transaction(async (tx) => {
        let code = input.code;
        if (!code) {
          const prefix = `${company.code}-${category.code}-`;
          code = suggestAssetCode(
            company.code,
            category.code,
            nextAssetSequence(await repo.codesWithPrefix(prefix, tx), company.code, category.code),
          );
        }
        const created = await repo.createAsset(tx, { ...assetData(input), code });
        await audit(
          ctx,
          {
            action: "asset.asset.create",
            entityType: "asset",
            entityId: created.id,
            after: { ...input, code },
          },
          tx,
        );
        return created;
      });
      const lookup = await getMasterLookup();
      return assetDto(ctx, row, new Map(), lookup, todayInJakarta(now));
    } catch (error) {
      if (isUniqueViolation(error)) {
        if (!input.code && attempt < 2) continue;
        throw new ConflictError(uniqueAssetMessage);
      }
      throw error;
    }
  }
  throw new ConflictError(uniqueAssetMessage);
}

export async function updateAsset(ctx: RequestContext, id: string, raw: unknown, now = new Date()) {
  const before = await repo.findAsset(id);
  if (!before) throw new NotFoundError();
  if (!policy.canManageAssets(ctx.actor, before.companyId)) {
    if (policy.canViewAsset(ctx.actor, before, null)) throw new ForbiddenError();
    throw new NotFoundError();
  }
  const input = parse(assetInputSchema, raw);
  if (!input.code)
    throw new ValidationError([{ path: "code", message: "Kode aset wajib saat mengubah." }]);
  if (input.companyId !== before.companyId) {
    if (!policy.canManageAssets(ctx.actor, input.companyId)) throw new ForbiddenError();
    if (before.status === "ASSIGNED") {
      throw new BusinessRuleError("Aset yang sedang dipegang tidak bisa dipindah ke PT lain.");
    }
  }
  await validateAssetInput(input);
  try {
    const row = await repo.transaction(async (tx) => {
      const updated = await repo.updateAsset(tx, id, {
        ...assetData(input),
        code: input.code as string,
      });
      await audit(
        ctx,
        {
          action: "asset.asset.update",
          entityType: "asset",
          entityId: id,
          before: {
            code: before.code,
            name: before.name,
            companyId: before.companyId,
            condition: before.condition,
          },
          after: input,
        },
        tx,
      );
      return updated;
    });
    const open = row.assignments[0];
    return assetDto(
      ctx,
      row,
      await briefsFor(open ? [open.employeeId] : []),
      await getMasterLookup(),
      todayInJakarta(now),
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError(uniqueAssetMessage);
    throw error;
  }
}

export async function setAssetStatus(
  ctx: RequestContext,
  id: string,
  raw: unknown,
  now = new Date(),
) {
  const before = await repo.findAsset(id);
  if (!before) throw new NotFoundError();
  if (!policy.canManageAssets(ctx.actor, before.companyId)) throw new ForbiddenError();
  const input = parse(assetStatusInputSchema, raw);
  if (before.status === "ASSIGNED") {
    throw new BusinessRuleError(
      "Aset sedang dipegang karyawan. Kembalikan atau tandai hilang dulu.",
    );
  }
  const row = await repo.transaction(async (tx) => {
    // Audit F2: bisa saja aset baru diserahkan di antara pembacaan & penyimpanan.
    if (!(await repo.setAssetStatusIf(tx, id, null, { status: input.status }))) {
      throw new BusinessRuleError(
        "Aset sedang dipegang karyawan. Kembalikan atau tandai hilang dulu.",
      );
    }
    const updated = await repo.findAsset(id, tx);
    if (!updated) throw new NotFoundError();
    await audit(
      ctx,
      {
        action: "asset.asset.status",
        entityType: "asset",
        entityId: id,
        before: { status: before.status },
        after: { status: input.status },
        reason: input.note,
      },
      tx,
    );
    return updated;
  });
  return assetDto(ctx, row, new Map(), await getMasterLookup(), todayInJakarta(now));
}

async function notifyEmployee(
  employeeId: string,
  input: { type: string; title: string; body: string },
) {
  const [account] = (await getEmployeeAccountStates([employeeId])).filter((a) => a.isActive);
  if (!account) return;
  // PROMPT §3.7: notifikasi tanpa data sensitif (nama aset & tanggal saja).
  await notify({
    recipients: [{ accountId: account.accountId, email: account.email }],
    type: input.type,
    title: input.title,
    body: input.body,
    link: "/ess",
    email: false,
  });
}

export async function assignAsset(
  ctx: RequestContext,
  assetId: string,
  raw: unknown,
  now = new Date(),
) {
  const asset = await repo.findAsset(assetId);
  if (!asset) throw new NotFoundError();
  if (!policy.canManageAssets(ctx.actor, asset.companyId)) throw new ForbiddenError();
  const input = parse(assignAssetInputSchema, raw);
  notInFuture(input.assignedAt, "Tanggal serah", now);
  if (asset.status !== "AVAILABLE") {
    throw new BusinessRuleError("Hanya aset berstatus Tersedia yang bisa diserahkan.");
  }
  const employee = (await briefsFor([input.employeeId])).get(input.employeeId);
  if (!employee?.isActive)
    throw new BusinessRuleError("Karyawan tidak ditemukan atau tidak aktif.");
  if (employee.companyId !== asset.companyId) {
    throw new BusinessRuleError("Aset hanya bisa diserahkan ke karyawan PT pemilik aset.");
  }
  try {
    const created = await repo.transaction(async (tx) => {
      // Audit F2: status Tersedia dikunci di baris aset (bentrok dengan ubah status bersamaan).
      const taken = await repo.setAssetStatusIf(tx, assetId, "AVAILABLE", {
        status: "ASSIGNED",
        condition: input.conditionOut,
      });
      if (!taken)
        throw new BusinessRuleError("Hanya aset berstatus Tersedia yang bisa diserahkan.");
      const assignment = await repo.createAssignment(tx, {
        assetId,
        employeeId: employee.id,
        assignedAt: toDate(input.assignedAt),
        dueBackAt: input.dueBackAt ? toDate(input.dueBackAt) : null,
        conditionOut: input.conditionOut,
        assignedBy: ctx.actor.accountId,
        note: input.note,
      });
      await audit(
        ctx,
        {
          action: "asset.assignment.create",
          entityType: "asset_assignment",
          entityId: assignment.id,
          after: { assetId, code: asset.code, ...input },
        },
        tx,
      );
      return assignment;
    });
    await notifyEmployee(employee.id, {
      type: "asset.assigned",
      title: "Aset diserahkan kepada Anda",
      body: `${asset.name} (${asset.code}). Buka Layanan Mandiri untuk konfirmasi terima.`,
    });
    return assignmentDto(
      { ...created, asset },
      new Map([[employee.id, employee]]),
      todayInJakarta(now),
    );
  } catch (error) {
    // Index unik parsial: satu pemegang aktif per aset.
    if (isUniqueViolation(error)) throw new ConflictError("Aset sedang dipegang karyawan lain.");
    throw error;
  }
}

async function loadOpenAssignment(ctx: RequestContext, id: string) {
  const a = await repo.findAssignment(id);
  if (!a) throw new NotFoundError();
  if (!policy.canManageAssets(ctx.actor, a.asset.companyId)) throw new ForbiddenError();
  if (a.closedAt) throw new BusinessRuleError("Serah-terima ini sudah ditutup.");
  return a;
}

export async function returnAsset(
  ctx: RequestContext,
  assignmentId: string,
  raw: unknown,
  now = new Date(),
) {
  const a = await loadOpenAssignment(ctx, assignmentId);
  const input = parse(returnAssetInputSchema, raw);
  notInFuture(input.returnedAt, "Tanggal kembali", now);
  if (input.returnedAt < toIso(a.assignedAt)) {
    throw new BusinessRuleError("Tanggal kembali tidak boleh sebelum tanggal serah.");
  }
  const status: AssetStatus = input.conditionIn === "DAMAGED" ? "MAINTENANCE" : "AVAILABLE";
  const updated = await repo.transaction(async (tx) => {
    const closed = await repo.closeAssignmentIfOpen(tx, a.id, {
      closedAt: toDate(input.returnedAt),
      outcome: "RETURNED",
      conditionIn: input.conditionIn,
      closedBy: ctx.actor.accountId,
      closeNote: input.note,
    });
    if (!closed) throw new BusinessRuleError("Serah-terima ini sudah ditutup.");
    const row = await repo.findAssignment(a.id, tx);
    if (!row) throw new NotFoundError();
    await repo.updateAsset(tx, a.assetId, {
      status,
      condition: input.conditionIn as AssetCondition,
    });
    await audit(
      ctx,
      {
        action: "asset.assignment.return",
        entityType: "asset_assignment",
        entityId: a.id,
        after: { ...input, assetStatus: status },
      },
      tx,
    );
    return row;
  });
  return assignmentDto(
    { ...updated, asset: a.asset },
    await briefsFor([a.employeeId]),
    todayInJakarta(now),
  );
}

export async function markAssetLost(
  ctx: RequestContext,
  assignmentId: string,
  raw: unknown,
  now = new Date(),
) {
  const a = await loadOpenAssignment(ctx, assignmentId);
  const input = parse(markAssetLostInputSchema, raw);
  notInFuture(input.lostAt, "Tanggal hilang", now);
  if (input.lostAt < toIso(a.assignedAt)) {
    throw new BusinessRuleError("Tanggal hilang tidak boleh sebelum tanggal serah.");
  }
  const updated = await repo.transaction(async (tx) => {
    const closed = await repo.closeAssignmentIfOpen(tx, a.id, {
      closedAt: toDate(input.lostAt),
      outcome: "LOST",
      closedBy: ctx.actor.accountId,
      closeNote: input.note,
    });
    if (!closed) throw new BusinessRuleError("Serah-terima ini sudah ditutup.");
    const row = await repo.findAssignment(a.id, tx);
    if (!row) throw new NotFoundError();
    await repo.updateAsset(tx, a.assetId, { status: "LOST" });
    await audit(
      ctx,
      {
        action: "asset.assignment.lost",
        entityType: "asset_assignment",
        entityId: a.id,
        after: input,
        reason: input.note,
      },
      tx,
    );
    return row;
  });
  return assignmentDto(
    { ...updated, asset: a.asset },
    await briefsFor([a.employeeId]),
    todayInJakarta(now),
  );
}

async function checkBastDocument(documentId: string, employeeId: string) {
  const doc = await getEmployeeDocumentRef(documentId);
  if (!doc || doc.employeeId !== employeeId) {
    throw new BusinessRuleError("Dokumen tidak ditemukan pada karyawan pemegang.");
  }
  if (doc.typeCode !== BAST_DOCUMENT_TYPE) {
    throw new BusinessRuleError("Dokumen harus berjenis Berita Acara Serah Terima aset.");
  }
}

export async function attachAssignmentBast(
  ctx: RequestContext,
  assignmentId: string,
  raw: unknown,
  now = new Date(),
) {
  const a = await repo.findAssignment(assignmentId);
  if (!a) throw new NotFoundError();
  if (!policy.canManageAssets(ctx.actor, a.asset.companyId)) throw new ForbiddenError();
  const input = parse(attachBastInputSchema, raw);
  if (input.kind === "RETURN" && !a.closedAt) {
    throw new BusinessRuleError("BAST pengembalian dilampirkan setelah aset dikembalikan.");
  }
  await checkBastDocument(input.documentId, a.employeeId);
  const field = input.kind === "HANDOVER" ? "handoverDocumentId" : "returnDocumentId";
  const updated = await repo.transaction(async (tx) => {
    const row = await repo.updateAssignment(tx, a.id, { [field]: input.documentId });
    await audit(
      ctx,
      {
        action: "asset.assignment.bast",
        entityType: "asset_assignment",
        entityId: a.id,
        after: input,
      },
      tx,
    );
    return row;
  });
  return assignmentDto(
    { ...updated, asset: a.asset },
    await briefsFor([a.employeeId]),
    todayInJakarta(now),
  );
}

/**
 * Pihak BAST. Audit F1: Pihak Pertama = akun yang MELAKUKAN transaksi (menyerahkan / menerima kembali
 * / membagikan APD), bukan akun yang mengunduh PDF (mis. MANAGER membuka tab Aset bawahannya).
 */
async function bastParties(
  performerAccountId: string,
  employee: EmployeeBrief | undefined,
  lookup: MasterLookup,
) {
  const account = (await getAccountSummaries([performerAccountId])).get(performerAccountId);
  const performer = account?.employeeId
    ? (await briefsFor([account.employeeId])).get(account.employeeId)
    : undefined;
  return {
    manager: performer
      ? {
          name: performer.fullName,
          role: lookup.positions.get(performer.positionId)?.name ?? "Pengelola aset",
        }
      : { name: account?.email ?? "Pengelola aset", role: "Pengelola aset" },
    employee: {
      name: employee?.fullName ?? "-",
      number: employee?.employeeNumber ?? "-",
      role: employee ? (lookup.positions.get(employee.positionId)?.name ?? "-") : "-",
    },
  };
}

export async function assignmentBast(ctx: RequestContext, assignmentId: string, kind: BastKind) {
  const a = await repo.findAssignment(assignmentId);
  if (!a) throw new NotFoundError();
  const employee = (await briefsFor([a.employeeId])).get(a.employeeId);
  const canSee =
    policy.canManageAssets(ctx.actor, a.asset.companyId) ||
    (employee ? policy.canViewEmployeeAssets(ctx.actor, target(employee)) : false);
  if (!canSee) throw new NotFoundError();
  if (kind === "RETURN" && !a.closedAt) throw new BusinessRuleError("Aset belum dikembalikan.");
  const lookup = await getMasterLookup();
  const company = lookup.companies.get(a.asset.companyId);
  const parties = await bastParties(
    kind === "HANDOVER" ? a.assignedBy : (a.closedBy ?? a.assignedBy),
    employee,
    lookup,
  );
  const date = kind === "HANDOVER" ? toIso(a.assignedAt) : toIso(a.closedAt as Date);
  const docKind: BastDocumentKind =
    kind === "HANDOVER" ? "ASSET_HANDOVER" : a.outcome === "LOST" ? "ASSET_LOST" : "ASSET_RETURN";
  const lines: BastLine[] = [
    {
      name: a.asset.name,
      detail: [
        a.asset.code,
        a.asset.brand,
        a.asset.model,
        a.asset.serialNumber ? `SN ${a.asset.serialNumber}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      quantity: "1 unit",
      condition: kind === "HANDOVER" ? a.conditionOut : (a.conditionIn ?? a.conditionOut),
    },
  ];
  const bytes = await buildBastPdf({
    kind: docKind,
    number: bastNumber(docKind, a.asset.code, date, a.id),
    companyName: company?.name ?? "",
    date,
    lines,
    manager: parties.manager,
    employee: parties.employee,
    dueBackAt: kind === "HANDOVER" ? isoOrNull(a.dueBackAt) : null,
    note: kind === "HANDOVER" ? a.note : a.closeNote,
  });
  return {
    fileName: `BAST-${kind === "HANDOVER" ? "serah" : "kembali"}-${a.asset.code}-${date}.pdf`,
    contentBase64: Buffer.from(bytes).toString("base64"),
  };
}

export async function acknowledgeAssignment(
  ctx: RequestContext,
  assignmentId: string,
  now = new Date(),
) {
  const a = await repo.findAssignment(assignmentId);
  if (!a) throw new NotFoundError();
  const employee = (await briefsFor([a.employeeId])).get(a.employeeId);
  if (!employee || !policy.canAcknowledge(ctx.actor, target(employee))) throw new NotFoundError();
  if (a.closedAt) throw new BusinessRuleError("Serah-terima ini sudah ditutup.");
  if (a.acknowledgedAt)
    return assignmentDto(a, new Map([[employee.id, employee]]), todayInJakarta(now));
  const updated = await repo.transaction(async (tx) => {
    // Idempoten & aman bersamaan: hanya baris yang masih menunggu yang diubah + diaudit.
    if (await repo.acknowledgeAssignmentIfPending(tx, a.id, now)) {
      await audit(
        ctx,
        { action: "asset.assignment.acknowledge", entityType: "asset_assignment", entityId: a.id },
        tx,
      );
    }
    const row = await repo.findAssignment(a.id, tx);
    if (!row) throw new NotFoundError();
    if (row.closedAt && !row.acknowledgedAt)
      throw new BusinessRuleError("Serah-terima ini sudah ditutup.");
    return row;
  });
  return assignmentDto(
    { ...updated, asset: a.asset },
    new Map([[employee.id, employee]]),
    todayInJakarta(now),
  );
}

// --- Pegangan per karyawan ---

async function holdingsOf(employee: EmployeeBrief, openOnly: boolean, today: string) {
  const [assignments, ppeAll] = await Promise.all([
    repo.assignmentsOfEmployees([employee.id], openOnly),
    repo.ppeIssuesOfEmployees([employee.id]),
  ]);
  const briefs = new Map([[employee.id, employee]]);
  const replaced = replacedIds(ppeAll);
  const ppe = openOnly ? ppeAll.filter((p) => p.ppeType.mustReturn && !p.returnedAt) : ppeAll;
  return {
    employee: holderDto(employee, employee.id),
    assets: assignments.map((a) => assignmentDto(a, briefs, today)),
    ppe: ppe.map((p) => ppeDto(p, briefs, today, replaced.has(p.id))),
  };
}

export async function employeeHoldings(
  ctx: RequestContext,
  employeeId: string,
  openOnly: boolean,
  now = new Date(),
) {
  const employee = (await briefsFor([employeeId])).get(employeeId);
  if (!employee || !policy.canViewEmployeeAssets(ctx.actor, target(employee)))
    throw new NotFoundError();
  return {
    ...(await holdingsOf(employee, openOnly, todayInJakarta(now))),
    canManage: policy.canManageAssets(ctx.actor, employee.companyId),
  };
}

export async function selfHoldings(ctx: RequestContext, now = new Date()) {
  const id = ctx.actor.employeeId;
  const employee = id ? (await briefsFor([id])).get(id) : undefined;
  if (!employee) return { employee: null, assets: [], ppe: [], canManage: false };
  return { ...(await holdingsOf(employee, false, todayInJakarta(now))), canManage: false };
}

/** ARS-D6: aset & APD wajib kembali yang masih dipegang karyawan yang sudah nonaktif. */
export async function pendingReturns(ctx: RequestContext, now = new Date()) {
  const scope = policy.assetListScope(ctx.actor);
  if (!scope || scope.kind === "team") throw new ForbiddenError();
  const inactive = await listEmployeeBriefs({
    companyIds: scope.kind === "companies" ? scope.companyIds : null,
    isActive: false,
  });
  if (inactive.length === 0) return [];
  const ids = inactive.map((e) => e.id);
  const today = todayInJakarta(now);
  const [assignments, ppe] = await Promise.all([
    repo.assignmentsOfEmployees(ids, true),
    repo.unreturnedMustReturnPpe(ids),
  ]);
  const briefs = new Map(inactive.map((e) => [e.id, e]));
  return inactive
    .map((e) => ({
      employee: holderDto(e, e.id),
      canManage: policy.canManageAssets(ctx.actor, e.companyId),
      assets: assignments
        .filter((a) => a.employeeId === e.id)
        .map((a) => assignmentDto(a, briefs, today)),
      ppe: ppe.filter((p) => p.employeeId === e.id).map((p) => ppeDto(p, briefs, today, false)),
    }))
    .filter((row) => row.assets.length > 0 || row.ppe.length > 0);
}

// --- APD ---

export interface PpeListQuery {
  page: number;
  pageSize: number;
  q?: string | undefined;
  employeeId?: string | undefined;
  ppeTypeId?: string | undefined;
  replacement?: "DUE" | undefined;
}

export async function listPpeIssues(ctx: RequestContext, query: PpeListQuery, now = new Date()) {
  const { ids } = await scopedEmployeeIds(ctx.actor, { q: query.q ?? null });
  let employeeIds = ids;
  if (query.employeeId)
    employeeIds = employeeIds && !employeeIds.includes(query.employeeId) ? [] : [query.employeeId];
  // Organisasi < 200 karyawan (PLAN §1): status "jatuh tempo ganti" dihitung di memori lalu dipaginasi.
  const { rows } = await repo.listPpeIssues(
    { employeeIds, ppeTypeId: query.ppeTypeId ?? null, issuedFrom: null, issuedTo: null },
    0,
    5000,
  );
  const today = todayInJakarta(now);
  // "Sudah diganti" hanya dibandingkan dengan jenis yang sama, jadi filter jenis tidak mengubah hasilnya.
  const replaced = replacedIds(rows);
  const briefs = await briefsFor(rows.map((r) => r.employeeId));
  let items = rows.map((r) => ppeDto(r, briefs, today, replaced.has(r.id)));
  if (query.replacement === "DUE") items = items.filter((i) => i.replacementState === "DUE");
  const start = (query.page - 1) * query.pageSize;
  return {
    data: items.slice(start, start + query.pageSize).map((i) => ({
      ...i,
      canManage: i.employee.companyId
        ? policy.canManageAssets(ctx.actor, i.employee.companyId)
        : false,
    })),
    meta: { page: query.page, pageSize: query.pageSize, total: items.length },
  };
}

export async function createPpeIssue(ctx: RequestContext, raw: unknown, now = new Date()) {
  const input = parse(ppeIssueInputSchema, raw);
  notInFuture(input.issuedAt, "Tanggal terima", now);
  const employee = (await briefsFor([input.employeeId])).get(input.employeeId);
  if (!employee?.isActive)
    throw new BusinessRuleError("Karyawan tidak ditemukan atau tidak aktif.");
  if (!policy.canManageAssets(ctx.actor, employee.companyId)) throw new ForbiddenError();
  const type = await repo.findPpeType(input.ppeTypeId);
  if (!type?.isActive) throw new BusinessRuleError("Jenis APD tidak ditemukan atau tidak aktif.");
  const row = await repo.transaction(async (tx) => {
    const created = await repo.createPpeIssue(tx, {
      ppeTypeId: type.id,
      employeeId: employee.id,
      quantity: input.quantity,
      size: input.size,
      issuedAt: toDate(input.issuedAt),
      issuedBy: ctx.actor.accountId,
      note: input.note,
    });
    await audit(
      ctx,
      {
        action: "asset.ppe_issue.create",
        entityType: "ppe_issue",
        entityId: created.id,
        after: input,
      },
      tx,
    );
    return created;
  });
  await notifyEmployee(employee.id, {
    type: "asset.ppe_issued",
    title: "APD dibagikan kepada Anda",
    body: `${type.name} × ${input.quantity}. Buka Layanan Mandiri untuk konfirmasi terima.`,
  });
  return ppeDto(row, new Map([[employee.id, employee]]), todayInJakarta(now), false);
}

async function loadPpeForManage(ctx: RequestContext, id: string) {
  const p = await repo.findPpeIssue(id);
  if (!p) throw new NotFoundError();
  const employee = (await briefsFor([p.employeeId])).get(p.employeeId);
  if (!employee) throw new NotFoundError();
  if (!policy.canManageAssets(ctx.actor, employee.companyId)) throw new ForbiddenError();
  return { p, employee };
}

export async function returnPpe(ctx: RequestContext, id: string, raw: unknown, now = new Date()) {
  const { p, employee } = await loadPpeForManage(ctx, id);
  const input = parse(ppeReturnInputSchema, raw);
  notInFuture(input.returnedAt, "Tanggal kembali", now);
  if (!p.ppeType.mustReturn)
    throw new BusinessRuleError("Jenis APD ini habis pakai (tidak wajib kembali).");
  if (p.returnedAt) throw new BusinessRuleError("APD ini sudah dikembalikan.");
  if (input.returnedAt < toIso(p.issuedAt))
    throw new BusinessRuleError("Tanggal kembali tidak boleh sebelum tanggal terima.");
  const row = await repo.transaction(async (tx) => {
    const returned = await repo.returnPpeIfOpen(tx, id, {
      returnedAt: toDate(input.returnedAt),
      returnedBy: ctx.actor.accountId,
      ...(input.note ? { note: input.note } : {}),
    });
    if (!returned) throw new BusinessRuleError("APD ini sudah dikembalikan.");
    const updated = await repo.findPpeIssue(id, tx);
    if (!updated) throw new NotFoundError();
    await audit(
      ctx,
      { action: "asset.ppe_issue.return", entityType: "ppe_issue", entityId: id, after: input },
      tx,
    );
    return updated;
  });
  return ppeDto(row, new Map([[employee.id, employee]]), todayInJakarta(now), false);
}

export async function attachPpeBast(
  ctx: RequestContext,
  id: string,
  raw: unknown,
  now = new Date(),
) {
  const { p, employee } = await loadPpeForManage(ctx, id);
  const input = parse(ppeAttachBastInputSchema, raw);
  await checkBastDocument(input.documentId, p.employeeId);
  const row = await repo.transaction(async (tx) => {
    const updated = await repo.updatePpeIssue(tx, id, { handoverDocumentId: input.documentId });
    await audit(
      ctx,
      { action: "asset.ppe_issue.bast", entityType: "ppe_issue", entityId: id, after: input },
      tx,
    );
    return updated;
  });
  return ppeDto(row, new Map([[employee.id, employee]]), todayInJakarta(now), false);
}

export async function deletePpeIssue(ctx: RequestContext, id: string) {
  const { p } = await loadPpeForManage(ctx, id);
  // Koreksi salah input saja: pembagian yang sudah dikonfirmasi / ber-BAST adalah bukti, tidak dihapus.
  if (p.acknowledgedAt || p.handoverDocumentId) {
    throw new BusinessRuleError(
      "Pembagian yang sudah dikonfirmasi atau ber-BAST tidak bisa dihapus.",
    );
  }
  await repo.transaction(async (tx) => {
    if (!(await repo.deletePpeIfUnconfirmed(tx, id))) {
      throw new BusinessRuleError(
        "Pembagian yang sudah dikonfirmasi atau ber-BAST tidak bisa dihapus.",
      );
    }
    await audit(
      ctx,
      {
        action: "asset.ppe_issue.delete",
        entityType: "ppe_issue",
        entityId: id,
        before: {
          employeeId: p.employeeId,
          ppeTypeId: p.ppeTypeId,
          quantity: p.quantity,
          issuedAt: toIso(p.issuedAt),
        },
      },
      tx,
    );
  });
}

export async function ppeBast(ctx: RequestContext, id: string) {
  const p = await repo.findPpeIssue(id);
  if (!p) throw new NotFoundError();
  const employee = (await briefsFor([p.employeeId])).get(p.employeeId);
  if (!employee) throw new NotFoundError();
  const canSee =
    policy.canManageAssets(ctx.actor, employee.companyId) ||
    policy.canViewEmployeeAssets(ctx.actor, target(employee));
  if (!canSee) throw new NotFoundError();
  const lookup = await getMasterLookup();
  const parties = await bastParties(p.issuedBy, employee, lookup);
  const date = toIso(p.issuedAt);
  const bytes = await buildBastPdf({
    kind: "PPE_ISSUE",
    number: bastNumber("PPE_ISSUE", p.ppeType.code, date, p.id),
    companyName: lookup.companies.get(employee.companyId)?.name ?? "",
    date,
    lines: [
      {
        name: p.ppeType.name,
        detail: [
          p.size ? `Ukuran ${p.size}` : null,
          p.ppeType.mustReturn ? "wajib dikembalikan saat keluar" : "habis pakai",
        ]
          .filter(Boolean)
          .join(" · "),
        quantity: `${p.quantity}`,
        condition: "GOOD",
      },
    ],
    manager: parties.manager,
    employee: parties.employee,
    dueBackAt: null,
    note: p.note,
  });
  return {
    fileName: `BAST-APD-${p.ppeType.code}-${date}.pdf`,
    contentBase64: Buffer.from(bytes).toString("base64"),
  };
}

export async function acknowledgePpe(ctx: RequestContext, id: string, now = new Date()) {
  const p = await repo.findPpeIssue(id);
  if (!p) throw new NotFoundError();
  const employee = (await briefsFor([p.employeeId])).get(p.employeeId);
  if (!employee || !policy.canAcknowledge(ctx.actor, target(employee))) throw new NotFoundError();
  if (p.acknowledgedAt)
    return ppeDto(p, new Map([[employee.id, employee]]), todayInJakarta(now), false);
  const row = await repo.transaction(async (tx) => {
    if (await repo.acknowledgePpeIfPending(tx, id, now)) {
      await audit(
        ctx,
        { action: "asset.ppe_issue.acknowledge", entityType: "ppe_issue", entityId: id },
        tx,
      );
    }
    const updated = await repo.findPpeIssue(id, tx);
    if (!updated) throw new NotFoundError();
    return updated;
  });
  return ppeDto(row, new Map([[employee.id, employee]]), todayInJakarta(now), false);
}
