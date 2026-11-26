// KTR-D9 (paket K3): laporan audit kualitas data karyawan aktif → .xlsx per karyawan.
// HANYA MEMBACA: seluruh query berjalan dalam satu transaksi `READ ONLY` (Postgres menolak tulis apa pun).
// Keluaran berisi data asli → simpan di folder QA lokal, JANGAN di-commit / dikirim ke layanan luar.
//
// Pakai (dari apps/api):
//   bun --env-file=../../.env scripts/audit-employee-data.ts [--out <folder>] [--compare <daftar.csv>]
// DB non-lokal (mis. staging) ditolak kecuali `--allow-remote` (butuh kata pengguna, KTR-D9).
// `--compare`: CSV ber-header `nama,durasi_bulan,mulai,jabatan` (mulai = YYYY-MM-DD), mis. daftar PKWT baru dari HR.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  addContractDays,
  buildWorkbook,
  EMPLOYMENT_CATEGORY_LABELS,
  type EmploymentCategory,
  POSITION_LEVEL_LABELS,
  type PositionLevel,
  type XlsxCell,
} from "@hris/shared";
import pg from "pg";
import { hostOf, isLocalHostname } from "./db-target.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = (line: string) => process.stdout.write(`${line}\n`);

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL belum diisi.");
// Gagal-tertutup: URL tak terurai (mis. sandi ber-# tanpa encode) dianggap bukan lokal.
const parsedHost = (() => {
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
})();
const isLocalTarget = parsedHost !== undefined && isLocalHostname(parsedHost);
if (!isLocalTarget && !args.includes("--allow-remote")) {
  out(
    `✘ Target bukan DB lokal (${hostOf(url)}). Tambah --allow-remote hanya dengan kata pengguna.`,
  );
  process.exit(1);
}

const JAKARTA = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
const today = JAKARTA.format(new Date());
const outDir = flag("--out") ?? `/mnt/winD/WORK/Magang/QA/${today}-audit-data`;

