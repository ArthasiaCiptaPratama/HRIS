import {
  ARCHIVE_EXPORT_MAX_ROWS,
  buildWorkbook,
  CORE_COMPLETENESS_ITEMS,
  CORE_COMPLETENESS_LABELS,
  completenessPercent,
  daysUntil,
  EXIT_REASON_LABELS,
  EXPIRY_BUCKET_LABELS,
  EXPIRY_BUCKETS,
  type ExpiryBucket,
  expiryBucket,
  headcountQuerySchema,
  monthlyTurnover,
  monthQuerySchema,
  REPORT_LABELS,
  type ReportKind,
  reportFilterSchema,
  WARNING_LEVEL_LABELS,
  WARNING_LEVELS,
  type XlsxSheet,
  yearlyTurnover,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ForbiddenError } from "../../core/errors.ts";
import { listWarningLettersForReport } from "../discipline/index.ts";
import {
  listCompletenessFacts,
  listExpiringDocuments,
  listRequiredDocumentTypes,
  type ReportEmployee,
} from "../employee/index.ts";
import { getMasterLookup } from "../organization/index.ts";
import * as policy from "./report.policy.ts";
import { isBatch2Kind, sheetsForBatch2 } from "./report-batch2.service.ts";
import {
  addDays,
  d,
  dmy,
  group,
  MONTH_NAMES,
  PERSON_FORMATS,
  PERSON_HEADERS,
  parse,
  pct,
  people,
  person,
  personDto,
  type RequestContext,
  scopedEmployees,
  share,
  todayInJakarta,
  unitOf,
} from "./report-common.ts";

export {
  assetsReport,
  birthdaysReport,
  dataChangesReport,
  demographicsReport,
  movementsReport,
  tenureReport,
} from "./report-batch2.service.ts";
export type { RequestContext } from "./report-common.ts";

// ARS-D16/D17 (Arsip gelombang 3, Laporan batch 1): headcount & turnover, dokumen kedaluwarsa,
// kelengkapan data, SP aktif. Agregat dari modul pemilik data lewat index.ts (aturan emas #3); nilai
// sensitif tidak pernah ditampilkan; daftar per orang yang sensitif hanya bila ber-grant (ARS-D16).

// --- (1) Headcount & turnover ---

export async function headcountReport(ctx: RequestContext, raw: unknown, now = new Date()) {
  const query = parse(headcountQuerySchema, raw);
  const { employees, lookup } = await scopedEmployees(ctx, raw);
  const today = todayInJakarta(now);
  const months = monthlyTurnover(employees, query.year, today);
  const year = yearlyTurnover(months);
  const yearEnd = `${query.year}-12-31` < today ? `${query.year}-12-31` : today;
  const inYear = (iso: string | null) =>
    Boolean(iso?.startsWith(String(query.year)) && iso <= yearEnd);
  const activeAt = (e: ReportEmployee) =>
    e.joinDate <= yearEnd && (e.endDate === null || e.endDate >= yearEnd);
  const breakdown = (key: (e: ReportEmployee) => string, label: (k: string) => string) =>
    [...group(employees, key).entries()]
      .map(([k, rows]) => ({
        key: k,
        label: label(k),
        active: rows.filter(activeAt).length,
        joined: rows.filter((e) => inYear(e.joinDate)).length,
        left: rows.filter((e) => inYear(e.endDate)).length,
      }))
      .filter((r) => r.active + r.joined + r.left > 0)
      .sort((a, b) => b.active - a.active || a.label.localeCompare(b.label));
  const leavers = employees.filter((e) => inYear(e.endDate));
  const joiners = employees.filter((e) => inYear(e.joinDate));
  return {
    year: query.year,
    asOf: yearEnd,
    months,
    summary: year,
    byCompany: breakdown(
      (e) => e.companyId,
      (k) => lookup.companies.get(k)?.code ?? k,
    ),
    byUnit: breakdown(
      (e) => unitOf(lookup, e) ?? "-",
      (k) => (k === "-" ? "Tanpa unit" : k),
    ),
    byStatus: breakdown(
      (e) => e.employmentStatusId,
      (k) => lookup.statuses.get(k)?.name ?? k,
    ),
    exitReasons: [...group(leavers, (e) => e.exitReason ?? "-").entries()]
      .map(([k, rows]) => ({
        key: k,
        label:
          k === "-"
            ? "Tanpa alasan"
            : (EXIT_REASON_LABELS[k as keyof typeof EXIT_REASON_LABELS] ?? k),
        count: rows.length,
      }))
      .sort((a, b) => b.count - a.count),
    leavers: leavers.map((e) => ({
      ...personDto(lookup, e),
      endDate: e.endDate as string,
      exitReason: e.exitReason ? EXIT_REASON_LABELS[e.exitReason] : null,
    })),
    joiners: joiners
      .map((e) => ({ ...personDto(lookup, e), joinDate: e.joinDate }))
      .sort((a, b) => a.joinDate.localeCompare(b.joinDate)),
  };
}

