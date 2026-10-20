import {
  AGE_BUCKET_LABELS,
  AGE_BUCKETS,
  ASSET_STATUS_LABELS,
  ASSET_STATUSES,
  type AssetStatus,
  averageDays,
  DATA_CHANGE_SECTION_LABELS,
  DATA_CHANGE_SECTIONS,
  DATA_CHANGE_STATUS_LABELS,
  DATA_CHANGE_STATUSES,
  daysUntil,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  fullYears,
  GENDER_LABELS,
  GENDERS,
  headcountQuerySchema,
  jubileeYears,
  loanState,
  MOVEMENT_KIND_LABELS,
  MOVEMENT_KINDS,
  type MovementKind,
  monthQuerySchema,
  movementKind,
  POSITION_LEVEL_LABELS,
  type ReportKind,
  reportFilterSchema,
  TENURE_BUCKET_LABELS,
  TENURE_BUCKETS,
  tenureBucket,
  type XlsxSheet,
} from "@hris/shared";
import { ForbiddenError } from "../../core/errors.ts";
import { listAssetsForReport, listUnreturnedPpeForReport } from "../asset/index.ts";
import {
  listBirthdaysInMonth,
  listDataChangeFacts,
  listDemographicFacts,
  listMovements,
  type ReportEmployee,
} from "../employee/index.ts";
import type { MasterLookup } from "../organization/index.ts";
import * as policy from "./report.policy.ts";
import {
  d,
  dmy,
  group,
  MONTH_NAMES,
  NO_MATCH,
  PERSON_FORMATS,
  PERSON_HEADERS,
  parse,
  people,
  person,
  personDto,
  type RequestContext,
  scopedEmployees,
  share,
  todayInJakarta,
  unitOf,
} from "./report-common.ts";

// ARS-D21 (Laporan batch 2): masa kerja, demografi, mutasi & promosi, ulang tahun, aset, pengajuan
// perubahan data. Sumber data lewat index.ts modul pemilik; demografi agregat saja; aset tanpa harga;
// daftar pengajuan hanya SA / grant `employee.changes.review`.

const BATCH2_KINDS = [
  "tenure",
  "demographics",
  "movements",
  "birthdays",
  "assets",
  "data-changes",
] as const;
type Batch2Kind = (typeof BATCH2_KINDS)[number];
export const isBatch2Kind = (kind: ReportKind): kind is Batch2Kind =>
  (BATCH2_KINDS as readonly string[]).includes(kind);

const UNKNOWN = "Belum diisi";
const countBy = <K extends string>(keys: readonly K[], values: readonly (K | null)[]) =>
  Object.fromEntries(keys.map((k) => [k, values.filter((v) => v === k).length])) as Record<
    K,
    number
  >;

// --- (5) Masa kerja ---

