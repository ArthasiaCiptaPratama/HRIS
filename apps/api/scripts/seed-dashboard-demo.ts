// Data demo Dashboard (D-065) untuk DB LOKAL: 120 karyawan fiktif grup tambang + 1 akun SUPER_ADMIN lokal.
// Pakai: bun run demo:dashboard            (password SA dibuat acak & dicetak sekali)
//        DEV_ACCOUNT_PASSWORD='...' bun run demo:dashboard   (password SA sendiri, ≥ 12 karakter)
// Idempoten: karyawan ber-nomor "DEMO-" dihapus lalu dibuat ulang (acak tetap, hasil sama tiap kali).
// Semua nama, tanggal, dan data pribadi FIKTIF (PLAN §5.7). Ditolak bila DATABASE_URL bukan lokal.
import { randomBytes } from "node:crypto";
import { disconnectPrisma, getPrisma } from "../src/core/db.ts";
import { createSupabaseAdmin } from "../src/core/supabase-admin.ts";
import type {
  EducationLevel,
  EmployeeExitReason,
  MaritalStatus,
  PositionLevel,
  Religion,
} from "../src/generated/prisma/client.ts";
import { hostOf, isRemoteUrl } from "./db-target.ts";

const out = (line: string) => process.stdout.write(`${line}\n`);
const PREFIX = "DEMO-";
const TOTAL = 120;
const SA_EMAIL = "superadmin.lokal@arthasia.test";

if (process.env.NODE_ENV === "production") throw new Error("Tidak untuk produksi");
if (isRemoteUrl(process.env.DATABASE_URL)) {
  out(`✘ Ditolak: DATABASE_URL bukan DB lokal (${hostOf(process.env.DATABASE_URL)}).`);
  process.exit(1);
}

// ── Acak deterministik (mulberry32) ─────────────────────────────────────────
let state = 20261009;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
function weighted<T extends string>(table: Partial<Record<T, number>>): T {
  const entries = Object.entries(table) as [T, number][];
  let roll = rand() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1]?.[0] as T;
}
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const date = (year: number, month = between(1, 12), day = between(1, 28)) =>
  new Date(Date.UTC(year, month - 1, day));

// ── Nama fiktif khas Indonesia ──────────────────────────────────────────────
const MALE = [
  "Agus",
  "Bambang",
  "Rizky",
  "Dedi",
  "Hendra",
  "Joko",
  "Fajar",
  "Yusuf",
  "Arief",
  "Teguh",
  "Wahyu",
  "Rahmat",
  "Ilham",
  "Andika",
  "Bayu",
  "Galih",
  "Iwan",
  "Rudi",
  "Slamet",
  "Taufik",
  "Dimas",
  "Eko",
  "Gilang",
  "Hadi",
  "Irfan",
  "Komang",
  "Made",
  "Nanda",
  "Putu",
  "Reza",
  "Samsul",
  "Yoga",
];
const FEMALE = [
  "Siti",
  "Ayu",
  "Dewi",
  "Fitri",
  "Indah",
  "Lestari",
  "Maya",
  "Nur",
  "Putri",
  "Rina",
  "Sari",
  "Wulan",
  "Yuni",
  "Anisa",
  "Citra",
  "Dinda",
  "Eka",
  "Intan",
  "Kartika",
  "Mega",
  "Novi",
  "Ratna",
  "Tiara",
  "Vina",
];
const LAST = [
  "Saputra",
  "Pratama",
  "Wijaya",
  "Hidayat",
  "Nugroho",
  "Setiawan",
  "Kurniawan",
  "Siregar",
  "Nasution",
  "Simanjuntak",
  "Hasibuan",
  "Lubis",
  "Syahputra",
  "Rahman",
  "Halim",
  "Gunawan",
  "Susanto",
  "Purnomo",
  "Firmansyah",
  "Ramadhan",
  "Wibowo",
  "Utomo",
  "Santoso",
  "Permana",
  "Maulana",
  "Sembiring",
  "Tarigan",
  "Manurung",
  "Panjaitan",
  "Effendi",
];

// ── Lokasi kerja tambahan (dibuat bila belum ada) ───────────────────────────
const SITE_LOCATIONS = [
  { name: "Site Kintap", city: "Tanah Laut" },
  { name: "Site Satui", city: "Tanah Bumbu" },
  { name: "Jetty Asam-Asam", city: "Tanah Laut" },
  { name: "Workshop Banjarbaru", city: "Banjarbaru" },
] as const;
const OFFICE_LOCATIONS = [{ name: "Kantor Perwakilan Banjarmasin", city: "Banjarmasin" }] as const;