// --- (2) Dokumen kedaluwarsa ---

export async function documentExpiryReport(ctx: RequestContext, raw: unknown, now = new Date()) {
  const { employees, lookup } = await scopedEmployees(ctx, raw);
  const today = todayInJakarta(now);
  const active = employees.filter((e) => e.isActive);
  const byId = new Map(active.map((e) => [e.id, e]));
  const docs = (
    await listExpiringDocuments(
      active.map((e) => e.id),
      addDays(today, 90),
    )
  )
    .map((d) => ({ ...d, bucket: expiryBucket(d.expiresAt, today) as ExpiryBucket }))
    .filter((d) => d.bucket !== null);
  const counts = Object.fromEntries(
    EXPIRY_BUCKETS.map((b) => [b, docs.filter((d) => d.bucket === b).length]),
  ) as Record<ExpiryBucket, number>;
  const byType = [...group(docs, (d) => d.documentType.id).values()]
    .map((rows) => ({
      documentType: (rows[0] as (typeof rows)[number]).documentType.name,
      ...(Object.fromEntries(
        EXPIRY_BUCKETS.map((b) => [b, rows.filter((d) => d.bucket === b).length]),
      ) as Record<ExpiryBucket, number>),
      total: rows.length,
    }))
    .sort((a, b) => b.total - a.total);
  const visible = docs.filter(
    (d) =>
      !d.documentType.sensitive || policy.canListSensitiveDocument(ctx.actor, d.documentType.code),
  );
  return {
    asOf: today,
    counts,
    byType,
    hiddenSensitive: docs.length - visible.length,
    rows: visible
      .map((d) => ({
        ...personDto(lookup, byId.get(d.employeeId) as ReportEmployee),
        documentType: d.documentType.name,
        expiresAt: d.expiresAt,
        bucket: d.bucket,
      }))
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)),
  };
}

// --- (3) Kelengkapan data ---

