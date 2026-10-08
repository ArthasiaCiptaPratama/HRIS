import type {
  EmploymentCategory,
  OrgUnitType,
  PositionLevel,
  PrismaClient,
} from "../../src/generated/prisma/client.ts";
import type { OrganizationIds } from "./organization.ts";

// D-051/D-052: replika BENTUK bagan ACP (org chart site 2026, 4 halaman) dengan NAMA FIKTIF (PROMPT §3.7:
// data asli tidak masuk repo/seed). Nama asli hanya di DB lokal lewat `bun run org:import-local` yang
// membaca file di luar repo (DATA-ASLI). Kode pos stabil dipakai untuk mencocokkan keduanya.
// Idempoten: unit/jabatan/pos di-upsert; pemegang dummy berawalan "DMY-".

interface ChartUnit {
  name: string;
  type: OrgUnitType;
  parent: string | null;
  /** Kode PT; null = fungsi korporat grup (D-052). */
  company: string | null;
}

interface ChartPost {
  code: string;
  unit: string;
  position: string;
  level: PositionLevel;
  reportsTo?: string;
  functional?: string;
  headcount?: number;
  /** Jumlah slot yang diisi pemegang dummy (sisanya tampil "Kosong"). */
  filled: number;
  sort?: number;
}

export const ACP_SITE = "Site Tambang Kalimantan (Dummy)";

export const CHART_UNITS: ChartUnit[] = [
  { name: "Corporate Function", type: "DIRECTORATE", parent: null, company: null },
  { name: "Direksi (ACP)", type: "DIRECTORATE", parent: null, company: "ACP" },
  { name: "HR & IR (ACP)", type: "DEPARTMENT", parent: "Direksi (ACP)", company: "ACP" },
  { name: "Finance & Tax (ACP)", type: "DEPARTMENT", parent: "Direksi (ACP)", company: "ACP" },
  {
    name: "Corporate Communications (ACP)",
    type: "DEPARTMENT",
    parent: "Direksi (ACP)",
    company: "ACP",
  },
  { name: "Legal & License (ACP)", type: "DEPARTMENT", parent: "Direksi (ACP)", company: "ACP" },
  {
    name: "Direktorat Operasional (ACP)",
    type: "DIRECTORATE",
    parent: "Direksi (ACP)",
    company: "ACP",
  },
  {
    name: "Business Development & Project (ACP)",
    type: "DIVISION",
    parent: "Direktorat Operasional (ACP)",
    company: "ACP",
  },
  {
    name: "Mining Operational Support (ACP)",
    type: "DIVISION",
    parent: "Direktorat Operasional (ACP)",
    company: "ACP",
  },
  {
    name: "Site Operasional (ACP)",
    type: "DIVISION",
    parent: "Direktorat Operasional (ACP)",
    company: "ACP",
  },
  {
    name: "Engineering (ACP)",
    type: "DEPARTMENT",
    parent: "Site Operasional (ACP)",
    company: "ACP",
  },
  { name: "Drilling (ACP)", type: "SECTION", parent: "Engineering (ACP)", company: "ACP" },
  {
    name: "Supply Chain (ACP)",
    type: "DEPARTMENT",
    parent: "Site Operasional (ACP)",
    company: "ACP",
  },
  { name: "Jetty & Loading (ACP)", type: "SECTION", parent: "Supply Chain (ACP)", company: "ACP" },
  {
    name: "External Relation (ACP)",
    type: "DEPARTMENT",
    parent: "Site Operasional (ACP)",
    company: "ACP",
  },
  { name: "HSE Site (ACP)", type: "DEPARTMENT", parent: "Site Operasional (ACP)", company: "ACP" },
  {
    name: "HR & GA Site (ACP)",
    type: "DEPARTMENT",
    parent: "Site Operasional (ACP)",
    company: "ACP",
  },
  { name: "Direksi (CD2)", type: "DIRECTORATE", parent: null, company: "CD2" },
  { name: "Operasional (CD2)", type: "DEPARTMENT", parent: "Direksi (CD2)", company: "CD2" },
];