// ── Profil per level jabatan ────────────────────────────────────────────────
type Level = PositionLevel | "NONE";
const LEVEL_WEIGHT: Record<Level, number> = {
  NON_STAFF: 26,
  STAFF: 34,
  FOREMAN: 10,
  SUPERVISOR: 12,
  SUPERINTENDENT: 6,
  MANAGER: 7,
  GENERAL_MANAGER: 3,
  DIRECTOR: 2,
  NONE: 0,
};
const GRADE: Record<Level, string> = {
  NON_STAFF: "Staf",
  STAFF: "Staf",
  FOREMAN: "Staf Senior",
  SUPERVISOR: "Supervisor",
  SUPERINTENDENT: "Supervisor",
  MANAGER: "Manajer",
  GENERAL_MANAGER: "Manajer",
  DIRECTOR: "Direktur",
  NONE: "Staf",
};
type Edu = EducationLevel | "NONE";
const EDUCATION: Record<Level, Partial<Record<Edu, number>>> = {
  NON_STAFF: { SD: 28, SMP: 34, SMA: 30, OTHER: 2, NONE: 6 },
  STAFF: { SMA: 38, D1: 3, D3: 22, D4: 5, S1: 28, NONE: 4 },
  FOREMAN: { SMP: 12, SMA: 58, D3: 24, NONE: 6 },
  SUPERVISOR: { SMA: 10, D3: 28, S1: 58, NONE: 4 },
  SUPERINTENDENT: { D3: 10, S1: 72, S2: 18 },
  MANAGER: { S1: 62, S2: 36, S3: 2 },
  GENERAL_MANAGER: { S1: 40, S2: 52, S3: 8 },
  DIRECTOR: { S1: 30, S2: 55, S3: 15 },
  NONE: { SMA: 50, S1: 50 },
};
const CATEGORY: Record<Level, Record<string, number>> = {
  NON_STAFF: { "Pekerja Harian": 30, Outsourcing: 28, PKWT: 26, Vendor: 8, "Karyawan Tetap": 8 },
  STAFF: {
    "Karyawan Tetap": 34,
    PKWT: 30,
    "Karyawan Percobaan": 12,
    Magang: 14,
    Outsourcing: 6,
    Vendor: 4,
  },
  FOREMAN: { "Karyawan Tetap": 55, PKWT: 35, Outsourcing: 10 },
  SUPERVISOR: { "Karyawan Tetap": 70, PKWT: 22, "Karyawan Percobaan": 8 },
  SUPERINTENDENT: { "Karyawan Tetap": 85, PKWT: 15 },
  MANAGER: { "Karyawan Tetap": 92, "Karyawan Percobaan": 8 },
  GENERAL_MANAGER: { "Karyawan Tetap": 100 },
  DIRECTOR: { "Karyawan Tetap": 100 },
  NONE: { PKWT: 100 },
};
const AGE: Record<Level, [number, number]> = {
  NON_STAFF: [19, 52],
  STAFF: [21, 45],
  FOREMAN: [28, 50],
  SUPERVISOR: [28, 50],
  SUPERINTENDENT: [33, 55],
  MANAGER: [35, 56],
  GENERAL_MANAGER: [40, 58],
  DIRECTOR: [45, 62],
  NONE: [25, 40],
};
const EDU_ORDER: EducationLevel[] = ["SD", "SMP", "SMA", "D1", "D2", "D3", "D4", "S1", "S2", "S3"];
const SCHOOL: Record<EducationLevel, string> = {
  SD: "SD Negeri Contoh",
  SMP: "SMP Negeri Contoh",
  SMA: "SMK Negeri Contoh Tambang",
  D1: "Politeknik Contoh",
  D2: "Politeknik Contoh",
  D3: "Politeknik Negeri Contoh",
  D4: "Politeknik Negeri Contoh",
  S1: "Universitas Contoh Lambung",
  S2: "Universitas Contoh Nusantara",
  S3: "Institut Contoh Nasional",
  OTHER: "Lembaga Kursus Contoh",
};
const MAJOR = [
  "Teknik Pertambangan",
  "Teknik Mesin",
  "Teknik Geologi",
  "Manajemen",
  "Akuntansi",
  "Teknik Sipil",
  "K3",
  "Teknik Elektro",
  "Hukum",
  "Psikologi",
  "Teknik Informatika",
];
const RELIGION: Partial<Record<Religion, number>> = {
  ISLAM: 78,
  PROTESTANT: 9,
  CATHOLIC: 6,
  HINDU: 3,
  BUDDHIST: 2,
  CONFUCIAN: 1,
  OTHER: 1,
};
const EXIT: Partial<Record<EmployeeExitReason, number>> = {
  CONTRACT_ENDED: 40,
  RESIGNATION: 35,
  TERMINATION: 10,
  RETIREMENT: 10,
  OTHER: 5,
};