export async function completenessReport(ctx: RequestContext, raw: unknown) {
  const { employees, lookup } = await scopedEmployees(ctx, raw);
  const active = employees.filter((e) => e.isActive);
  const [facts, requiredTypes] = await Promise.all([
    listCompletenessFacts(active.map((e) => e.id)),
    listRequiredDocumentTypes(),
  ]);
  const factsById = new Map(facts.map((f) => [f.employeeId, f]));
  // Lingkup SITE belum bisa ditentukan (belum ada penanda lokasi site) → tidak dihitung (keputusan kecil
  // 2026-10-16, dicatat di README arsip & Backlog).
  const siteTypes = requiredTypes.filter((t) => t.requiredScope === "SITE");
  const checkedTypes = requiredTypes.filter((t) => t.requiredScope !== "SITE");
  const items = [
    ...CORE_COMPLETENESS_ITEMS.map((k) => ({ key: k, label: CORE_COMPLETENESS_LABELS[k] })),
    ...checkedTypes.map((t) => ({ key: `DOC:${t.id}`, label: t.name })),
  ];
  const rows = active.map((e) => {
    const f = factsById.get(e.id);
    const docs = new Set(f?.documentTypeIds ?? []);
    const missing = [
      ...CORE_COMPLETENESS_ITEMS.filter((k) => !f?.core[k]).map((k) => `${k}`),
      ...checkedTypes
        .filter(
          (t) =>
            (t.requiredScope === "ALL" ||
              (t.requiredScope === "POSITIONS" && t.requiredPositionIds.includes(e.positionId))) &&
            !docs.has(t.id),
        )
        .map((t) => `DOC:${t.id}`),
    ];
    return { e, missing };
  });
  const labelOf = new Map(items.map((i) => [i.key, i.label]));
  const complete = rows.filter((r) => r.missing.length === 0).length;
  return {
    total: active.length,
    complete,
    percent: completenessPercent(complete, active.length),
    siteTypesSkipped: siteTypes.map((t) => t.name),
    byItem: items
      .map((i) => ({
        key: i.key,
        label: i.label,
        missing: rows.filter((r) => r.missing.includes(i.key)).length,
      }))
      .filter((i) => i.missing > 0)
      .sort((a, b) => b.missing - a.missing),
    byCompany: [...group(rows, (r) => r.e.companyId).entries()]
      .map(([k, rs]) => {
        const done = rs.filter((r) => r.missing.length === 0).length;
        return {
          label: lookup.companies.get(k)?.code ?? k,
          total: rs.length,
          complete: done,
          percent: completenessPercent(done, rs.length),
        };
      })
      .sort((a, b) => a.percent - b.percent),
    rows: rows
      .filter((r) => r.missing.length > 0)
      .map((r) => ({
        ...personDto(lookup, r.e),
        missing: r.missing.map((k) => labelOf.get(k) ?? k),
        /** Kode item (`NPWP`, `DOC:<id>`) — dipakai web untuk menyaring per item. */
        missingKeys: r.missing,
      }))
      .sort((a, b) => b.missing.length - a.missing.length || a.fullName.localeCompare(b.fullName)),
  };
}

// --- (4) SP aktif ---

export async function warningLettersReport(ctx: RequestContext, raw: unknown, now = new Date()) {
  const query = parse(headcountQuerySchema, raw);
  const { employees, lookup } = await scopedEmployees(ctx, raw);
  const today = todayInJakarta(now);
  const byId = new Map(employees.map((e) => [e.id, e]));
  // Data sejak 6 bulan sebelum awal tahun: SP yang terbit tahun lalu bisa masih berlaku.
  const since = `${query.year - 1}-07-01`;
  const letters = await listWarningLettersForReport(
    employees.map((e) => e.id),
    since,
    today,
  );
  const active = letters.filter((l) => l.active);
  const issuedInYear = letters.filter((l) => l.issuedAt.startsWith(String(query.year)));
  const canList = policy.canListWarningLetters(ctx.actor);
  return {
    year: query.year,
    asOf: today,
    activeTotal: active.length,
    activeByLevel: Object.fromEntries(
      WARNING_LEVELS.map((lv) => [lv, active.filter((l) => l.level === lv).length]),
    ),
    unconfirmed: active.filter((l) => !l.confirmed).length,
    byViolation: [...group(active, (l) => l.violationType.name).entries()]
      .map(([k, rs]) => ({ label: k, count: rs.length }))
      .sort((a, b) => b.count - a.count),
    byCompany: [...group(active, (l) => l.companyId).entries()]
      .map(([k, rs]) => ({
        label: lookup.companies.get(k)?.code ?? k,
        ...Object.fromEntries(
          WARNING_LEVELS.map((lv) => [lv, rs.filter((l) => l.level === lv).length]),
        ),
        total: rs.length,
      }))
      .sort((a, b) => b.total - a.total),
    issuedByMonth: Array.from({ length: 12 }, (_, i) => {
      const prefix = `${query.year}-${String(i + 1).padStart(2, "0")}`;
      const rs = issuedInYear.filter((l) => l.issuedAt.startsWith(prefix));
      return {
        month: i + 1,
        ...Object.fromEntries(
          WARNING_LEVELS.map((lv) => [lv, rs.filter((l) => l.level === lv).length]),
        ),
      };
    }),
    canList,
    rows: canList
      ? active
          .map((l) => ({
            ...personDto(lookup, byId.get(l.employeeId) as ReportEmployee),
            letterId: l.id,
            level: l.level,
            number: l.number,
            violation: l.violationType.name,
            issuedAt: l.issuedAt,
            effectiveUntil: l.effectiveUntil,
            confirmed: l.confirmed,
          }))
          .sort((a, b) => a.effectiveUntil.localeCompare(b.effectiveUntil))
      : [],
  };
}

