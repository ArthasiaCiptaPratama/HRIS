import type {
  EmploymentCategory,
  OrgUnitType,
  PositionLevel,
  PrismaClient,
} from "../../src/generated/prisma/client.ts";
import type { OrganizationIds } from "./organization.ts";

// D-051/D-052: replika BENTUK bagan ACP ("Orgchart Site 06.11.2026", 4 halaman; level dari judul jabatan,
// ORG-D1) dengan NAMA FIKTIF (PROMPT §3.7:
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
  { name: "Direksi (ACP)", type: "DIRECTORATE", parent: null, company: "ACP" },
  {
    name: "Direktorat Operasional (ACP)",
    type: "DIRECTORATE",
    parent: "Direksi (ACP)",
    company: "ACP",
  },
  { name: "Direktorat F A T (ACP)", type: "DIRECTORATE", parent: "Direksi (ACP)", company: "ACP" },
  { name: "Direktorat HR (ACP)", type: "DIRECTORATE", parent: "Direksi (ACP)", company: "ACP" },
  { name: "Legal (ACP)", type: "DIVISION", parent: "Direksi (ACP)", company: "ACP" },
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
    name: "Finance, Accounting & Tax (ACP)",
    type: "DIVISION",
    parent: "Direktorat F A T (ACP)",
    company: "ACP",
  },
  { name: "HR & IR (ACP)", type: "DIVISION", parent: "Direktorat HR (ACP)", company: "ACP" },
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
    name: "Operations & Production (ACP)",
    type: "DEPARTMENT",
    parent: "Site Operasional (ACP)",
    company: "ACP",
  },
  { name: "Jetty (ACP)", type: "SECTION", parent: "Operations & Production (ACP)", company: "ACP" },
  { name: "HSE (ACP)", type: "DEPARTMENT", parent: "Site Operasional (ACP)", company: "ACP" },
  {
    name: "External Relation (ACP)",
    type: "DEPARTMENT",
    parent: "Site Operasional (ACP)",
    company: "ACP",
  },
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
const DOPS = "Direktorat Operasional (ACP)";
const DFAT = "Direktorat F A T (ACP)";
const DHR = "Direktorat HR (ACP)";
const LEG = "Legal (ACP)";
const BDP = "Business Development & Project (ACP)";
const MOS = "Mining Operational Support (ACP)";
const FAT = "Finance, Accounting & Tax (ACP)";
const HRIR = "HR & IR (ACP)";
const SITE = "Site Operasional (ACP)";
const ENG = "Engineering (ACP)";
const DRL = "Drilling (ACP)";
const OPS = "Operations & Production (ACP)";
const JET = "Jetty (ACP)";
const HSE = "HSE (ACP)";
const ER = "External Relation (ACP)";
const HRS = "HR & GA Site (ACP)";

