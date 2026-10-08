import { ROLE } from "@hris/shared";
import { ForbiddenError, NotFoundError } from "../../core/errors.ts";
import { getMasterLookup, listOrgPosts } from "../organization/index.ts";
import * as policy from "./employee.policy.ts";
import { type RequestContext, signPhotoUrls } from "./employee.service.ts";
import * as repository from "./org-chart.repository.ts";
import type { OrgChart, OrgPersonCard } from "./org-chart.schema.ts";

// D-051/D-052: bagan per PT = pos milik unit PT itu + panel fungsi korporat grup (unit tanpa PT).
// Pemegang pos korporat terlihat oleh semua PT (bagian bagan grup, keputusan 2026-10-05); selain itu
// mengikuti direktori D-040.

export async function getOrgChart(
  ctx: RequestContext,
  query: { companyId?: string | undefined },
): Promise<OrgChart> {
  if (!policy.canReadOrgStructure(ctx.actor)) throw new ForbiddenError();
  const allowed = policy.directoryCompanyIds(ctx.actor);
  const lookup = await getMasterLookup();
  const companies = [...lookup.companies.values()]
    .filter((c) => !c.deleted && (allowed === null || allowed.has(c.id)))
    .map(({ id, code, name }) => ({ id, code, name }))
    .sort((a, b) => a.code.localeCompare(b.code));
  if (companies.length === 0) throw new ForbiddenError();
  const requested = query.companyId ?? null;
  if (requested && !companies.some((c) => c.id === requested)) {
    throw new NotFoundError("Perusahaan tidak ditemukan.");
  }
  const ownCompany = ctx.actor.employeeId
    ? (await repository.findCardRow(ctx.actor.employeeId))?.companyId
    : undefined;
  const company =
    companies.find((c) => c.id === requested) ??
    companies.find((c) => c.id === ownCompany) ??
    companies[0];
  if (!company) throw new ForbiddenError();

  const [posts, holders, unplacedCount] = await Promise.all([
    listOrgPosts(),
    repository.listPostHolders(),
    repository.countUnplaced([company.id]),
  ]);
  const included = posts.filter(
    (post) => !post.archived && (post.companyId === company.id || post.companyId === null),
  );
  const ids = new Set(included.map((post) => post.id));
  const visibleHolders = holders.filter(
    (holder) =>
      holder.orgPostId &&
      ids.has(holder.orgPostId) &&
      // Pos PT ini hanya menampilkan karyawan PT ini; pos korporat menampilkan pemegangnya.
      (holder.companyId === company.id ||
        included.find((post) => post.id === holder.orgPostId)?.companyId === null),
  );
  const photos = await signPhotoUrls(
    ctx,
    visibleHolders.map((holder) => holder.photoPath),
  );
  const holdersOf = new Map<string, OrgChart["posts"][number]["holders"]>();
  for (const holder of visibleHolders) {
    const list = holdersOf.get(holder.orgPostId as string) ?? [];
    list.push({
      id: holder.id,
      fullName: holder.fullName,
      photoUrl: holder.photoPath ? (photos.get(holder.photoPath) ?? null) : null,
    });
    holdersOf.set(holder.orgPostId as string, list);
  }
  // Unit yang dipakai pos + leluhurnya (untuk pengelompokan & label).
  const unitIds = new Set<string>();
  for (const post of included) {
    let cursor: string | null = post.departmentId;
    for (let depth = 0; cursor && depth < 50 && !unitIds.has(cursor); depth += 1) {
      unitIds.add(cursor);
      cursor = lookup.departments.get(cursor)?.parentId ?? null;
    }
  }
  return {
    company,
    companies,
    units: [...unitIds].flatMap((id) => {
      const unit = lookup.departments.get(id);
      return unit
        ? [
            {
              id: unit.id,
              name: unit.name,
              unitType: unit.unitType,
              parentId: unit.parentId,
              corporate: unit.companyId === null,
            },
          ]
        : [];
    }),
    posts: included.map((post) => ({
      id: post.id,
      positionName: post.positionName,
      level: post.level,
      departmentId: post.departmentId,
      corporate: post.companyId === null,
      reportsToId: post.reportsToId && ids.has(post.reportsToId) ? post.reportsToId : null,
      functionalReportsToId:
        post.functionalReportsToId && ids.has(post.functionalReportsToId)
          ? post.functionalReportsToId
          : null,
      headcount: post.headcount,
      sortOrder: post.sortOrder,
      holders: holdersOf.get(post.id) ?? [],
    })),
    unplacedCount,
    canOpenDetail: policy.canManageEmployees(ctx.actor),
    canManage: ctx.actor.role === ROLE.SUPER_ADMIN,
  };
}

/** Kartu profil kerja (kolom direktori) untuk orang yang tampil di bagan aktor. */
export async function getPersonCard(ctx: RequestContext, id: string): Promise<OrgPersonCard> {
  if (!policy.canReadOrgStructure(ctx.actor)) throw new ForbiddenError();
  const [row, lookup, posts] = await Promise.all([
    repository.findCardRow(id),
    getMasterLookup(),
    listOrgPosts(),
  ]);
  const notFound = new NotFoundError("Karyawan tidak ditemukan.");
  if (!row?.isActive || row.onboardingStatus !== "APPROVED") throw notFound;
  const allowed = policy.directoryCompanyIds(ctx.actor);
  const corporateHolder =
    row.orgPostId !== null &&
    posts.some((post) => post.id === row.orgPostId && !post.archived && post.companyId === null);
  if (allowed !== null && !allowed.has(row.companyId) && !corporateHolder) throw notFound;
  const position = lookup.positions.get(row.positionId);
  const company = lookup.companies.get(row.companyId);
  const photos = await signPhotoUrls(ctx, [row.photoPath]);
  return {
    id: row.id,
    fullName: row.fullName,
    photoUrl: row.photoPath ? (photos.get(row.photoPath) ?? null) : null,
    position: position?.name ?? "—",
    department: position ? (lookup.departments.get(position.departmentId)?.name ?? null) : null,
    company: { code: company?.code ?? "—", name: company?.name ?? "—" },
    workLocation: row.workLocationId
      ? (lookup.locations.get(row.workLocationId)?.name ?? null)
      : null,
    workEmail: row.workEmail,
  };
}