// --- Ekspor Excel (aturan D-058: isi = yang terlihat di layar, maks 10.000 baris, diaudit) ---
// Tata letak laporan dari penulis xlsx bersama: sheet Ringkasan + rincian, judul & keterangan filter,
// header berwarna, format angka/persen/tanggal, autofilter, siap cetak A4 lanskap.

const BATASAN =
  "Batasan (ARS-D18): rincian per unit/status memakai unit & status karyawan saat ini; karyawan yang diaktifkan kembali tidak lagi terhitung keluar pada periode lama.";

interface ExportFrame {
  /** Baris keterangan di bawah judul tiap sheet (filter, waktu, kerahasiaan). */
  info: string[];
}

async function sheetsFor(
  ctx: RequestContext,
  kind: ReportKind,
  raw: unknown,
  frame: ExportFrame,
): Promise<XlsxSheet[]> {
  const sheet = (s: XlsxSheet): XlsxSheet => ({ ...s, info: frame.info });
  if (isBatch2Kind(kind)) return sheetsForBatch2(ctx, kind, raw, sheet);
  if (kind === "headcount") {
    const r = await headcountReport(ctx, raw);
    const breakdown = (name: string, label: string, rows: typeof r.byCompany) =>
      sheet({
        name,
        title: `${name} — ${r.year}`,
        rows: [
          [label, "Aktif akhir periode", "Masuk", "Keluar"],
          ...rows.map((b) => [b.label, b.active, b.joined, b.left]),
          [
            "Total",
            rows.reduce((t, b) => t + b.active, 0),
            rows.reduce((t, b) => t + b.joined, 0),
            rows.reduce((t, b) => t + b.left, 0),
          ],
        ],
        formats: ["text", "int", "int", "int"],
        totalRow: true,
      });
    return [
      sheet({
        name: "Ringkasan",
        autoFilter: false,
        title: `Laporan Headcount & Turnover ${r.year}`,
        rows: [
          ["Indikator", "Nilai", "Keterangan"],
          ["Aktif awal tahun", r.summary.startActive, `Aktif per 1 Januari ${r.year}`],
          ["Aktif akhir periode", r.summary.endActive, `Aktif per ${dmy(r.asOf)}`],
          ["Karyawan masuk", r.summary.joined, "Tanggal masuk dalam periode"],
          ["Karyawan keluar", r.summary.left, "Tanggal keluar dalam periode"],
          [
            "Turnover",
            pct(r.summary.turnover),
            "Keluar ÷ rata-rata (aktif awal + aktif akhir) ÷ 2 × 100",
          ],
        ],
        formats: ["text", "int", "text"],
        notes: [BATASAN],
      }),
      sheet({
        name: "Per bulan",
        title: `Headcount per bulan — ${r.year}`,
        rows: [
          ["Bulan", "Aktif awal", "Aktif akhir", "Masuk", "Keluar", "Turnover"],
          ...r.months.map((m) => [
            MONTH_NAMES[m.month - 1],
            m.startActive,
            m.endActive,
            m.joined,
            m.left,
            m.turnover,
          ]),
          [
            "Setahun",
            r.summary.startActive,
            r.summary.endActive,
            r.summary.joined,
            r.summary.left,
            r.summary.turnover,
          ],
        ],
        formats: ["text", "int", "int", "int", "int", "percent"],
        totalRow: true,
        notes: ["Bulan setelah tanggal data tidak dihitung."],
      }),
      breakdown("Per PT", "PT", r.byCompany),
      breakdown("Per unit", "Unit", r.byUnit),
      breakdown("Per status", "Status kepegawaian", r.byStatus),
      sheet({
        name: "Alasan keluar",
        title: `Alasan keluar — ${r.year}`,
        rows: [
          ["Alasan", "Jumlah", "Porsi"],
          ...r.exitReasons.map((x) => [x.label, x.count, share(x.count, r.summary.left)]),
        ],
        formats: ["text", "int", "percent"],
      }),
      people(
        sheet({
          name: "Karyawan masuk",
          title: `Karyawan masuk — ${r.year}`,
          rows: [
            [...PERSON_HEADERS, "Tanggal masuk"],
            ...r.joiners.map((x) => [...person(x), d(x.joinDate)]),
          ],
          formats: [...PERSON_FORMATS, "date"],
        }),
      ),
      people(
        sheet({
          name: "Karyawan keluar",
          title: `Karyawan keluar — ${r.year}`,
          rows: [
            [...PERSON_HEADERS, "Tanggal keluar", "Alasan"],
            ...r.leavers.map((l) => [...person(l), d(l.endDate), l.exitReason]),
          ],
          formats: [...PERSON_FORMATS, "date", "text"],
        }),
      ),
    ];
  }
  if (kind === "document-expiry") {
    const r = await documentExpiryReport(ctx, raw);
    const total = EXPIRY_BUCKETS.reduce((t, b) => t + r.counts[b], 0);
    const hidden =
      r.hiddenSensitive > 0
        ? [
            `${r.hiddenSensitive} dokumen sensitif ikut dihitung tetapi tidak dirinci per orang (butuh izin dokumen sensitif).`,
          ]
        : [];
    return [
      sheet({
        name: "Ringkasan",
        autoFilter: false,
        title: "Laporan Dokumen Kedaluwarsa",
        rows: [
          ["Kelompok masa berlaku", "Jumlah dokumen", "Porsi"],
          ...EXPIRY_BUCKETS.map((b) => [
            EXPIRY_BUCKET_LABELS[b],
            r.counts[b],
            share(r.counts[b], total),
          ]),
          ["Total", total, total > 0 ? 100 : 0],
        ],
        formats: ["text", "int", "percent"],
        totalRow: true,
        notes: [
          `Dihitung dari tanggal data ${dmy(r.asOf)}; dokumen berlaku > 90 hari atau tanpa tanggal berlaku tidak masuk.`,
          ...hidden,
        ],
      }),
      sheet({
        name: "Per jenis dokumen",
        title: "Dokumen kedaluwarsa per jenis",
        rows: [
          ["Jenis dokumen", ...EXPIRY_BUCKETS.map((b) => EXPIRY_BUCKET_LABELS[b]), "Total"],
          ...r.byType.map((t) => [t.documentType, ...EXPIRY_BUCKETS.map((b) => t[b]), t.total]),
          ["Total", ...EXPIRY_BUCKETS.map((b) => r.counts[b]), total],
        ],
        formats: ["text", "int", "int", "int", "int", "int"],
        totalRow: true,
      }),
      people(
        sheet({
          name: "Daftar dokumen",
          title: "Daftar dokumen kedaluwarsa & segera kedaluwarsa",
          rows: [
            [...PERSON_HEADERS, "Jenis dokumen", "Berlaku s/d", "Sisa hari", "Kelompok"],
            ...r.rows.map((x) => [
              ...person(x),
              x.documentType,
              d(x.expiresAt),
              daysUntil(x.expiresAt, r.asOf),
              EXPIRY_BUCKET_LABELS[x.bucket],
            ]),
          ],
          formats: [...PERSON_FORMATS, "text", "date", "int", "text"],
          notes: ["Sisa hari negatif = sudah lewat masa berlaku.", ...hidden],
        }),
      ),
    ];
  }
  if (kind === "completeness") {
    const r = await completenessReport(ctx, raw);
    const site =
      r.siteTypesSkipped.length > 0
        ? [`Dokumen wajib lingkup SITE belum dihitung (ARS-D18): ${r.siteTypesSkipped.join(", ")}.`]
        : [];
    return [
      sheet({
        name: "Ringkasan",
        autoFilter: false,
        title: "Laporan Kelengkapan Data Karyawan",
        rows: [
          ["Indikator", "Nilai"],
          ["Karyawan aktif", r.total],
          ["Data lengkap", r.complete],
          ["Belum lengkap", r.total - r.complete],
          ["Persen lengkap", pct(r.percent)],
        ],
        formats: ["text", "int"],
        notes: [
          "Lengkap = semua data inti (NIK KTP, NPWP, BPJS, rekening, kontak darurat, email kantor) dan dokumen wajib terisi.",
          ...site,
        ],
      }),
      sheet({
        name: "Per PT",
        title: "Kelengkapan data per PT",
        rows: [
          ["PT", "Karyawan aktif", "Lengkap", "Belum lengkap", "Persen lengkap"],
          ...r.byCompany.map((c) => [
            c.label,
            c.total,
            c.complete,
            c.total - c.complete,
            c.percent,
          ]),
          ["Total", r.total, r.complete, r.total - r.complete, r.percent],
        ],
        formats: ["text", "int", "int", "int", "percent"],
        totalRow: true,
      }),
      sheet({
        name: "Per item",
        title: "Data yang paling sering kosong",
        rows: [
          ["Data / dokumen", "Karyawan belum mengisi", "Porsi dari karyawan aktif"],
          ...r.byItem.map((i) => [i.label, i.missing, share(i.missing, r.total)]),
        ],
        formats: ["text", "int", "percent"],
      }),
      people(
        sheet({
          name: "Daftar belum lengkap",
          title: "Karyawan dengan data belum lengkap",
          rows: [
            [...PERSON_HEADERS, "Jumlah kurang", "Data kurang"],
            ...r.rows.map((x) => [...person(x), x.missing.length, x.missing.join(", ")]),
          ],
          formats: [...PERSON_FORMATS, "int", "text"],
          notes: ["Hanya nama item yang kurang; nilai data pribadi tidak disertakan."],
        }),
      ),
    ];
  }
  const r = await warningLettersReport(ctx, raw);
  if (!r.canList) throw new ForbiddenError("Ekspor daftar SP butuh izin surat peringatan.");
  const levels = (row: Record<string, unknown>) => WARNING_LEVELS.map((lv) => Number(row[lv] ?? 0));
  const sum = (rows: Record<string, unknown>[], lv: string) =>
    rows.reduce((t, x) => t + Number(x[lv] ?? 0), 0);
  return [
    sheet({
      name: "Ringkasan",
      autoFilter: false,
      title: `Laporan Surat Peringatan Aktif — ${r.year}`,
      rows: [
        ["Indikator", "Nilai"],
        ["SP aktif", r.activeTotal],
        ...WARNING_LEVELS.map((lv) => [WARNING_LEVEL_LABELS[lv], r.activeByLevel[lv] ?? 0]),
        ["Belum dikonfirmasi karyawan", r.unconfirmed],
      ],
      formats: ["text", "int"],
      notes: [`Aktif = masa berlaku mencakup tanggal ${dmy(r.asOf)}.`],
    }),
    sheet({
      name: "Per PT",
      title: "SP aktif per PT",
      rows: [
        ["PT", ...WARNING_LEVELS, "Total"],
        ...r.byCompany.map((c) => [c.label, ...levels(c), c.total]),
        ["Total", ...WARNING_LEVELS.map((lv) => sum(r.byCompany, lv)), r.activeTotal],
      ],
      formats: ["text", "int", "int", "int", "int"],
      totalRow: true,
    }),
    sheet({
      name: "Per pelanggaran",
      title: "SP aktif per jenis pelanggaran",
      rows: [
        ["Jenis pelanggaran", "Jumlah", "Porsi"],
        ...r.byViolation.map((v) => [v.label, v.count, share(v.count, r.activeTotal)]),
      ],
      formats: ["text", "int", "percent"],
    }),
    sheet({
      name: "Terbit per bulan",
      title: `SP terbit per bulan — ${r.year}`,
      rows: [
        ["Bulan", ...WARNING_LEVELS, "Total"],
        ...r.issuedByMonth.map((m) => {
          const counts = levels(m);
          return [MONTH_NAMES[m.month - 1], ...counts, counts.reduce((t, n) => t + n, 0)];
        }),
        [
          "Setahun",
          ...WARNING_LEVELS.map((lv) => sum(r.issuedByMonth, lv)),
          WARNING_LEVELS.reduce((t, lv) => t + sum(r.issuedByMonth, lv), 0),
        ],
      ],
      formats: ["text", "int", "int", "int", "int"],
      totalRow: true,
    }),
    people(
      sheet({
        name: "Daftar SP aktif",
        title: "Daftar surat peringatan aktif",
        rows: [
          [
            ...PERSON_HEADERS,
            "Tingkat",
            "Nomor",
            "Jenis pelanggaran",
            "Terbit",
            "Berlaku s/d",
            "Dikonfirmasi",
          ],
          ...r.rows.map((x) => [
            ...person(x),
            WARNING_LEVEL_LABELS[x.level],
            x.number,
            x.violation,
            d(x.issuedAt),
            d(x.effectiveUntil),
            x.confirmed ? "Ya" : "Belum",
          ]),
        ],
        formats: [...PERSON_FORMATS, "text", "text", "text", "date", "date", "text"],
      }),
    ),
  ];
}