const D = "Direksi (ACP)";
const ENG = "Engineering (ACP)";
const DRL = "Drilling (ACP)";
const SC = "Supply Chain (ACP)";
const JET = "Jetty & Loading (ACP)";
const ER = "External Relation (ACP)";
const HSE = "HSE Site (ACP)";
const HRS = "HR & GA Site (ACP)";
const SITE = "Site Operasional (ACP)";
const CORP = "Corporate Function";

export const CHART_POSTS: ChartPost[] = [
  // ── Halaman 4: Direksi & kantor pusat ───────────────────────────────────────
  { code: "ACP-DIRUT", unit: D, position: "Direktur Utama", level: "DIRECTOR", filled: 1 },
  {
    code: "ACP-ADMGEN",
    unit: D,
    position: "Admin Generalist",
    level: "STAFF",
    reportsTo: "ACP-DIRUT",
    filled: 1,
    sort: 0,
  },
  {
    code: "ACP-DIROPS",
    unit: "Direktorat Operasional (ACP)",
    position: "Direktur Operasional",
    level: "DIRECTOR",
    reportsTo: "ACP-DIRUT",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-HRM",
    unit: "HR & IR (ACP)",
    position: "HR Operational & IR Manager",
    level: "MANAGER",
    reportsTo: "ACP-DIRUT",
    functional: "CORP-HCSM",
    filled: 1,
    sort: 2,
  },
  {
    code: "ACP-HRADM",
    unit: "HR & IR (ACP)",
    position: "HR Admin Generalist",
    level: "STAFF",
    reportsTo: "ACP-HRM",
    filled: 0,
  },
  {
    code: "ACP-SPVFT",
    unit: "Finance & Tax (ACP)",
    position: "Supervisor F&T",
    level: "SUPERVISOR",
    reportsTo: "ACP-DIRUT",
    filled: 1,
    sort: 3,
  },
  {
    code: "ACP-FINSITE",
    unit: "Finance & Tax (ACP)",
    position: "Finance Site",
    level: "STAFF",
    reportsTo: "ACP-SPVFT",
    // Halaman 3: garis putus-putus dari Wakil KTT (Foreman Finance di site = orang yang sama).
    functional: "ACP-WKTT",
    filled: 1,
  },
  {
    code: "ACP-VPCC",
    unit: "Corporate Communications (ACP)",
    position: "VP of Corporate Communications",
    level: "GENERAL_MANAGER",
    reportsTo: "ACP-DIRUT",
    filled: 0,
    sort: 4,
  },
  {
    code: "ACP-CMERM",
    unit: "Corporate Communications (ACP)",
    position: "Corporate Marketing & External Relations Manager",
    level: "MANAGER",
    reportsTo: "ACP-VPCC",
    functional: "CORP-HCSM",
    filled: 1,
  },
  {
    code: "ACP-LEGAL",
    unit: "Legal & License (ACP)",
    position: "Legal",
    level: "MANAGER",
    reportsTo: "ACP-DIRUT",
    filled: 0,
    sort: 5,
  },
  {
    code: "ACP-LICMGR",
    unit: "Legal & License (ACP)",
    position: "License Manager",
    level: "MANAGER",
    reportsTo: "ACP-LEGAL",
    filled: 0,
  },
  {
    code: "ACP-ADMLEG",
    unit: "Legal & License (ACP)",
    position: "Admin Legal & License",
    level: "STAFF",
    reportsTo: "ACP-LICMGR",
    filled: 0,
  },
  {
    code: "ACP-HBDP",
    unit: "Business Development & Project (ACP)",
    position: "Head of BD & Project",
    level: "GENERAL_MANAGER",
    reportsTo: "ACP-DIROPS",
    filled: 1,
    sort: 0,
  },
  {
    code: "ACP-HMOS",
    unit: "Mining Operational Support (ACP)",
    position: "Head of Mining Operational Support",
    level: "GENERAL_MANAGER",
    reportsTo: "ACP-DIROPS",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-OPSSTAFF",
    unit: "Mining Operational Support (ACP)",
    position: "Operational Staff",
    level: "STAFF",
    reportsTo: "ACP-HMOS",
    filled: 1,
  },
  // ── Fungsi korporat grup (panel "Corporate Function") ──────────────────────
  {
    code: "CORP-GMFAT",
    unit: CORP,
    position: "GM Finance Accounting & Tax",
    level: "GENERAL_MANAGER",
    filled: 1,
    sort: 0,
  },
  { code: "CORP-HSE", unit: CORP, position: "HSE Corporate", level: "MANAGER", filled: 1, sort: 1 },
  {
    code: "CORP-HCSM",
    unit: CORP,
    position: "HC Senior Manager",
    level: "MANAGER",
    filled: 1,
    sort: 2,
  },
  {
    code: "CORP-PAYSPV",
    unit: CORP,
    position: "Payroll Supervisor",
    level: "SUPERVISOR",
    reportsTo: "CORP-HCSM",
    filled: 1,
  },
  {
    code: "CORP-HCGASPV",
    unit: CORP,
    position: "HCGA Supervisor",
    level: "SUPERVISOR",
    reportsTo: "CORP-HCSM",
    filled: 1,
    sort: 1,
  },
  // ── Struktur Organisasi Site (di bawah Head of BD & Project) ──────────────
  {
    code: "ACP-KTT",
    unit: SITE,
    position: "Kepala Teknik Tambang",
    level: "MANAGER",
    reportsTo: "ACP-HBDP",
    filled: 1,
  },
  {
    code: "ACP-WKTT",
    unit: SITE,
    position: "Wakil Kepala Teknik Tambang",
    level: "MANAGER",
    reportsTo: "ACP-KTT",
    filled: 1,
  },
  {
    code: "ACP-GENADM",
    unit: SITE,
    position: "General Admin",
    level: "STAFF",
    reportsTo: "ACP-WKTT",
    filled: 1,
    sort: 9,
  },
  // Halaman 1: Engineering & Drilling.
  {
    code: "ACP-SPTENG",
    unit: ENG,
    position: "Superintendent Engineer",
    level: "SUPERINTENDENT",
    reportsTo: "ACP-WKTT",
    filled: 0,
    sort: 0,
  },
  {
    code: "ACP-GEO",
    unit: ENG,
    position: "Geologist",
    level: "SUPERVISOR",
    reportsTo: "ACP-SPTENG",
    filled: 1,
    sort: 0,
  },
  {
    code: "ACP-WELL",
    unit: ENG,
    position: "Wellsite",
    level: "STAFF",
    reportsTo: "ACP-GEO",
    headcount: 3,
    filled: 2,
  },
  {
    code: "ACP-MBOR",
    unit: DRL,
    position: "Master Bor",
    level: "SUPERVISOR",
    reportsTo: "ACP-SPTENG",
    filled: 1,
    sort: 1,
  },
  ...([1, 2, 3] as const).flatMap((n): ChartPost[] => [
    {
      code: `ACP-OPBOR${n}`,
      unit: DRL,
      position: `Operator Bor ${n}`,
      level: "STAFF",
      reportsTo: "ACP-MBOR",
      filled: n === 3 ? 0 : 1,
      sort: n,
    },
    {
      code: `ACP-ASBOR${n}`,
      unit: DRL,
      position: "Assisten Bor",
      level: "NON_STAFF",
      reportsTo: `ACP-OPBOR${n}`,
      filled: n === 3 ? 0 : 1,
    },
    {
      code: `ACP-HLBOR${n}`,
      unit: DRL,
      position: "Helper Bor",
      level: "NON_STAFF",
      reportsTo: `ACP-ASBOR${n}`,
      headcount: n === 3 ? 1 : 3,
      filled: n === 3 ? 0 : 3,
    },
  ]),
  {
    code: "ACP-MPE",
    unit: ENG,
    position: "Mine Plan Engineer",
    level: "SUPERVISOR",
    reportsTo: "ACP-SPTENG",
    filled: 1,
    sort: 2,
  },
  {
    code: "ACP-MONCTL",
    unit: ENG,
    position: "Monitoring Controlling",
    level: "STAFF",
    reportsTo: "ACP-MPE",
    filled: 1,
  },
  {
    code: "ACP-QC",
    unit: ENG,
    position: "Quality Control",
    level: "STAFF",
    reportsTo: "ACP-MPE",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-SURV",
    unit: ENG,
    position: "Surveyor",
    level: "SUPERVISOR",
    reportsTo: "ACP-SPTENG",
    filled: 1,
    sort: 3,
  },
  {
    code: "ACP-ASSURV",
    unit: ENG,
    position: "Assistant Surveyor",
    level: "STAFF",
    reportsTo: "ACP-SURV",
    filled: 1,
  },
  {
    code: "ACP-HLSURV",
    unit: ENG,
    position: "Helper Survey",
    level: "NON_STAFF",
    reportsTo: "ACP-ASSURV",
    filled: 0,
  },
  // Halaman 2: Supply Chain, Jetty & Loading.
  {
    code: "ACP-SPTSC",
    unit: SC,
    position: "Superintendent Supply Chain",
    level: "SUPERINTENDENT",
    reportsTo: "ACP-WKTT",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-SPVSC",
    unit: SC,
    position: "Supervisor Supply Chain",
    level: "SUPERVISOR",
    reportsTo: "ACP-SPTSC",
    filled: 1,
    sort: 0,
  },
  ...([1, 2] as const).flatMap((n): ChartPost[] => [
    {
      code: `ACP-FMSC${n}`,
      unit: SC,
      position: "Foreman Supply Chain",
      level: "FOREMAN",
      reportsTo: "ACP-SPVSC",
      filled: 1,
      sort: n,
    },
    {
      code: `ACP-CKPROD${n}`,
      unit: SC,
      position: "Checker Produksi",
      level: "STAFF",
      reportsTo: `ACP-FMSC${n}`,
      filled: 1,
    },
  ]),
  {
    code: "ACP-FMRM",
    unit: SC,
    position: "Foreman Road Maintenance",
    level: "FOREMAN",
    reportsTo: "ACP-SPVSC",
    filled: 1,
    sort: 3,
  },
  {
    code: "ACP-TMRM",
    unit: SC,
    position: "Traffic Man Road Maintenance",
    level: "NON_STAFF",
    reportsTo: "ACP-FMRM",
    headcount: 2,
    filled: 2,
  },
  {
    code: "ACP-MLOAD",
    unit: JET,
    position: "Master Loading",
    level: "SUPERVISOR",
    reportsTo: "ACP-SPTSC",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-AMLPANDU",
    unit: JET,
    position: "Assistant Master Loading (Jetty Pandu)",
    level: "FOREMAN",
    reportsTo: "ACP-MLOAD",
    filled: 1,
    sort: 0,
  },
  {
    code: "ACP-AMLIDI",
    unit: JET,
    position: "Assistant Master Loading (Jetty Pada Idi)",
    level: "FOREMAN",
    reportsTo: "ACP-MLOAD",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-TM",
    unit: JET,
    position: "Traffic Man",
    level: "NON_STAFF",
    reportsTo: "ACP-AMLPANDU",
    headcount: 4,
    filled: 3,
    sort: 0,
  },
  {
    code: "ACP-CKJETTY",
    unit: JET,
    position: "Checker Jetty",
    level: "STAFF",
    reportsTo: "ACP-AMLPANDU",
    headcount: 2,
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-DUMP",
    unit: JET,
    position: "Dumpman",
    level: "NON_STAFF",
    reportsTo: "ACP-AMLPANDU",
    headcount: 2,
    filled: 1,
    sort: 2,
  },
  {
    code: "ACP-MOOR",
    unit: JET,
    position: "Mooring",
    level: "NON_STAFF",
    reportsTo: "ACP-AMLPANDU",
    headcount: 2,
    filled: 2,
    sort: 3,
  },
  // Halaman 3: External Relation, HSE, HR & GA.
  {
    code: "ACP-SPTER",
    unit: ER,
    position: "Superintendent External Relation",
    level: "SUPERINTENDENT",
    reportsTo: "ACP-WKTT",
    filled: 1,
    sort: 2,
  },
  {
    code: "ACP-SURVLC",
    unit: ER,
    position: "Surveyor Landcom",
    level: "SUPERVISOR",
    reportsTo: "ACP-SPTER",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-HUMAS-MK",
    unit: ER,
    position: "Humas (Mangkahui)",
    level: "STAFF",
    reportsTo: "ACP-SPTER",
    filled: 1,
    sort: 0,
  },
  {
    code: "ACP-HUMAS-BP",
    unit: ER,
    position: "Humas (Batu Putih)",
    level: "STAFF",
    reportsTo: "ACP-SPTER",
    filled: 1,
    sort: 2,
  },
  {
    code: "ACP-HSESPV",
    unit: HSE,
    position: "HSE Supervisor",
    level: "SUPERVISOR",
    reportsTo: "ACP-WKTT",
    filled: 1,
    sort: 3,
  },
  {
    code: "ACP-FMK3",
    unit: HSE,
    position: "Foreman K3 & KO",
    level: "FOREMAN",
    reportsTo: "ACP-HSESPV",
    filled: 0,
  },
  {
    code: "ACP-ADMK3",
    unit: HSE,
    position: "Admin K3 & KO",
    level: "STAFF",
    reportsTo: "ACP-FMK3",
    filled: 0,
  },
  {
    code: "ACP-FMENV",
    unit: HSE,
    position: "Foreman Enviro",
    level: "FOREMAN",
    reportsTo: "ACP-HSESPV",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-HRGASPV",
    unit: HRS,
    position: "HR & GA Supervisor",
    level: "SUPERVISOR",
    reportsTo: "ACP-WKTT",
    filled: 1,
    sort: 4,
  },
  {
    code: "ACP-FMHRGA",
    unit: HRS,
    position: "Foreman HR & GA",
    level: "FOREMAN",
    reportsTo: "ACP-HRGASPV",
    filled: 1,
  },
  {
    code: "ACP-ADMHRGA",
    unit: HRS,
    position: "Administrasi",
    level: "STAFF",
    reportsTo: "ACP-FMHRGA",
    filled: 1,
  },
  // ── CD2 (dummy): pemegangnya karyawan dummy CD2 yang sudah ada ─────────────
  { code: "CD2-DIR", unit: "Direksi (CD2)", position: "Direktur", level: "DIRECTOR", filled: 0 },
  {
    code: "CD2-OPSMGR",
    unit: "Operasional (CD2)",
    position: "Operations Manager",
    level: "MANAGER",
    reportsTo: "CD2-DIR",
    filled: 0,
  },
  {
    code: "CD2-OPSSTAFF",
    unit: "Operasional (CD2)",
    position: "Operations Staff",
    level: "STAFF",
    reportsTo: "CD2-OPSMGR",
    headcount: 3,
    filled: 0,
  },
];