export const CHART_POSTS: ChartPost[] = [
  // ── Halaman 4: Direksi & kantor pusat ──
  { code: "ACP-DIRUT", unit: D, position: "Direktur Utama", level: "L7", filled: 1 },
  {
    code: "ACP-ADMGEN",
    unit: D,
    position: "Admin Generalist",
    level: "L1A",
    reportsTo: "ACP-DIRUT",
    filled: 1,
  },
  {
    code: "ACP-DIROPS",
    unit: DOPS,
    position: "Direktur Operasional",
    level: "L6",
    reportsTo: "ACP-DIRUT",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-DIRFAT",
    unit: DFAT,
    position: "Direktur F A T",
    level: "L6",
    reportsTo: "ACP-DIRUT",
    filled: 1,
    sort: 2,
  },
  {
    code: "ACP-DIRHR",
    unit: DHR,
    position: "Direktur HR",
    level: "L6",
    reportsTo: "ACP-DIRUT",
    filled: 1,
    sort: 3,
  },
  {
    code: "ACP-GMLEGAL",
    unit: LEG,
    position: "General Manager Legal",
    level: "L5",
    reportsTo: "ACP-DIRUT",
    filled: 0,
    sort: 4,
  },
  {
    code: "ACP-HBDP",
    unit: BDP,
    position: "Head of BD & Project",
    level: "L5",
    reportsTo: "ACP-DIROPS",
    filled: 1,
  },
  {
    code: "ACP-HMOS",
    unit: MOS,
    position: "Head of Mining Operational Support",
    level: "L3",
    reportsTo: "ACP-DIROPS",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-OPSSTAFF",
    unit: MOS,
    position: "Operational Staff",
    level: "L1A",
    reportsTo: "ACP-HMOS",
    filled: 1,
  },
  {
    code: "ACP-GMFAT",
    unit: FAT,
    position: "General Manager F A T",
    level: "L5",
    reportsTo: "ACP-DIRFAT",
    filled: 1,
  },
  {
    code: "ACP-AMFAT",
    unit: FAT,
    position: "Assistant Manager F A T",
    level: "L3",
    reportsTo: "ACP-GMFAT",
    filled: 0,
  },
  {
    code: "ACP-SPVFT",
    unit: FAT,
    position: "Supervisor F&T",
    level: "L3",
    reportsTo: "ACP-AMFAT",
    filled: 1,
  },
  {
    code: "ACP-FINSITE",
    unit: FAT,
    position: "Finance Site",
    level: "L1A",
    reportsTo: "ACP-SPVFT",
    functional: "ACP-KTT",
    filled: 1,
  },

  {
    code: "ACP-HRM",
    unit: HRIR,
    position: "HR Operational & IR Manager",
    level: "L3",
    reportsTo: "ACP-DIRHR",
    filled: 1,
  },
  {
    code: "ACP-IRLC",
    unit: HRIR,
    position: "Industrial Relations (IR) & Legal Compliance",
    level: "L1A",
    reportsTo: "ACP-HRM",
    filled: 0,
  },
  {
    code: "ACP-TAEB",
    unit: HRIR,
    position: "Talent Acquisition & Employer Branding (Rekrutmen)",
    level: "L1A",
    reportsTo: "ACP-HRM",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-CBHR",
    unit: HRIR,
    position: "Compensation & Benefits (CompBen) & HR Operations",
    level: "L1A",
    reportsTo: "ACP-HRM",
    filled: 0,
    sort: 2,
  },
  {
    code: "ACP-ERM",
    unit: LEG,
    position: "External Relation Manager",
    level: "L3",
    reportsTo: "ACP-GMLEGAL",
    filled: 0,
  },
  {
    code: "ACP-LEGCORP",
    unit: LEG,
    position: "Legal Corporate",
    level: "L1A",
    reportsTo: "ACP-GMLEGAL",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-LICENSE",
    unit: LEG,
    position: "License",
    level: "L1A",
    reportsTo: "ACP-GMLEGAL",
    filled: 0,
    sort: 2,
  },
  // ── Halaman 1: KTT & Engineering ──
  {
    code: "ACP-KTT",
    unit: SITE,
    position: "Kepala Teknik Tambang",
    level: "L5",
    reportsTo: "ACP-HBDP",
    filled: 1,
  },
  {
    code: "ACP-SPTENG",
    unit: ENG,
    position: "Superintendent Engineer",
    level: "L4",
    reportsTo: "ACP-KTT",
    filled: 1,
  },
  {
    code: "ACP-GEO",
    unit: ENG,
    position: "Geologist",
    level: "L3",
    reportsTo: "ACP-SPTENG",
    filled: 1,
  },
  {
    code: "ACP-MPE",
    unit: ENG,
    position: "Mine Plan Engineer",
    level: "L3",
    reportsTo: "ACP-SPTENG",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-SURVSPV",
    unit: ENG,
    position: "Mine Survey Supervisor",
    level: "L3",
    reportsTo: "ACP-SPTENG",
    filled: 1,
    sort: 2,
  },
  {
    code: "ACP-MBOR",
    unit: DRL,
    position: "Master Bor",
    level: "L2",
    reportsTo: "ACP-GEO",
    filled: 1,
  },
  {
    code: "ACP-WELL",
    unit: ENG,
    position: "Wellsite",
    level: "L1A",
    reportsTo: "ACP-GEO",
    headcount: 3,
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-OPBOR1",
    unit: DRL,
    position: "Operator Bor I",
    level: "L1A",
    reportsTo: "ACP-MBOR",
    filled: 1,
  },
  {
    code: "ACP-OPBOR2",
    unit: DRL,
    position: "Operator Bor II",
    level: "L1A",
    reportsTo: "ACP-MBOR",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-OPBOR3",
    unit: DRL,
    position: "Operator Bor III",
    level: "L1A",
    reportsTo: "ACP-MBOR",
    filled: 0,
    sort: 2,
  },
  {
    code: "ACP-ASBOR1",
    unit: DRL,
    position: "Assistant Bor I",
    level: "L1A",
    reportsTo: "ACP-OPBOR1",
    filled: 1,
  },
  {
    code: "ACP-ASBOR2",
    unit: DRL,
    position: "Assistant Bor II",
    level: "L1A",
    reportsTo: "ACP-OPBOR2",
    filled: 1,
  },
  {
    code: "ACP-ASBOR3",
    unit: DRL,
    position: "Assistant Bor III",
    level: "L1A",
    reportsTo: "ACP-OPBOR3",
    filled: 0,
  },
  {
    code: "ACP-HLBOR1",
    unit: DRL,
    position: "Helper Bor I",
    level: "L1B",
    reportsTo: "ACP-ASBOR1",
    headcount: 3,
    filled: 3,
  },
  {
    code: "ACP-HLBOR2",
    unit: DRL,
    position: "Helper Bor II",
    level: "L1B",
    reportsTo: "ACP-ASBOR2",
    headcount: 3,
    filled: 3,
  },
  {
    code: "ACP-HLBOR3",
    unit: DRL,
    position: "Helper Bor III",
    level: "L1B",
    reportsTo: "ACP-ASBOR3",
    headcount: 3,
    filled: 0,
  },
  {
    code: "ACP-MONCTL",
    unit: ENG,
    position: "Monitoring Controlling",
    level: "L1A",
    reportsTo: "ACP-MPE",
    filled: 1,
  },
  {
    code: "ACP-QC",
    unit: ENG,
    position: "Quality Control",
    level: "L1A",
    reportsTo: "ACP-MPE",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-FMMP",
    unit: ENG,
    position: "Mine Plan Foreman",
    level: "L2",
    reportsTo: "ACP-MPE",
    filled: 0,
    sort: 2,
  },
  {
    code: "ACP-FMSURV",
    unit: ENG,
    position: "Foreman Mine Survey",
    level: "L2",
    reportsTo: "ACP-SURVSPV",
    filled: 0,
  },
  {
    code: "ACP-ASSURV",
    unit: ENG,
    position: "Mine Survey Assistant",
    level: "L1A",
    reportsTo: "ACP-FMSURV",
    filled: 1,
  },
  {
    code: "ACP-HLSURV",
    unit: ENG,
    position: "Helper Survey",
    level: "L1B",
    reportsTo: "ACP-ASSURV",
    filled: 0,
  },
  // ── Halaman 2: Operations & Production ──
  {
    code: "ACP-OPSHEAD",
    unit: OPS,
    position: "Operations & Production Department Head",
    level: "L4",
    reportsTo: "ACP-KTT",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-SPVPROD",
    unit: OPS,
    position: "Production Supervisor",
    level: "L3",
    reportsTo: "ACP-OPSHEAD",
    filled: 1,
  },
  {
    code: "ACP-SPVJET",
    unit: JET,
    position: "Jetty Supervisor",
    level: "L3",
    reportsTo: "ACP-OPSHEAD",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-FMPROD1",
    unit: OPS,
    position: "Production Foreman I",
    level: "L2",
    reportsTo: "ACP-SPVPROD",
    headcount: 2,
    filled: 1,
  },
  {
    code: "ACP-FMPROD2",
    unit: OPS,
    position: "Production Foreman II",
    level: "L2",
    reportsTo: "ACP-SPVPROD",
    headcount: 2,
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-FMRM1",
    unit: OPS,
    position: "Foreman Road Maintenance",
    level: "L2",
    reportsTo: "ACP-SPVPROD",
    filled: 1,
    sort: 2,
  },
  {
    code: "ACP-FMRM2",
    unit: OPS,
    position: "Foreman Road Maintenance",
    level: "L2",
    reportsTo: "ACP-SPVPROD",
    filled: 0,
    sort: 3,
  },
  {
    code: "ACP-CKPIT1",
    unit: OPS,
    position: "Checker Coal PIT I",
    level: "L1A",
    reportsTo: "ACP-FMPROD1",
    filled: 0,
  },
  {
    code: "ACP-FUELPIT1",
    unit: OPS,
    position: "Fuelman PIT I",
    level: "L1A",
    reportsTo: "ACP-FMPROD1",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-CKPIT2",
    unit: OPS,
    position: "Checker Coal PIT II",
    level: "L1A",
    reportsTo: "ACP-FMPROD2",
    filled: 1,
  },
  {
    code: "ACP-FUELPIT2",
    unit: OPS,
    position: "Fuelman PIT II",
    level: "L1A",
    reportsTo: "ACP-FMPROD2",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-TMRM1",
    unit: OPS,
    position: "Traffic Man Road Maintenance",
    level: "L1A",
    reportsTo: "ACP-FMRM1",
    headcount: 2,
    filled: 2,
  },
  {
    code: "ACP-TMRM2",
    unit: OPS,
    position: "Traffic Man Road Maintenance",
    level: "L1A",
    reportsTo: "ACP-FMRM2",
    headcount: 2,
    filled: 0,
  },
  {
    code: "ACP-AMLPANDU",
    unit: JET,
    position: "Assistant Master Loading (Jetty Pandu)",
    level: "L2",
    reportsTo: "ACP-SPVJET",
    filled: 1,
  },
  {
    code: "ACP-AMLIDI",
    unit: JET,
    position: "Assistant Master Loading (Jetty Pada Idi)",
    level: "L2",
    reportsTo: "ACP-SPVJET",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-TMJET1",
    unit: JET,
    position: "Traffic Man & Road Maintenance Jetty I",
    level: "L1A",
    reportsTo: "ACP-AMLPANDU",
    headcount: 3,
    filled: 2,
  },
  {
    code: "ACP-TMJET2",
    unit: JET,
    position: "Traffic Man & Road Maintenance Jetty II",
    level: "L1A",
    reportsTo: "ACP-AMLPANDU",
    headcount: 3,
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-MOOR1",
    unit: JET,
    position: "Mooring I",
    level: "L1A",
    reportsTo: "ACP-AMLPANDU",
    headcount: 2,
    filled: 2,
    sort: 2,
  },
  {
    code: "ACP-MOOR2",
    unit: JET,
    position: "Mooring II",
    level: "L1A",
    reportsTo: "ACP-AMLPANDU",
    headcount: 2,
    filled: 0,
    sort: 3,
  },
  {
    code: "ACP-CKJET1",
    unit: JET,
    position: "Checker Jetty",
    level: "L1A",
    reportsTo: "ACP-MOOR1",
    filled: 0,
  },
  {
    code: "ACP-DUMP1",
    unit: JET,
    position: "Dumpman I",
    level: "L1A",
    reportsTo: "ACP-MOOR1",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-FUELJET1",
    unit: JET,
    position: "Fuelman Jetty I",
    level: "L1A",
    reportsTo: "ACP-MOOR1",
    filled: 0,
    sort: 2,
  },
  {
    code: "ACP-CKJET2",
    unit: JET,
    position: "Checker Jetty",
    level: "L1A",
    reportsTo: "ACP-MOOR2",
    filled: 0,
  },
  {
    code: "ACP-DUMP2",
    unit: JET,
    position: "Dumpman II",
    level: "L1A",
    reportsTo: "ACP-MOOR2",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-FUELJET2",
    unit: JET,
    position: "Fuelman Jetty II",
    level: "L1A",
    reportsTo: "ACP-MOOR2",
    filled: 0,
    sort: 2,
  },
  // ── Halaman 3: HSE, External Relation, HR & GA ──
  {
    code: "ACP-HSEHEAD",
    unit: HSE,
    position: "HSE Department Head",
    level: "L4",
    reportsTo: "ACP-KTT",
    filled: 0,
    sort: 2,
  },
  {
    code: "ACP-HSESPV",
    unit: HSE,
    position: "HSE Supervisor",
    level: "L3",
    reportsTo: "ACP-HSEHEAD",
    filled: 1,
  },
  {
    code: "ACP-FMPARA",
    unit: HSE,
    position: "Paramedic Foreman",
    level: "L2",
    reportsTo: "ACP-HSESPV",
    filled: 0,
  },
  {
    code: "ACP-FMENV1",
    unit: HSE,
    position: "Environment Foreman I",
    level: "L2",
    reportsTo: "ACP-HSESPV",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-FMENV2",
    unit: HSE,
    position: "Environment Foreman II",
    level: "L2",
    reportsTo: "ACP-HSESPV",
    filled: 0,
    sort: 2,
  },
  {
    code: "ACP-HLENV1",
    unit: HSE,
    position: "Helper Environment",
    level: "L1B",
    reportsTo: "ACP-FMENV1",
    headcount: 2,
    filled: 0,
  },
  {
    code: "ACP-HLENV2",
    unit: HSE,
    position: "Helper Environment",
    level: "L1B",
    reportsTo: "ACP-FMENV2",
    headcount: 2,
    filled: 0,
  },
  {
    code: "ACP-SPTER",
    unit: ER,
    position: "Superintendent External Relation",
    level: "L4",
    reportsTo: "ACP-KTT",
    filled: 1,
    sort: 3,
  },
  {
    code: "ACP-SPVEXT",
    unit: ER,
    position: "External & Lancom Supervisor",
    level: "L3",
    reportsTo: "ACP-SPTER",
    filled: 1,
  },
  {
    code: "ACP-FMEXT",
    unit: ER,
    position: "External Foreman",
    level: "L2",
    reportsTo: "ACP-SPVEXT",
    filled: 0,
  },
  {
    code: "ACP-SPVCD",
    unit: ER,
    position: "Com.Dev Supervisor",
    level: "L3",
    reportsTo: "ACP-SPTER",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-FMCD",
    unit: ER,
    position: "Com.Dev Foreman",
    level: "L2",
    reportsTo: "ACP-SPVCD",
    filled: 0,
  },
  {
    code: "ACP-HUMAS-MK",
    unit: ER,
    position: "Humas (Mangkahui)",
    level: "L1A",
    reportsTo: "ACP-FMCD",
    filled: 1,
  },
  {
    code: "ACP-HUMAS-BP",
    unit: ER,
    position: "Humas (Batu Putih)",
    level: "L1A",
    reportsTo: "ACP-FMCD",
    filled: 1,
    sort: 1,
  },
  {
    code: "ACP-SPTHRGA",
    unit: HRS,
    position: "Superintendent HR & GA",
    level: "L4",
    reportsTo: "ACP-KTT",
    filled: 0,
    sort: 4,
  },
  {
    code: "ACP-SPVHR",
    unit: HRS,
    position: "HR Supervisor",
    level: "L3",
    reportsTo: "ACP-SPTHRGA",
    filled: 1,
  },
  {
    code: "ACP-FMHR",
    unit: HRS,
    position: "HR Foreman",
    level: "L2",
    reportsTo: "ACP-SPVHR",
    filled: 0,
  },
  {
    code: "ACP-GENADMHR",
    unit: HRS,
    position: "General Admin",
    level: "L1A",
    reportsTo: "ACP-FMHR",
    filled: 1,
  },
  {
    code: "ACP-SPVGA",
    unit: HRS,
    position: "GA Supervisor",
    level: "L3",
    reportsTo: "ACP-SPTHRGA",
    filled: 0,
    sort: 1,
  },
  {
    code: "ACP-FMHRGA",
    unit: HRS,
    position: "Foreman HR & GA",
    level: "L2",
    reportsTo: "ACP-SPVGA",
    filled: 1,
  },
  {
    code: "ACP-CREWGA",
    unit: HRS,
    position: "Crew GA",
    level: "L1A",
    reportsTo: "ACP-FMHRGA",
    headcount: 3,
    filled: 0,
  },
  {
    code: "ACP-GENADM",
    unit: SITE,
    position: "General Admin",
    level: "L1A",
    reportsTo: "ACP-KTT",
    filled: 1,
    sort: 5,
  },
  // ── CD2 (dummy): pemegangnya karyawan dummy CD2 yang sudah ada ─────────────
  { code: "CD2-DIR", unit: "Direksi (CD2)", position: "Direktur", level: "L6", filled: 0 },
  {
    code: "CD2-OPSMGR",
    unit: "Operasional (CD2)",
    position: "Operations Manager",
    level: "L3",
    reportsTo: "CD2-DIR",
    filled: 0,
  },
  {
    code: "CD2-OPSSTAFF",
    unit: "Operasional (CD2)",
    position: "Operations Staff",
    level: "L1A",
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

const CREW: readonly PositionLevel[] = ["L1B"];

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
    // ORG-D5: akar Site (nama diawali "Site") ditandai zona Site; turunannya ikut induk.
    const zone = /^site\b/i.test(unit.name.trim()) ? ("SITE" as const) : null;
    const row = await prisma.department.upsert({
      where: { name: unit.name },
      update: { companyId: companyId(unit.company), unitType: unit.type, parentId, zone },
      create: {
        name: unit.name,
        unitType: unit.type,
        parentId,
        companyId: companyId(unit.company),
        zone,
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
const SITE_UNITS = new Set([SITE, ENG, DRL, OPS, JET, ER, HSE, HRS]);
function isSitePost(code: string) {
  const post = CHART_POSTS.find((p) => p.code === code);
  return post ? SITE_UNITS.has(post.unit) : false;
}