const SITE_DEPT = /site|drilling|jetty|hse|engineering|operasional|supply|mining/i;

async function ensureSuperAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    out("⚠ SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY kosong → akun SUPER_ADMIN dilewati.");
    return;
  }
  const admin = createSupabaseAdmin(url, key);
  const existing = await admin.findUserByEmail(SA_EMAIL);
  const password =
    process.env.DEV_ACCOUNT_PASSWORD ?? `Lokal-${randomBytes(9).toString("base64url")}`;
  if (password.length < 12) throw new Error("DEV_ACCOUNT_PASSWORD minimal 12 karakter");
  const user = existing ?? (await admin.createConfirmedUser(SA_EMAIL, password));
  const prisma = getPrisma();
  const account = await prisma.account.upsert({
    where: { authUserId: user.id },
    create: { authUserId: user.id, email: SA_EMAIL, role: "SUPER_ADMIN", isActive: true },
    update: { role: "SUPER_ADMIN", isActive: true },
  });
  await prisma.auditLog.create({
    data: {
      actorAccountId: null,
      action: "iam.account.provision_script",
      entityType: "iam.account",
      entityId: account.id,
      after: { email: SA_EMAIL, role: "SUPER_ADMIN" },
      reason: "seed-dashboard-demo (akun SA lokal)",
    },
  });
  out(`✔ SUPER_ADMIN lokal: ${SA_EMAIL}`);
  if (existing) out("  user Auth sudah ada → password tidak diubah (pakai password sebelumnya).");
  else out(`  password: ${password}   ← simpan sekarang, tidak ditampilkan lagi`);
}