/** Karyawan dummy CD2 (seed employee) yang ditempatkan di bagan CD2. */
const CD2_PLACEMENT: Array<{ number: string; post: string }> = [
  { number: "CD2-2024-0001", post: "CD2-OPSMGR" },
  { number: "CD2-2025-0002", post: "CD2-OPSSTAFF" },
  { number: "CD2-2026-0003", post: "CD2-OPSSTAFF" },
];

// Nama fiktif (gabungan nama depan & belakang umum); bukan orang sungguhan.
const FIRST = [
  "Adi",
  "Bayu",
  "Citra",
  "Dewi",
  "Eka",
  "Fajar",
  "Gita",
  "Hendra",
  "Indah",
  "Joko",
  "Kartika",
  "Lukman",
  "Maya",
  "Nanda",
  "Oki",
  "Putri",
  "Rizal",
  "Sari",
  "Teguh",
  "Umi",
  "Vino",
  "Wulan",
  "Yoga",
  "Zahra",
];
const LAST = [
  "Contoh",
  "Sampel",
  "Fiktif",
  "Uji",
  "Rekaan",
  "Dummy",
  "Peraga",
  "Simulasi",
  "Ilustrasi",
];

function dummyName(index: number) {
  const first = FIRST[index % FIRST.length] as string;
  const last = LAST[Math.floor(index / FIRST.length) % LAST.length] as string;
  return `${first} ${last} ${String(index + 1).padStart(2, "0")}`;
}