export interface AuditRow {
  id: string;
  company: string;
  employeeNumber: string | null;
  fullName: string;
  category: EmploymentCategory | null;
  statusName: string;
  joinDate: string;
  endDate: string | null;
  contractStage: number | null;
  contractEndDate: string | null;
  activeKind: "PKWT" | "PROBATION" | null;
  activeStart: string | null;
  activeEnd: string | null;
  firstPkwtStart: string | null;
  position: string;
  level: PositionLevel | null;
  hrLevelCode: string | null;
  managerId: string | null;
  workLocation: string | null;
  ktpHash: string | null;
}

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const addMonths = (start: string, months: number) => {
  const d = new Date(`${start}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
};

/** Daftar masalah per karyawan (fungsi murni — diuji tanpa DB). */
export function auditIssues(row: AuditRow, all: AuditRow[], asOf: string): string[] {
  const issues: string[] = [];
  if (!row.category) issues.push("Status tanpa kategori");
  if (row.category === "PKWT" && !row.activeKind)
    issues.push("PKWT: tahap & periode kontrak belum diisi");
  if (row.category === "PROBATION" && !row.activeKind)
    issues.push("Masa percobaan: tanggal mulai/akhir belum diisi");
  if (row.activeEnd && row.activeEnd < asOf)
    issues.push(`Kontrak lewat ${daysBetween(row.activeEnd, asOf)} hari`);
  if (row.activeKind === "PKWT" && row.activeStart && row.activeEnd) {
    if (
      row.contractStage === 1 &&
      row.activeEnd > addContractDays(addMonths(row.activeStart, 24), -1)
    )
      issues.push("PKWT 1 lebih dari 2 tahun");
    const first = row.firstPkwtStart ?? row.activeStart;
    if (row.activeEnd > addContractDays(addMonths(first, 48), -1))
      issues.push("Total PKWT lebih dari 4 tahun");
  }
  if (row.category === "PKWT" && !row.activeKind && daysBetween(row.joinDate, asOf) > 4 * 365)
    issues.push("PKWT sejak lebih dari 4 tahun lalu (cek status)");
  if (row.joinDate > asOf) issues.push("Tanggal masuk di masa depan");
  if (row.joinDate < "1990-01-01") issues.push("Tanggal masuk sebelum 1990");
  if (
    row.activeStart &&
    row.activeStart !== row.joinDate &&
    !row.firstPkwtStart &&
    row.contractStage === 1
  )
    issues.push(`Tanggal masuk (${row.joinDate}) ≠ mulai PKWT 1 (${row.activeStart})`);
  if (!row.employeeNumber) issues.push("NIP kosong");
  if (!row.level) issues.push("Level jabatan kosong");
  if (
    row.hrLevelCode &&
    row.level &&
    !row.level.toUpperCase().includes(row.hrLevelCode.toUpperCase())
  )
    issues.push(`Kode level HR (${row.hrLevelCode}) ≠ level jabatan (${row.level})`);
  if (!row.managerId && row.level !== "L7") issues.push("Atasan langsung kosong");
  if (!row.workLocation) issues.push("Lokasi kerja kosong");
  const me = normalizeName(row.fullName);
  for (const other of all) {
    if (other.id === row.id) continue;
    const them = normalizeName(other.fullName);
    const sameKtp = row.ktpHash && row.ktpHash === other.ktpHash;
    const similar =
      me === them ||
      (me.length >= 5 &&
        them.length >= 5 &&
        (me.startsWith(`${them} `) || them.startsWith(`${me} `)));
    if (sameKtp)
      issues.push(`NIK KTP sama dengan ${other.employeeNumber ?? "-"} ${other.fullName}`);
    else if (similar)
      issues.push(`Kemungkinan dobel dengan ${other.employeeNumber ?? "-"} ${other.fullName}`);
  }
  return issues;
}

export interface CompareRow {
  nama: string;
  durasiBulan: number | null;
  mulai: string | null;
  jabatan: string | null;
}

/** Cocokkan daftar HR dengan data karyawan aktif (nama dinormalisasi; tanpa fuzzy diam-diam). */
export function compareWithList(list: CompareRow[], rows: AuditRow[]): XlsxCell[][] {
  return list.map((item) => {
    const target = normalizeName(item.nama);
    const exact = rows.filter((r) => normalizeName(r.fullName) === target);
    const partial = exact.length
      ? []
      : rows.filter((r) => {
          const n = normalizeName(r.fullName);
          return n.startsWith(`${target} `) || target.startsWith(`${n} `);
        });
    const matches = exact.length ? exact : partial;
    const end =
      item.mulai && item.durasiBulan
        ? addContractDays(addMonths(item.mulai, item.durasiBulan), -1)
        : null;
    const notes: string[] = [];
    if (matches.length === 0) notes.push("Belum diinput");
    if (matches.length > 1) notes.push(`Kemungkinan dobel (${matches.length} data)`);
    const hit = matches[0];
    if (hit) {
      if (!exact.length) notes.push(`Nama tidak sama persis (${hit.fullName})`);
      if (hit.category !== "PKWT") notes.push(`Status beda: ${hit.statusName}`);
      if (item.mulai && hit.joinDate !== item.mulai)
        notes.push(
          `Tanggal masuk ${hit.joinDate} (selisih ${daysBetween(item.mulai, hit.joinDate)} hari)`,
        );
      if (item.jabatan && normalizeName(hit.position) !== normalizeName(item.jabatan))
        notes.push(`Jabatan beda: ${hit.position}`);
      if (end && hit.activeEnd && hit.activeEnd !== end)
        notes.push(`Akhir kontrak ${hit.activeEnd} ≠ ${end}`);
      if (!hit.activeKind && hit.category === "PKWT") notes.push("Kontrak belum diisi");
    }
    return [
      item.nama,
      item.durasiBulan,
      item.mulai,
      end,
      hit?.employeeNumber ?? null,
      hit?.statusName ?? null,
      hit?.joinDate ?? null,
      hit?.position ?? null,
      notes.length ? notes.join("; ") : "✔ cocok",
    ];
  });
}

function parseCsv(text: string): CompareRow[] {
  const [header, ...lines] = text.split(/\r?\n/).filter((l) => l.trim());
  const cols = (header ?? "").split(",").map((c) => c.trim().toLowerCase());
  const at = (cells: string[], name: string) => cells[cols.indexOf(name)]?.trim() || null;
  return lines.map((line) => {
    const cells = line.split(",");
    const durasi = at(cells, "durasi_bulan");
    return {
      nama: at(cells, "nama") ?? "",
      durasiBulan: durasi ? Number(durasi) : null,
      mulai: at(cells, "mulai"),
      jabatan: at(cells, "jabatan"),
    };
  });
}

const QUERY = `
SELECT e.id, c.code AS company, e.employee_number AS "employeeNumber", e.full_name AS "fullName",
       s.category::text AS category, s.name AS "statusName",
       e.join_date::text AS "joinDate", e.end_date::text AS "endDate",
       e.contract_stage AS "contractStage", e.contract_end_date::text AS "contractEndDate",
       k.kind::text AS "activeKind", k.start_date::text AS "activeStart", k.end_date::text AS "activeEnd",
       (SELECT r.pkwt_first_start_date::text FROM contract.contracts r
         WHERE r.employee_id = e.id AND r.pkwt_first_start_date IS NOT NULL LIMIT 1) AS "firstPkwtStart",
       p.name AS position, p.level::text AS level, e.hr_level_code AS "hrLevelCode",
       e.manager_id AS "managerId", w.name AS "workLocation",
       md5(NULLIF(regexp_replace(ep.ktp_number, '\\D', '', 'g'), '')) AS "ktpHash"
  FROM employee.employees e
  JOIN organization.companies c ON c.id = e.company_id
  JOIN organization.employment_statuses s ON s.id = e.employment_status_id
  JOIN organization.positions p ON p.id = e.position_id
  LEFT JOIN organization.work_locations w ON w.id = e.work_location_id
  LEFT JOIN employee.employee_personal ep ON ep.employee_id = e.id
  LEFT JOIN contract.contracts k ON k.employee_id = e.id AND k.status = 'ACTIVE'
 WHERE e.is_active AND e.onboarding_status = 'APPROVED'
 ORDER BY c.code, e.full_name`;

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let rows: AuditRow[];
  try {
    await client.query("BEGIN READ ONLY");
    rows = (await client.query<AuditRow>(QUERY)).rows;
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
  const levelLabel = (l: PositionLevel | null) => (l ? POSITION_LEVEL_LABELS[l] : null);
  const audited = rows.map((r) => ({ r, issues: auditIssues(r, rows, today) }));
  const header = [
    "PT",
    "NIP",
    "Nama",
    "Status",
    "Tahap",
    "Mulai kontrak",
    "Akhir kontrak",
    "Tanggal masuk",
    "Jabatan",
    "Level",
    "Kode level HR",
    "Atasan?",
    "Lokasi kerja",
    "Jumlah masalah",
    "Masalah",
  ];
  const sheetRows: XlsxCell[][] = [
    header,
    ...audited.map(({ r, issues }) => [
      r.company,
      r.employeeNumber,
      r.fullName,
      r.category ? EMPLOYMENT_CATEGORY_LABELS[r.category] : r.statusName,
      r.activeKind === "PKWT"
        ? `PKWT ${r.contractStage ?? "?"}`
        : r.activeKind === "PROBATION"
          ? "Masa Percobaan"
          : null,
      r.activeStart,
      r.activeEnd,
      r.joinDate,
      r.position,
      levelLabel(r.level),
      r.hrLevelCode,
      r.managerId ? "Ada" : "Kosong",
      r.workLocation,
      issues.length,
      issues.join("; "),
    ]),
  ];
  const counts = new Map<string, number>();
  for (const { issues } of audited)
    for (const i of issues) {
      const key = i.replace(/\(.*\)|\d+ hari|dengan .*/g, "").trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  const sheets = [
    {
      name: "Audit",
      title: "Audit kualitas data karyawan aktif",
      info: [`Per ${today} · baca saja · ${rows.length} karyawan aktif · RAHASIA (data asli)`],
      rows: sheetRows,
      freezeColumns: 3,
    },
    {
      name: "Ringkasan",
      title: "Ringkasan masalah",
      rows: [["Masalah", "Jumlah karyawan"], ...[...counts.entries()].sort((a, b) => b[1] - a[1])],
      autoFilter: false,
    },
  ];
  const compare = flag("--compare");
  if (compare) {
    const list = parseCsv(await readFile(compare, "utf8"));
    sheets.push({
      name: "Cek daftar HR",
      title: `Cek daftar HR (${path.basename(compare)})`,
      info: ["Akhir = mulai + durasi − 1 hari"],
      rows: [
        [
          "Nama (daftar)",
          "Durasi (bln)",
          "Mulai",
          "Akhir (hitungan)",
          "NIP",
          "Status sistem",
          "Tanggal masuk sistem",
          "Jabatan sistem",
          "Hasil",
        ],
        ...compareWithList(list, rows),
      ],
      freezeColumns: 1,
    });
  }
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `audit-data-karyawan-${today}.xlsx`);
  await writeFile(file, buildWorkbook(sheets, { title: "Audit kualitas data karyawan" }));
  out(`✔ ${rows.length} karyawan aktif diaudit (DB ${hostOf(url)}, READ ONLY) → ${file}`);
  for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) out(`  ${v}\t${k}`);
}

if (import.meta.main) await main();