async function main() {
  const prisma = getPrisma();

  // 1. Bersihkan demo lama (relasi educations/personal ikut terhapus lewat cascade).
  const old = await prisma.employee.findMany({
    where: { employeeNumber: { startsWith: PREFIX } },
    select: { id: true },
  });
  if (old.length > 0) {
    const ids = old.map((e) => e.id);
    await prisma.education.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employeePersonal.deleteMany({ where: { employeeId: { in: ids } } });
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
    out(`• ${old.length} karyawan demo lama dihapus`);
  }

  // 2. Master data.
  for (const loc of [...SITE_LOCATIONS, ...OFFICE_LOCATIONS]) {
    const found = await prisma.workLocation.findFirst({ where: { name: loc.name } });
    if (!found) await prisma.workLocation.create({ data: { name: loc.name, city: loc.city } });
  }
  const [companies, statuses, grades, locations, positions] = await Promise.all([
    prisma.company.findMany({ where: { deletedAt: null, code: { in: ["ACP", "CD2"] } } }),
    prisma.employmentStatus.findMany({ where: { deletedAt: null, category: { not: null } } }),
    prisma.grade.findMany({ where: { deletedAt: null } }),
    prisma.workLocation.findMany({ where: { deletedAt: null } }),
    prisma.position.findMany({
      where: { deletedAt: null, department: { deletedAt: null } },
      include: { department: { select: { name: true, companyId: true } } },
    }),
  ]);
  const company = (code: string) => {
    const found = companies.find((c) => c.code === code);
    if (!found) throw new Error(`PT ${code} tidak ada (jalankan db:seed dulu)`);
    return found;
  };
  const acp = company("ACP");
  const cd2 = company("CD2");
  const statusByName = new Map(statuses.map((s) => [s.name, s.id]));
  const gradeByName = new Map(grades.map((g) => [g.name, g.id]));
  const loc = (name: string) => locations.find((l) => l.name === name)?.id ?? null;
  const sites = [...SITE_LOCATIONS.map((l) => l.name), "Site Tambang Kalimantan (Dummy)"]
    .map(loc)
    .filter((id): id is string => id !== null);
  const offices = [
    "Kantor Pusat Jakarta",
    "Kantor Pusat Jakarta",
    "Kantor Perwakilan Banjarmasin",
    "Kantor Cabang Bandung",
  ]
    .map(loc)
    .filter((id): id is string => id !== null);
  // Abaikan sisa data test (nama berakhiran kode acak heksadesimal).
  const usable = positions.filter((p) => !/\b[0-9a-f]{8}\b/.test(`${p.name} ${p.department.name}`));

  // 3. Karyawan.
  const usedNames = new Set<string>();
  const seq = { ACP: 0, CD2: 0 };
  const inactiveSlots = new Set<number>();
  while (inactiveSlots.size < 14) inactiveSlots.add(between(0, TOTAL - 1));
  const tally = { active: 0, inactive: 0 };

  for (let i = 0; i < TOTAL; i += 1) {
    const co = rand() < 0.84 ? acp : cd2;
    const level = weighted(LEVEL_WEIGHT) as Level;
    const pool = usable.filter(
      (p) => p.department.companyId === null || p.department.companyId === co.id,
    );
    const byLevel = pool.filter((p) => (p.level ?? "NONE") === level);
    const position = pick(byLevel.length > 0 ? byLevel : pool);
    const posLevel = (position.level ?? "NONE") as Level;
    const atSite = SITE_DEPT.test(position.department.name) || co.id === cd2.id;

    const gender = rand() < (atSite ? 0.8 : 0.55) ? "MALE" : "FEMALE";
    let fullName = "";
    do fullName = `${pick(gender === "MALE" ? MALE : FEMALE)} ${pick(LAST)}`;
    while (usedNames.has(fullName));
    usedNames.add(fullName);

    const categoryName = weighted(CATEGORY[posLevel]);
    const [minAge, maxAge] = AGE[posLevel];
    const age = between(minAge, maxAge);
    const birthYear = 2026 - age;
    // Magang & percobaan: baru masuk; lainnya menyebar 2008–2026 (tidak sebelum umur 19).
    const recent = categoryName === "Magang" || categoryName === "Karyawan Percobaan";
    const joinYear = recent ? between(2025, 2026) : between(Math.max(2008, birthYear + 19), 2026);
    const joinDate = joinYear === 2026 ? date(2026, between(1, 9)) : date(joinYear);
    const inactive = inactiveSlots.has(i) && !recent;
    const code = co.id === acp.id ? "ACP" : "CD2";
    seq[code] += 1;

    const location =
      rand() < 0.03 ? null : atSite ? pick(sites) : pick(offices.length > 0 ? offices : sites);
    const educationLevel = weighted(EDUCATION[posLevel]) as Edu;
    const married: MaritalStatus =
      age < 24
        ? "SINGLE"
        : weighted({
            SINGLE: age < 30 ? 45 : 12,
            MARRIED: 80,
            DIVORCED: 5,
            WIDOWED: age > 50 ? 6 : 1,
          });

    const employee = await prisma.employee.create({
      data: {
        employeeNumber: `${PREFIX}${code}-${String(seq[code]).padStart(4, "0")}`,
        fullName,
        gender,
        joinDate,
        companyId: co.id,
        employmentStatusId: statusByName.get(categoryName) ?? (statusByName.get("PKWT") as string),
        positionId: position.id,
        gradeId: gradeByName.get(GRADE[posLevel]) ?? null,
        workLocationId: location,
        onboardingStatus: "APPROVED",
        isActive: !inactive,
        ...(inactive
          ? {
              endDate: date(between(Math.max(joinYear, 2024), 2026), between(1, 9)),
              exitReason: weighted(EXIT),
            }
          : {}),
      },
      select: { id: true },
    });
    tally[inactive ? "inactive" : "active"] += 1;

    // Data pribadi (5% sengaja kosong → tampil "Belum diisi" di pivot).
    if (rand() > 0.05) {
      await prisma.employeePersonal.create({
        data: {
          employeeId: employee.id,
          birthDate: date(birthYear),
          birthPlace: pick([
            "Banjarmasin",
            "Martapura",
            "Jakarta",
            "Surabaya",
            "Medan",
            "Samarinda",
            "Pelaihari",
          ]),
          religion: weighted(RELIGION),
          maritalStatus: married,
        },
      });
    }

    // Riwayat pendidikan: jenjang tertinggi + jenjang sebelumnya (seperti data asli).
    if (educationLevel !== "NONE") {
      const top = educationLevel === "OTHER" ? null : EDU_ORDER.indexOf(educationLevel);
      const levels: EducationLevel[] =
        top === null ? ["OTHER"] : EDU_ORDER.slice(Math.max(0, top - 1), top + 1);
      for (const level of levels) {
        const finished =
          birthYear + 6 + (level === "OTHER" ? 12 : (EDU_ORDER.indexOf(level) + 1) * 3);
        await prisma.education.create({
          data: {
            employeeId: employee.id,
            level,
            schoolName: SCHOOL[level],
            major: ["S1", "S2", "S3", "D3", "D4"].includes(level) ? pick(MAJOR) : null,
            graduationYear: Math.min(finished, 2026),
          },
        });
      }
    }
  }

  out(`✔ ${TOTAL} karyawan demo dibuat (${tally.active} aktif, ${tally.inactive} nonaktif)`);
  await ensureSuperAdmin();
}

try {
  await main();
} catch (error) {
  out(`Gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