const CREW: readonly PositionLevel[] = ["NON_STAFF"];

export async function seedOrgChart(prisma: PrismaClient, org: OrganizationIds): Promise<number> {
  const companyId = (code: string | null) => {
    if (code === null) return null;
    const id = org.companies.get(code);
    if (!id) throw new Error(`Seed reference not found: company ${code}`);
    return id;
  };
  const site = await prisma.workLocation.upsert({
    where: { name: ACP_SITE },
    update: {},
    create: {
      name: ACP_SITE,
      city: "Kapuas",
      address: "Jl. Contoh Tambang KM 10 (dummy)",
      latitude: "-2.213600",
      longitude: "113.921300",
      radiusM: 300,
    },
  });
  const hq = org.locations.get("Kantor Pusat Jakarta") ?? null;

  const units = new Map<string, string>();
  for (const unit of CHART_UNITS) {
    const parentId = unit.parent ? (units.get(unit.parent) ?? null) : null;
    const row = await prisma.department.upsert({
      where: { name: unit.name },
      update: { companyId: companyId(unit.company), unitType: unit.type, parentId },
      create: {
        name: unit.name,
        unitType: unit.type,
        parentId,
        companyId: companyId(unit.company),
      },
    });
    units.set(unit.name, row.id);
  }

  const posts = new Map<string, string>();
  const positionOfPost = new Map<string, string>();
  for (const post of CHART_POSTS) {
    const departmentId = units.get(post.unit);
    if (!departmentId) throw new Error(`Seed reference not found: unit ${post.unit}`);
    const position = await prisma.position.upsert({
      where: { departmentId_name: { departmentId, name: post.position } },
      update: { level: post.level },
      create: { name: post.position, departmentId, level: post.level },
    });
    positionOfPost.set(post.code, position.id);
    const data = {
      positionId: position.id,
      headcount: post.headcount ?? 1,
      sortOrder: post.sort ?? 0,
      deletedAt: null,
    };
    const row = await prisma.orgPost.upsert({
      where: { code: post.code },
      update: data,
      create: { code: post.code, ...data },
    });
    posts.set(post.code, row.id);
  }
  // Atasan diisi setelah semua pos ada (urutan definisi bebas).
  for (const post of CHART_POSTS) {
    await prisma.orgPost.update({
      where: { code: post.code },
      data: {
        reportsToId: post.reportsTo ? (posts.get(post.reportsTo) ?? null) : null,
        functionalReportsToId: post.functional ? (posts.get(post.functional) ?? null) : null,
      },
    });
  }

  const categories: EmploymentCategory[] = ["PERMANENT", "PKWT"];
  const statuses = await prisma.employmentStatus.findMany({
    where: { category: { in: categories } },
  });
  const permanent = statuses.find((s) => s.category === "PERMANENT")?.id;
  const pkwt = statuses.find((s) => s.category === "PKWT")?.id ?? permanent;
  if (!permanent || !pkwt) throw new Error("Seed reference not found: status Tetap/PKWT");
  const acp = companyId("ACP") as string;

  let index = 0;
  for (const post of CHART_POSTS) {
    for (let slot = 0; slot < post.filled; slot += 1) {
      const number = `DMY-${post.code}-${slot + 1}`;
      const work = {
        fullName: dummyName(index),
        gender: index % 3 === 0 ? ("FEMALE" as const) : ("MALE" as const),
        joinDate: new Date(`${2018 + (index % 8)}-0${1 + (index % 9)}-15T00:00:00.000Z`),
        employmentStatusId: CREW.includes(post.level) ? pkwt : permanent,
        companyId: acp,
        positionId: positionOfPost.get(post.code) as string,
        workLocationId: isSitePost(post.code) ? site.id : hq,
        orgPostId: posts.get(post.code) ?? null,
        managerOverride: false,
        isActive: true,
      };
      await prisma.employee.upsert({
        where: { employeeNumber: number },
        update: work,
        create: { employeeNumber: number, ...work },
      });
      index += 1;
    }
  }
  for (const { number, post } of CD2_PLACEMENT) {
    await prisma.employee.updateMany({
      where: { employeeNumber: number },
      data: {
        positionId: positionOfPost.get(post) as string,
        orgPostId: posts.get(post) ?? null,
      },
    });
  }
  return CHART_POSTS.length;
}

/** Pos di bawah KTT (halaman 1–3) berlokasi di site; selebihnya kantor pusat. */
const SITE_UNITS = new Set([SITE, ENG, DRL, SC, JET, ER, HSE, HRS]);
function isSitePost(code: string) {
  const post = CHART_POSTS.find((p) => p.code === code);
  return post ? SITE_UNITS.has(post.unit) : false;
}