export async function tenureReport(ctx: RequestContext, raw: unknown, now = new Date()) {
  const query = parse(monthQuerySchema, raw);
  const { employees, lookup } = await scopedEmployees(ctx, raw);
  const today = todayInJakarta(now);
  const active = employees.filter((e) => e.isActive);
  const bucketOf = (e: ReportEmployee) => tenureBucket(e.joinDate, today);
  const breakdown = (key: (e: ReportEmployee) => string, label: (k: string) => string) =>
    [...group(active, key).entries()]
      .map(([k, rows]) => ({
        label: label(k),
        ...countBy(TENURE_BUCKETS, rows.map(bucketOf)),
        total: rows.length,
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  const totalYears = active.reduce((s, e) => s + fullYears(e.joinDate, today), 0);
  return {
    asOf: today,
    year: query.year,
    month: query.month,
    total: active.length,
    averageYears: active.length > 0 ? Math.round((totalYears / active.length) * 10) / 10 : 0,
    buckets: TENURE_BUCKETS.map((b) => ({
      key: b,
      label: TENURE_BUCKET_LABELS[b],
      count: active.filter((e) => bucketOf(e) === b).length,
    })),
    byCompany: breakdown(
      (e) => e.companyId,
      (k) => lookup.companies.get(k)?.code ?? k,
    ),
    byUnit: breakdown(
      (e) => unitOf(lookup, e) ?? "-",
      (k) => (k === "-" ? "Tanpa unit" : k),
    ),
    jubilees: active
      .map((e) => ({ e, years: jubileeYears(e.joinDate, query.year, query.month) }))
      .filter((x): x is { e: ReportEmployee; years: number } => x.years !== null)
      .map(({ e, years }) => ({ ...personDto(lookup, e), joinDate: e.joinDate, years }))
      .sort((a, b) => b.years - a.years || a.joinDate.slice(5).localeCompare(b.joinDate.slice(5))),
  };
}

// --- (6) Demografi (agregat saja) ---

export async function demographicsReport(ctx: RequestContext, raw: unknown, now = new Date()) {
  const { employees } = await scopedEmployees(ctx, raw);
  const today = todayInJakarta(now);
  const active = employees.filter((e) => e.isActive);
  const facts = await listDemographicFacts(
    active.map((e) => e.id),
    today,
  );
  const slice = <K extends string>(
    keys: readonly K[],
    labels: Record<K, string>,
    values: (K | null)[],
  ) => [
    ...keys.map((k) => ({
      key: k as string,
      label: labels[k],
      count: values.filter((v) => v === k).length,
    })),
    { key: "-", label: UNKNOWN, count: values.filter((v) => v === null).length },
  ];
  const cities = [...group(facts, (f) => f.originCity ?? "-").entries()]
    .filter(([k]) => k !== "-")
    .map(([k, rows]) => ({ label: k, count: rows.length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const TOP = 15;
  const otherCities = cities.slice(TOP).reduce((s, c) => s + c.count, 0);
  return {
    asOf: today,
    total: active.length,
    age: slice(
      AGE_BUCKETS,
      AGE_BUCKET_LABELS,
      facts.map((f) => f.ageBucket),
    ),
    gender: slice(
      GENDERS,
      GENDER_LABELS,
      facts.map((f) => f.gender),
    ),
    education: slice(
      EDUCATION_LEVELS,
      EDUCATION_LEVEL_LABELS,
      facts.map((f) => f.education),
    ).filter((x) => x.count > 0 || x.key === "-"),
    originCity: [
      ...cities.slice(0, TOP),
      ...(otherCities > 0
        ? [{ label: `Kota lain (${cities.length - TOP})`, count: otherCities }]
        : []),
      { label: UNKNOWN, count: facts.filter((f) => f.originCity === null).length },
    ],
    cityCount: cities.length,
  };
}

// --- (7) Mutasi & promosi ---

const levelOf = (lookup: MasterLookup, positionId: string | null) =>
  positionId ? (lookup.positions.get(positionId)?.level ?? null) : null;
const unitOfPosition = (lookup: MasterLookup, positionId: string | null) => {
  const departmentId = positionId ? lookup.positions.get(positionId)?.departmentId : null;
  return departmentId ? (lookup.departments.get(departmentId)?.name ?? null) : null;
};

export async function movementsReport(ctx: RequestContext, raw: unknown, now = new Date()) {
  const query = parse(headcountQuerySchema, raw);
  const { employees, lookup } = await scopedEmployees(ctx, raw);
  const today = todayInJakarta(now);
  const yearEnd = `${query.year}-12-31` < today ? `${query.year}-12-31` : today;
  const byId = new Map(employees.map((e) => [e.id, e]));
  const histories = await listMovements(
    employees.map((e) => e.id),
    `${query.year}-01-01`,
    yearEnd,
  );
  // Pindah PT + jabatan pada hari yang sama tercatat dua baris riwayat → satu perpindahan.
  const companyMoves = new Map(
    histories
      .filter((h) => h.changeType === "COMPANY_CHANGED")
      .map((h) => [`${h.employeeId}:${h.effectiveDate}`, h]),
  );
  const used = new Set<string>();
  const moves = histories.flatMap((h) => {
    const key = `${h.employeeId}:${h.effectiveDate}`;
    if (h.changeType === "COMPANY_CHANGED") return [];
    const company = companyMoves.get(key);
    if (company) used.add(key);
    return [{ h, company: company ?? null }];
  });
  for (const [key, h] of companyMoves) {
    if (!used.has(key)) moves.push({ h, company: h });
  }
  const rows = moves
    .map(({ h, company }) => {
      const e = byId.get(h.employeeId) as ReportEmployee;
      const fromLevel = levelOf(lookup, h.fromPositionId);
      const toLevel = levelOf(lookup, h.toPositionId);
      // Hanya pindah PT (jabatan tetap) = mutasi antar-PT.
      const kind: MovementKind =
        h.changeType === "COMPANY_CHANGED" ? "TRANSFER" : movementKind(fromLevel, toLevel);
      const positionName = (id: string | null) =>
        id ? (lookup.positions.get(id)?.name ?? null) : null;
      const companyCode = (id: string | null) =>
        id ? (lookup.companies.get(id)?.code ?? null) : null;
      return {
        ...personDto(lookup, e),
        /** Id baris riwayat (kunci daftar). */
        historyId: h.id,
        effectiveDate: h.effectiveDate,
        kind,
        fromPosition: positionName(h.fromPositionId),
        toPosition: positionName(h.toPositionId),
        fromLevel: fromLevel ? POSITION_LEVEL_LABELS[fromLevel] : null,
        toLevel: toLevel ? POSITION_LEVEL_LABELS[toLevel] : null,
        fromUnit: unitOfPosition(lookup, h.fromPositionId),
        toUnit: unitOfPosition(lookup, h.toPositionId),
        fromCompany: companyCode(company?.fromCompanyId ?? null),
        toCompany: companyCode(company?.toCompanyId ?? null),
      };
    })
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return {
    year: query.year,
    asOf: yearEnd,
    total: rows.length,
    counts: countBy(
      MOVEMENT_KINDS,
      rows.map((r) => r.kind),
    ),
    byMonth: Array.from({ length: 12 }, (_, i) => {
      const prefix = `${query.year}-${String(i + 1).padStart(2, "0")}`;
      return {
        month: i + 1,
        ...countBy(
          MOVEMENT_KINDS,
          rows.filter((r) => r.effectiveDate.startsWith(prefix)).map((r) => r.kind),
        ),
      };
    }),
    rows,
  };
}

// --- (8) Ulang tahun ---

export async function birthdaysReport(ctx: RequestContext, raw: unknown, now = new Date()) {
  const query = parse(monthQuerySchema, raw);
  const { employees, lookup } = await scopedEmployees(ctx, raw);
  const active = employees.filter((e) => e.isActive);
  const byId = new Map(active.map((e) => [e.id, e]));
  const birthdays = await listBirthdaysInMonth(
    active.map((e) => e.id),
    query.month,
  );
  return {
    asOf: todayInJakarta(now),
    year: query.year,
    month: query.month,
    total: birthdays.length,
    rows: birthdays
      .map((b) => ({
        ...personDto(lookup, byId.get(b.employeeId) as ReportEmployee),
        /** Hari dalam bulan (1–31); tanpa tahun lahir/usia (ARS-D21). */
        day: Number(b.monthDay.slice(3)),
      }))
      .sort((a, b) => a.day - b.day || a.fullName.localeCompare(b.fullName)),
  };
}

// --- (9) Aset ---

export async function assetsReport(ctx: RequestContext, raw: unknown, now = new Date()) {
  const filter = parse(reportFilterSchema, raw);
  const { employees, lookup } = await scopedEmployees(ctx, raw);
  const today = todayInJakarta(now);
  const scope = policy.reportCompanyScope(ctx.actor);
  let companyIds: string[] | null = scope;
  if (filter.companyId) {
    companyIds = scope && !scope.includes(filter.companyId) ? [NO_MATCH] : [filter.companyId];
  }
  if (companyIds && companyIds.length === 0) companyIds = [NO_MATCH];
  const assets = await listAssetsForReport({ companyIds, workLocationId: filter.workLocationId });
  const byId = new Map(employees.map((e) => [e.id, e]));
  const leavers = employees.filter((e) => !e.isActive);
  const ppe = await listUnreturnedPpeForReport(leavers.map((e) => e.id));
  const statusRow = (label: string, rows: typeof assets) => ({
    label,
    ...countBy(
      ASSET_STATUSES,
      rows.map((a) => a.status),
    ),
    total: rows.length,
  });
  const breakdown = (key: (a: (typeof assets)[number]) => string, label: (k: string) => string) =>
    [...group(assets, key).entries()]
      .map(([k, rows]) => statusRow(label(k), rows))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  const unreturnedAssets = assets.flatMap((a) => {
    const e = a.holder ? byId.get(a.holder.employeeId) : undefined;
    if (!a.holder || !e || e.isActive) return [];
    return [
      {
        ...personDto(lookup, e),
        endDate: e.endDate,
        kind: "Aset" as const,
        item: `${a.name} (${a.code})`,
        quantity: 1,
        since: a.holder.assignedAt,
      },
    ];
  });
  const unreturnedPpe = ppe.map((p) => {
    const e = byId.get(p.employeeId) as ReportEmployee;
    return {
      ...personDto(lookup, e),
      endDate: e.endDate,
      kind: "APD" as const,
      item: p.ppeType,
      quantity: p.quantity,
      since: p.issuedAt,
    };
  });
  const counts = countBy(
    ASSET_STATUSES,
    assets.map((a) => a.status),
  ) as Record<AssetStatus, number>;
  return {
    asOf: today,
    total: assets.length,
    counts,
    overdueLoans: assets.filter(
      (a) => a.holder && loanState(a.holder.dueBackAt, today) === "OVERDUE",
    ).length,
    byCategory: breakdown(
      (a) => a.category,
      (k) => k,
    ),
    byLocation: breakdown(
      (a) => a.workLocationId ?? "-",
      (k) => (k === "-" ? "Tanpa lokasi" : (lookup.locations.get(k)?.name ?? k)),
    ),
    byCompany: breakdown(
      (a) => a.companyId,
      (k) => lookup.companies.get(k)?.code ?? k,
    ),
    unreturned: [...unreturnedAssets, ...unreturnedPpe].sort(
      (a, b) =>
        (a.endDate ?? "").localeCompare(b.endDate ?? "") || a.fullName.localeCompare(b.fullName),
    ),
  };
}

// --- (10) Pengajuan perubahan data ---

export async function dataChangesReport(ctx: RequestContext, raw: unknown, now = new Date()) {
  const query = parse(headcountQuerySchema, raw);
  const { employees, lookup } = await scopedEmployees(ctx, raw);
  const today = todayInJakarta(now);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const all = await listDataChangeFacts(
    employees.map((e) => e.id),
    "2000-01-01",
  );
  const year = String(query.year);
  // Tahun/bulan/umur menurut tanggal WIB (createdAt/reviewedAt = waktu UTC).
  const day = (iso: string) => todayInJakarta(new Date(iso));
  const inYear = all.filter((r) => day(r.createdAt).startsWith(year));
  const pending = all.filter((r) => r.status === "PENDING");
  const decided = inYear.filter(
    (r) => (r.status === "APPROVED" || r.status === "REJECTED") && r.reviewedAt,
  );
  const ageDays = (iso: string) => -daysUntil(day(iso), today);
  const canList = policy.canListDataChanges(ctx.actor);
  // Daftar: pengajuan tahun terpilih + yang masih menunggu dari tahun sebelumnya.
  const listed = [...new Map([...inYear, ...pending].map((r) => [r.id, r])).values()];
  return {
    year: query.year,
    asOf: today,
    total: inYear.length,
    counts: countBy(
      DATA_CHANGE_STATUSES,
      inYear.map((r) => r.status),
    ),
    pendingNow: pending.length,
    oldestPendingDays:
      pending.length > 0 ? Math.max(...pending.map((r) => ageDays(r.createdAt))) : null,
    averageDays: averageDays(
      decided.map((r) => ({ from: r.createdAt, to: r.reviewedAt as string })),
    ),
    bySection: DATA_CHANGE_SECTIONS.map((s) => {
      const rows = inYear.filter((r) => r.section === s);
      return {
        key: s,
        label: DATA_CHANGE_SECTION_LABELS[s],
        ...countBy(
          DATA_CHANGE_STATUSES,
          rows.map((r) => r.status),
        ),
        total: rows.length,
        averageDays: averageDays(
          decided
            .filter((r) => r.section === s)
            .map((r) => ({ from: r.createdAt, to: r.reviewedAt as string })),
        ),
      };
    }).filter((s) => s.total > 0),
    byMonth: Array.from({ length: 12 }, (_, i) => {
      const prefix = `${year}-${String(i + 1).padStart(2, "0")}`;
      return {
        month: i + 1,
        submitted: inYear.filter((r) => day(r.createdAt).startsWith(prefix)).length,
        decided: decided.filter((r) => day(r.reviewedAt as string).startsWith(prefix)).length,
      };
    }),
    canList,
    rows: canList
      ? listed
          .map((r) => ({
            ...personDto(lookup, byId.get(r.employeeId) as ReportEmployee),
            requestId: r.id,
            section: DATA_CHANGE_SECTION_LABELS[r.section],
            status: r.status,
            submittedAt: r.createdAt,
            reviewedAt: r.reviewedAt,
            days:
              r.reviewedAt !== null
                ? (averageDays([{ from: r.createdAt, to: r.reviewedAt }]) as number)
                : null,
          }))
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      : [],
  };
}

// --- Ekspor batch 2 ---

const jakartaDate = (iso: string) => d(todayInJakarta(new Date(iso)));
const NOTE_CURRENT =
  "Rincian per unit memakai unit karyawan saat ini (ARS-D18); karyawan aktif per tanggal data.";

export async function sheetsForBatch2(
  ctx: RequestContext,
  kind: Batch2Kind,
  raw: unknown,
  sheet: (s: XlsxSheet) => XlsxSheet,
): Promise<XlsxSheet[]> {
  if (kind === "tenure") {
    const r = await tenureReport(ctx, raw);
    const bucketHeaders = TENURE_BUCKETS.map((b) => TENURE_BUCKET_LABELS[b]);
    const breakdown = (name: string, label: string, rows: typeof r.byCompany) =>
      sheet({
        name,
        title: `Masa kerja ${name.toLowerCase()}`,
        rows: [
          [label, ...bucketHeaders, "Total"],
          ...rows.map((x) => [x.label, ...TENURE_BUCKETS.map((b) => x[b]), x.total]),
          ["Total", ...r.buckets.map((b) => b.count), r.total],
        ],
        formats: ["text", ...TENURE_BUCKETS.map(() => "int" as const), "int"],
        totalRow: true,
      });
    return [
      sheet({
        name: "Ringkasan",
        autoFilter: false,
        title: "Laporan Masa Kerja",
        rows: [
          ["Kelompok masa kerja", "Jumlah karyawan", "Porsi"],
          ...r.buckets.map((b) => [b.label, b.count, share(b.count, r.total)]),
          ["Total", r.total, r.total > 0 ? 100 : 0],
        ],
        formats: ["text", "int", "percent"],
        totalRow: true,
        notes: [
          `Dihitung per ${dmy(r.asOf)} untuk karyawan aktif; rata-rata masa kerja ${r.averageYears.toLocaleString("id-ID")} tahun.`,
          NOTE_CURRENT,
        ],
      }),
      breakdown("Per PT", "PT", r.byCompany),
      breakdown("Per unit", "Unit", r.byUnit),
      people(
        sheet({
          name: "Jubilee",
          title: `Jubilee ${MONTH_NAMES[r.month - 1]} ${r.year}`,
          rows: [
            [...PERSON_HEADERS, "Tanggal masuk", "Genap (tahun)"],
            ...r.jubilees.map((x) => [...person(x), d(x.joinDate), x.years]),
          ],
          formats: [...PERSON_FORMATS, "date", "int"],
          notes: ["Jubilee = genap 5, 10, 15, 20, atau 25 tahun bekerja pada bulan terpilih."],
        }),
      ),
    ];
  }
  if (kind === "demographics") {
    const r = await demographicsReport(ctx, raw);
    const part = (name: string, label: string, rows: { label: string; count: number }[]) =>
      sheet({
        name,
        title: `Demografi — ${name.toLowerCase()}`,
        rows: [
          [label, "Jumlah karyawan", "Porsi"],
          ...rows.map((x) => [x.label, x.count, share(x.count, r.total)]),
          ["Total", r.total, r.total > 0 ? 100 : 0],
        ],
        formats: ["text", "int", "percent"],
        totalRow: true,
      });
    return [
      sheet({
        name: "Ringkasan",
        autoFilter: false,
        title: "Laporan Demografi Karyawan",
        rows: [
          ["Indikator", "Nilai"],
          ["Karyawan aktif", r.total],
          ["Kota asal berbeda", r.cityCount],
        ],
        formats: ["text", "int"],
        notes: [
          `Per ${dmy(r.asOf)}; hanya angka agregat — tanggal lahir & kota asal per orang tidak disertakan (ARS-D21).`,
          "Pendidikan = jenjang tertinggi yang tercatat.",
        ],
      }),
      part("Usia", "Kelompok usia", r.age),
      part("Gender", "Jenis kelamin", r.gender),
      part("Pendidikan", "Pendidikan tertinggi", r.education),
      part("Kota asal", "Kota asal", r.originCity),
    ];
  }
  if (kind === "movements") {
    const r = await movementsReport(ctx, raw);
    return [
      sheet({
        name: "Ringkasan",
        autoFilter: false,
        title: `Laporan Mutasi & Promosi ${r.year}`,
        rows: [
          ["Jenis perpindahan", "Jumlah", "Porsi"],
          ...MOVEMENT_KINDS.map((k) => [
            MOVEMENT_KIND_LABELS[k],
            r.counts[k],
            share(r.counts[k], r.total),
          ]),
          ["Total", r.total, r.total > 0 ? 100 : 0],
        ],
        formats: ["text", "int", "percent"],
        totalRow: true,
        notes: [
          "Promosi = level jabatan naik, Demosi = turun, Mutasi = level sama (termasuk pindah PT tanpa ganti jabatan); level kosong = belum bisa dibedakan.",
        ],
      }),
      sheet({
        name: "Per bulan",
        title: `Perpindahan per bulan — ${r.year}`,
        rows: [
          ["Bulan", ...MOVEMENT_KINDS.map((k) => MOVEMENT_KIND_LABELS[k]), "Total"],
          ...r.byMonth.map((m) => {
            const counts = MOVEMENT_KINDS.map((k) => m[k]);
            return [MONTH_NAMES[m.month - 1], ...counts, counts.reduce((t, n) => t + n, 0)];
          }),
          ["Setahun", ...MOVEMENT_KINDS.map((k) => r.counts[k]), r.total],
        ],
        formats: ["text", ...MOVEMENT_KINDS.map(() => "int" as const), "int"],
        totalRow: true,
      }),
      people(
        sheet({
          name: "Daftar perpindahan",
          title: `Daftar mutasi & promosi — ${r.year}`,
          rows: [
            [
              ...PERSON_HEADERS,
              "Tanggal",
              "Jenis",
              "Jabatan lama",
              "Level lama",
              "Unit lama",
              "Jabatan baru",
              "Level baru",
              "Unit baru",
              "PT lama",
              "PT baru",
            ],
            ...r.rows.map((x) => [
              ...person(x),
              d(x.effectiveDate),
              MOVEMENT_KIND_LABELS[x.kind],
              x.fromPosition,
              x.fromLevel,
              x.fromUnit,
              x.toPosition,
              x.toLevel,
              x.toUnit,
              x.fromCompany,
              x.toCompany,
            ]),
          ],
          formats: [
            ...PERSON_FORMATS,
            "date",
            "text",
            "text",
            "text",
            "text",
            "text",
            "text",
            "text",
            "text",
            "text",
          ],
          notes: [
            "Kolom PT, Unit, Jabatan di kiri = data karyawan saat ini.",
            "Hanya karyawan yang saat ini ada di PT/unit terpilih; yang sudah pindah ke PT lain tidak tampil di laporan PT asalnya.",
          ],
        }),
      ),
    ];
  }
  if (kind === "birthdays") {
    const r = await birthdaysReport(ctx, raw);
    return [
      people(
        sheet({
          name: "Ulang tahun",
          title: `Ulang tahun karyawan — ${MONTH_NAMES[r.month - 1]}`,
          rows: [
            [...PERSON_HEADERS, "Tanggal"],
            ...r.rows.map((x) => [...person(x), `${x.day} ${MONTH_NAMES[r.month - 1]}`]),
          ],
          formats: [...PERSON_FORMATS, "text"],
          notes: ["Hanya tanggal & bulan; tahun lahir dan usia tidak disertakan (ARS-D21)."],
        }),
      ),
    ];
  }
  if (kind === "assets") {
    const r = await assetsReport(ctx, raw);
    const statusHeaders = ASSET_STATUSES.map((s) => ASSET_STATUS_LABELS[s]);
    const breakdown = (name: string, label: string, rows: typeof r.byCategory) =>
      sheet({
        name,
        title: `Aset ${name.toLowerCase()}`,
        rows: [
          [label, ...statusHeaders, "Total"],
          ...rows.map((x) => [x.label, ...ASSET_STATUSES.map((s) => x[s]), x.total]),
          ["Total", ...ASSET_STATUSES.map((s) => r.counts[s]), r.total],
        ],
        formats: ["text", ...ASSET_STATUSES.map(() => "int" as const), "int"],
        totalRow: true,
      });
    return [
      sheet({
        name: "Ringkasan",
        autoFilter: false,
        title: "Laporan Aset",
        rows: [
          ["Status aset", "Jumlah", "Porsi"],
          ...ASSET_STATUSES.map((s) => [
            ASSET_STATUS_LABELS[s],
            r.counts[s],
            share(r.counts[s], r.total),
          ]),
          ["Total", r.total, r.total > 0 ? 100 : 0],
        ],
        formats: ["text", "int", "percent"],
        totalRow: true,
        notes: [
          `Per ${dmy(r.asOf)}; pinjaman lewat tanggal kembali: ${r.overdueLoans}. Harga beli tidak disertakan (ARS-D3).`,
          "Filter unit hanya berlaku untuk daftar belum kembali (aset tidak terikat unit).",
        ],
      }),
      breakdown("Per kategori", "Kategori", r.byCategory),
      breakdown("Per lokasi", "Lokasi", r.byLocation),
      breakdown("Per PT", "PT", r.byCompany),
      people(
        sheet({
          name: "Belum kembali",
          title: "Aset & APD wajib kembali milik karyawan keluar",
          rows: [
            [...PERSON_HEADERS, "Tanggal keluar", "Jenis", "Barang", "Jumlah", "Diterima sejak"],
            ...r.unreturned.map((x) => [
              ...person(x),
              d(x.endDate),
              x.kind,
              x.item,
              x.quantity,
              d(x.since),
            ]),
          ],
          formats: [...PERSON_FORMATS, "date", "text", "text", "int", "date"],
        }),
      ),
    ];
  }
  const r = await dataChangesReport(ctx, raw);
  if (!r.canList) {
    throw new ForbiddenError("Ekspor daftar pengajuan butuh izin pemeriksa pengajuan data.");
  }
  return [
    sheet({
      name: "Ringkasan",
      autoFilter: false,
      title: `Laporan Pengajuan Perubahan Data ${r.year}`,
      rows: [
        ["Indikator", "Nilai"],
        ["Pengajuan tahun ini", r.total],
        ...DATA_CHANGE_STATUSES.map((s) => [DATA_CHANGE_STATUS_LABELS[s], r.counts[s]]),
        ["Menunggu saat ini (semua tahun)", r.pendingNow],
        ["Menunggu paling lama (hari)", r.oldestPendingDays],
        ["Rata-rata waktu proses (hari)", { value: r.averageDays, format: "decimal" }],
      ],
      formats: ["text", "int"],
      notes: ["Waktu proses = diajukan → disetujui/ditolak; pengajuan dibatalkan tidak dihitung."],
    }),
    sheet({
      name: "Per bagian",
      title: `Pengajuan per bagian — ${r.year}`,
      rows: [
        [
          "Bagian",
          ...DATA_CHANGE_STATUSES.map((s) => DATA_CHANGE_STATUS_LABELS[s]),
          "Total",
          "Rata-rata proses (hari)",
        ],
        ...r.bySection.map((s) => [
          s.label,
          ...DATA_CHANGE_STATUSES.map((st) => s[st]),
          s.total,
          s.averageDays,
        ]),
      ],
      formats: ["text", "int", "int", "int", "int", "int", "decimal"],
    }),
    sheet({
      name: "Per bulan",
      title: `Pengajuan per bulan — ${r.year}`,
      rows: [
        ["Bulan", "Diajukan", "Diputuskan"],
        ...r.byMonth.map((m) => [MONTH_NAMES[m.month - 1], m.submitted, m.decided]),
      ],
      formats: ["text", "int", "int"],
    }),
    people(
      sheet({
        name: "Daftar pengajuan",
        title: `Daftar pengajuan perubahan data — ${r.year}`,
        rows: [
          [...PERSON_HEADERS, "Bagian", "Status", "Diajukan", "Diputuskan", "Lama proses (hari)"],
          ...r.rows.map((x) => [
            ...person(x),
            x.section,
            DATA_CHANGE_STATUS_LABELS[x.status],
            jakartaDate(x.submittedAt),
            x.reviewedAt ? jakartaDate(x.reviewedAt) : null,
            x.days,
          ]),
        ],
        formats: [...PERSON_FORMATS, "text", "text", "date", "date", "decimal"],
        notes: ["Isi perubahan (nilai lama/baru) tidak disertakan."],
      }),
    ),
  ];
}