const JAKARTA_TIME = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
});

/** Keterangan filter yang terbaca manusia (nama PT/unit/lokasi, bukan id). */
async function exportFrame(ctx: RequestContext, kind: ReportKind, raw: unknown, now: Date) {
  const filter = parse(reportFilterSchema, raw);
  const lookup = await getMasterLookup();
  const parts: string[] = [];
  if (filter.companyId) {
    const co = lookup.companies.get(filter.companyId);
    parts.push(`PT ${co ? `${co.code} — ${co.name}` : "-"}`);
  } else {
    parts.push(policy.reportCompanyScope(ctx.actor) ? "semua PT dalam cakupan Anda" : "semua PT");
  }
  if (filter.unitId) {
    parts.push(`Unit ${lookup.departments.get(filter.unitId)?.name ?? "-"} (termasuk sub-unit)`);
  }
  if (filter.workLocationId) {
    parts.push(`Lokasi ${lookup.locations.get(filter.workLocationId)?.name ?? "-"}`);
  }
  if (kind === "tenure" || kind === "birthdays") {
    const q = parse(monthQuerySchema, raw);
    parts.push(`${MONTH_NAMES[q.month - 1]} ${q.year}`);
  } else if (
    kind === "headcount" ||
    kind === "warning-letters" ||
    kind === "movements" ||
    kind === "data-changes"
  ) {
    parts.push(`Tahun ${parse(headcountQuerySchema, raw).year}`);
  }
  const today = todayInJakarta(now);
  return {
    info: [
      `Filter: ${parts.join(" · ")}`,
      `Diekspor ${dmy(today)} pukul ${JAKARTA_TIME.format(now)} WIB oleh ${ctx.actor.email}`,
      "RAHASIA — berisi data karyawan; hanya untuk keperluan internal HR, jangan disebarluaskan.",
    ],
  };
}

export async function exportReport(
  ctx: RequestContext,
  kind: ReportKind,
  raw: unknown,
  now = new Date(),
) {
  const frame = await exportFrame(ctx, kind, raw, now);
  const sheets = await sheetsFor(ctx, kind, raw, frame);
  const count = sheets.reduce((s, sh) => s + sh.rows.length - 1, 0);
  if (count > ARCHIVE_EXPORT_MAX_ROWS) {
    throw new BusinessRuleError(
      `Hasil laporan ${count.toLocaleString("id-ID")} baris; maksimal ${ARCHIVE_EXPORT_MAX_ROWS.toLocaleString("id-ID")} baris per file. Persempit filter (mis. per PT atau unit).`,
    );
  }
  const bytes = buildWorkbook(
    sheets,
    { title: `Laporan ${REPORT_LABELS[kind]}`, creator: "HRIS Arthasia" },
    now,
  );
  const filters = Object.fromEntries(
    Object.entries((raw ?? {}) as Record<string, unknown>).filter(
      ([, v]) => v !== undefined && v !== "",
    ),
  );
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
    action: "report.export",
    entityType: "report",
    entityId: kind,
    after: { filters, rows: count },
  });
  return {
    fileName: `laporan-${kind}-${todayInJakarta(now)}.xlsx`,
    rows: count,
    contentBase64: Buffer.from(bytes).toString("base64"),
  };
}
