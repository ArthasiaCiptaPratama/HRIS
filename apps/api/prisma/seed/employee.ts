import type {
  EmployeeExitReason,
  FamilyRelationship,
  Gender,
  MaritalStatus,
  PrismaClient,
  Religion,
} from "../../src/generated/prisma/client.ts";
import type { OrganizationIds } from "./organization.ts";

// Karyawan dummy (PLAN §5.7): nama khas Indonesia, NIK/NPWP/KK berformat valid tapi FIKTIF,
// rekening & HP berawalan 999/0812000 supaya jelas palsu. Tidak ada data orang sungguhan.

interface SeedEmployee {
  number: string;
  name: string;
  gender: Gender;
  position: string;
  status: string;
  grade: string;
  location: "Kantor Pusat Jakarta" | "Kantor Cabang Bandung";
  managerNumber: string | null;
  joinDate: string;
  birthDate: string;
  birthPlace: "Jakarta" | "Bandung";
  maritalStatus: MaritalStatus;
  religion: Religion;
  family: Array<{ name: string; relationship: FamilyRelationship; birthDate: string }>;
  education: { schoolName: string; major: string; graduationYear: number };
  training?: { trainingField: string; organizer: string; duration: string; trainingYear: number };
  /** D-035: pegawai nonaktif (arsip) — tanggal efektif keluar & alasan. */
  exit?: { endDate: string; reason: EmployeeExitReason };
}

const HQ = "Kantor Pusat Jakarta" as const;
const BDG = "Kantor Cabang Bandung" as const;

// Manajer ditulis lebih dulu supaya manager_id bisa diisi saat bawahan dibuat.
export const EMPLOYEES: SeedEmployee[] = [
  {
    number: "ACP-2019-0001",
    name: "Budi Santoso",
    gender: "MALE",
    position: "HR Manager",
    status: "Karyawan Tetap",
    grade: "Manajer",
    location: HQ,
    managerNumber: null,
    joinDate: "2019-03-01",
    birthDate: "1984-05-12",
    birthPlace: "Jakarta",
    maritalStatus: "MARRIED",
    religion: "ISLAM",
    family: [
      { name: "Ratna Santoso", relationship: "SPOUSE", birthDate: "1986-08-20" },
      { name: "Raka Santoso", relationship: "CHILD", birthDate: "2012-01-15" },
    ],
    education: {
      schoolName: "Universitas Contoh Jakarta",
      major: "Psikologi",
      graduationYear: 2006,
    },
    training: {
      trainingField: "Manajemen SDM Strategis",
      organizer: "Lembaga Pelatihan Contoh",
      duration: "3 hari",
      trainingYear: 2024,
    },
  },
  {
    number: "ACP-2020-0002",
    name: "Dewi Lestari",
    gender: "FEMALE",
    position: "Finance Manager",
    status: "Karyawan Tetap",
    grade: "Manajer",
    location: HQ,
    managerNumber: null,
    joinDate: "2020-01-06",
    birthDate: "1987-11-03",
    birthPlace: "Jakarta",
    maritalStatus: "MARRIED",
    religion: "CATHOLIC",
    family: [{ name: "Yohanes Pratama", relationship: "SPOUSE", birthDate: "1985-02-10" }],
    education: {
      schoolName: "Universitas Contoh Jakarta",
      major: "Akuntansi",
      graduationYear: 2009,
    },
    training: {
      trainingField: "Perpajakan PPh 21 TER",
      organizer: "Konsultan Pajak Contoh",
      duration: "2 hari",
      trainingYear: 2025,
    },
  },
  {
    number: "ACP-2020-0003",
    name: "Andi Wijaya",
    gender: "MALE",
    position: "IT Manager",
    status: "Karyawan Tetap",
    grade: "Manajer",
    location: HQ,
    managerNumber: null,
    joinDate: "2020-07-13",
    birthDate: "1988-02-25",
    birthPlace: "Bandung",
    maritalStatus: "MARRIED",
    religion: "BUDDHIST",
    family: [{ name: "Linda Wijaya", relationship: "SPOUSE", birthDate: "1990-06-30" }],
    education: {
      schoolName: "Institut Teknologi Contoh",
      major: "Teknik Informatika",
      graduationYear: 2010,
    },
  },
  {
    number: "ACP-2018-0004",
    name: "Hendra Gunawan",
    gender: "MALE",
    position: "Operations Manager",
    status: "Karyawan Tetap",
    grade: "Manajer",
    location: BDG,
    managerNumber: null,
    joinDate: "2018-09-03",
    birthDate: "1982-12-08",
    birthPlace: "Bandung",
    maritalStatus: "MARRIED",
    religion: "PROTESTANT",
    family: [
      { name: "Maria Gunawan", relationship: "SPOUSE", birthDate: "1984-04-14" },
      { name: "Kevin Gunawan", relationship: "CHILD", birthDate: "2010-09-09" },
    ],
    education: {
      schoolName: "Universitas Contoh Bandung",
      major: "Manajemen",
      graduationYear: 2005,
    },
    training: {
      trainingField: "K3 Umum",
      organizer: "Lembaga K3 Contoh",
      duration: "5 hari",
      trainingYear: 2023,
    },
  },
  {
    number: "ACP-2021-0005",
    name: "Maya Sari",
    gender: "FEMALE",
    position: "Sales Manager",
    status: "Karyawan Tetap",
    grade: "Manajer",
    location: HQ,
    managerNumber: null,
    joinDate: "2021-02-01",
    birthDate: "1989-07-19",
    birthPlace: "Jakarta",
    maritalStatus: "SINGLE",
    religion: "ISLAM",
    family: [{ name: "Sulastri", relationship: "MOTHER", birthDate: "1962-03-03" }],
    education: {
      schoolName: "Universitas Contoh Jakarta",
      major: "Ilmu Komunikasi",
      graduationYear: 2011,
    },
  },
  {
    number: "ACP-2022-0006",
    name: "Siti Rahmawati",
    gender: "FEMALE",
    position: "HR Staff",
    status: "Karyawan Tetap",
    grade: "Staf Senior",
    location: HQ,
    managerNumber: "ACP-2019-0001",
    joinDate: "2022-04-04",
    birthDate: "1995-09-22",
    birthPlace: "Jakarta",
    maritalStatus: "MARRIED",
    religion: "ISLAM",
    family: [{ name: "Ahmad Fauzi", relationship: "SPOUSE", birthDate: "1993-11-11" }],
    education: {
      schoolName: "Universitas Contoh Jakarta",
      major: "Manajemen SDM",
      graduationYear: 2017,
    },
  },
  {
    number: "ACP-2023-0007",
    name: "Agus Pratama",
    gender: "MALE",
    position: "GA Staff",
    status: "PKWT",
    grade: "Staf",
    location: HQ,
    managerNumber: "ACP-2019-0001",
    joinDate: "2023-08-01",
    birthDate: "1997-01-30",
    birthPlace: "Jakarta",
    maritalStatus: "SINGLE",
    religion: "ISLAM",
    family: [],
    education: {
      schoolName: "Politeknik Contoh",
      major: "Administrasi Bisnis",
      graduationYear: 2018,
    },
  },
  {
    number: "ACP-2022-0008",
    name: "Rina Wulandari",
    gender: "FEMALE",
    position: "Accounting Staff",
    status: "Karyawan Tetap",
    grade: "Staf",
    location: HQ,
    managerNumber: "ACP-2020-0002",
    joinDate: "2022-10-10",
    birthDate: "1996-04-17",
    birthPlace: "Bandung",
    maritalStatus: "SINGLE",
    religion: "HINDU",
    family: [],
    education: {
      schoolName: "Universitas Contoh Bandung",
      major: "Akuntansi",
      graduationYear: 2018,
    },
  },
  {
    number: "ACP-2021-0009",
    name: "Rizky Ramadhan",
    gender: "MALE",
    position: "Software Engineer",
    status: "Karyawan Tetap",
    grade: "Staf Senior",
    location: HQ,
    managerNumber: "ACP-2020-0003",
    joinDate: "2021-06-14",
    birthDate: "1996-10-05",
    birthPlace: "Jakarta",
    maritalStatus: "SINGLE",
    religion: "ISLAM",
    family: [],
    education: {
      schoolName: "Institut Teknologi Contoh",
      major: "Ilmu Komputer",
      graduationYear: 2018,
    },
    training: {
      trainingField: "Keamanan Aplikasi Web",
      organizer: "Komunitas Contoh",
      duration: "16 jam",
      trainingYear: 2025,
    },
  },
  {
    number: "ACP-2026-0010",
    name: "Fajar Nugroho",
    gender: "MALE",
    position: "Software Engineer",
    status: "Magang",
    grade: "Staf",
    location: HQ,
    managerNumber: "ACP-2020-0003",
    joinDate: "2026-07-01",
    birthDate: "2003-03-21",
    birthPlace: "Bandung",
    maritalStatus: "SINGLE",
    religion: "ISLAM",
    family: [],
    education: {
      schoolName: "Universitas Contoh Bandung",
      major: "Sistem Informasi",
      graduationYear: 2026,
    },
  },
  {
    number: "ACP-2026-0011",
    name: "Putri Maharani",
    gender: "FEMALE",
    position: "IT Support",
    status: "Karyawan Tetap",
    grade: "Staf",
    location: HQ,
    managerNumber: "ACP-2020-0003",
    joinDate: "2026-06-02",
    birthDate: "2000-12-01",
    birthPlace: "Jakarta",
    maritalStatus: "SINGLE",
    religion: "PROTESTANT",
    family: [],
    education: { schoolName: "Politeknik Contoh", major: "Teknik Komputer", graduationYear: 2021 },
  },
  {
    number: "ACP-2019-0012",
    name: "Yusuf Hidayat",
    gender: "MALE",
    position: "Operations Staff",
    status: "Karyawan Tetap",
    grade: "Supervisor",
    location: BDG,
    managerNumber: "ACP-2018-0004",
    joinDate: "2019-11-18",
    birthDate: "1991-06-06",
    birthPlace: "Bandung",
    maritalStatus: "MARRIED",
    religion: "ISLAM",
    family: [{ name: "Nurul Hidayat", relationship: "SPOUSE", birthDate: "1993-02-02" }],
    education: {
      schoolName: "Universitas Contoh Bandung",
      major: "Teknik Industri",
      graduationYear: 2013,
    },
  },
  {
    number: "ACP-2024-0013",
    name: "Wahyu Saputra",
    gender: "MALE",
    position: "Operations Staff",
    status: "PKWT",
    grade: "Staf",
    location: BDG,
    managerNumber: "ACP-2018-0004",
    joinDate: "2024-03-11",
    birthDate: "1999-08-08",
    birthPlace: "Bandung",
    maritalStatus: "SINGLE",
    religion: "ISLAM",
    family: [],
    education: { schoolName: "SMK Contoh Bandung", major: "Teknik Mesin", graduationYear: 2017 },
  },
  {
    number: "ACP-2022-0014",
    name: "Dimas Kurniawan",
    gender: "MALE",
    position: "Sales Executive",
    status: "Karyawan Tetap",
    grade: "Staf Senior",
    location: HQ,
    managerNumber: "ACP-2021-0005",
    joinDate: "2022-01-17",
    birthDate: "1994-02-14",
    birthPlace: "Jakarta",
    maritalStatus: "MARRIED",
    religion: "ISLAM",
    family: [{ name: "Anisa Kurniawan", relationship: "SPOUSE", birthDate: "1995-05-05" }],
    education: {
      schoolName: "Universitas Contoh Jakarta",
      major: "Manajemen Pemasaran",
      graduationYear: 2016,
    },
  },
  {
    number: "ACP-2025-0015",
    name: "Nur Aisyah",
    gender: "FEMALE",
    position: "Sales Executive",
    status: "PKWT",
    grade: "Staf",
    location: HQ,
    managerNumber: "ACP-2021-0005",
    joinDate: "2025-05-05",
    birthDate: "1998-10-27",
    birthPlace: "Jakarta",
    maritalStatus: "SINGLE",
    religion: "ISLAM",
    family: [],
    education: {
      schoolName: "Universitas Contoh Jakarta",
      major: "Ilmu Komunikasi",
      graduationYear: 2020,
    },
  },
  // D-035: contoh kategori Pekerja Harian & Outsourcing serta karyawan nonaktif.
  {
    number: "ACP-2026-0016",
    name: "Joko Susilo",
    gender: "MALE",
    position: "Operations Staff",
    status: "Pekerja Harian",
    grade: "Staf",
    location: BDG,
    managerNumber: "ACP-2018-0004",
    joinDate: "2026-07-01",
    birthDate: "2000-04-17",
    birthPlace: "Bandung",
    maritalStatus: "SINGLE",
    religion: "ISLAM",
    family: [],
    education: { schoolName: "SMA Contoh Bandung", major: "IPS", graduationYear: 2018 },
  },
  {
    number: "ACP-2026-0017",
    name: "Wulan Sari",
    gender: "FEMALE",
    position: "GA Staff",
    status: "Pekerja Harian",
    grade: "Staf",
    location: HQ,
    managerNumber: "ACP-2019-0001",
    joinDate: "2026-08-03",
    birthDate: "2001-12-02",
    birthPlace: "Jakarta",
    maritalStatus: "SINGLE",
    religion: "PROTESTANT",
    family: [],
    education: {
      schoolName: "SMK Contoh Jakarta",
      major: "Administrasi Perkantoran",
      graduationYear: 2019,
    },
  },
  {
    number: "ACP-2025-0018",
    name: "Hendra Gunawan",
    gender: "MALE",
    position: "IT Support",
    status: "Outsourcing",
    grade: "Staf",
    location: HQ,
    managerNumber: "ACP-2020-0003",
    joinDate: "2025-11-10",
    birthDate: "1996-06-21",
    birthPlace: "Jakarta",
    maritalStatus: "MARRIED",
    religion: "BUDDHIST",
    family: [{ name: "Lina Gunawan", relationship: "SPOUSE", birthDate: "1997-03-09" }],
    education: {
      schoolName: "Politeknik Contoh Jakarta",
      major: "Teknik Komputer",
      graduationYear: 2017,
    },
  },
  {
    number: "ACP-2025-0019",
    name: "Agus Salim",
    gender: "MALE",
    position: "GA Staff",
    status: "Outsourcing",
    grade: "Staf",
    location: BDG,
    managerNumber: "ACP-2019-0001",
    joinDate: "2025-02-03",
    birthDate: "1990-09-30",
    birthPlace: "Bandung",
    maritalStatus: "MARRIED",
    religion: "ISLAM",
    family: [{ name: "Siti Salim", relationship: "SPOUSE", birthDate: "1992-01-11" }],
    education: { schoolName: "SMA Contoh Bandung", major: "IPA", graduationYear: 2008 },
  },
  {
    number: "ACP-2023-0020",
    name: "Rina Marlina",
    gender: "FEMALE",
    position: "Accounting Staff",
    status: "PKWT",
    grade: "Staf",
    location: HQ,
    managerNumber: "ACP-2020-0002",
    joinDate: "2023-03-01",
    birthDate: "1997-07-19",
    birthPlace: "Jakarta",
    maritalStatus: "SINGLE",
    religion: "ISLAM",
    family: [],
    education: {
      schoolName: "Universitas Contoh Jakarta",
      major: "Akuntansi",
      graduationYear: 2019,
    },
    exit: { endDate: "2026-03-01", reason: "CONTRACT_ENDED" },
  },
  {
    number: "ACP-2021-0021",
    name: "Bayu Pratama",
    gender: "MALE",
    position: "Software Engineer",
    status: "Karyawan Tetap",
    grade: "Staf Senior",
    location: BDG,
    managerNumber: "ACP-2020-0003",
    joinDate: "2021-06-14",
    birthDate: "1993-11-05",
    birthPlace: "Bandung",
    maritalStatus: "MARRIED",
    religion: "HINDU",
    family: [{ name: "Putu Pratama", relationship: "SPOUSE", birthDate: "1994-08-12" }],
    education: {
      schoolName: "Institut Contoh Bandung",
      major: "Informatika",
      graduationYear: 2015,
    },
    exit: { endDate: "2026-06-30", reason: "RESIGNATION" },
  },
  // D-038: contoh kategori Karyawan Percobaan & Vendor. Ditaruh paling akhir supaya nomor fiktif
  // (NIK/KK/NPWP berbasis urutan) karyawan lama tidak berubah.
  {
    number: "ACP-2026-0022",
    name: "Nadia Putri",
    gender: "FEMALE",
    position: "HR Staff",
    status: "Karyawan Percobaan",
    grade: "Staf",
    location: HQ,
    managerNumber: "ACP-2019-0001",
    joinDate: "2026-08-17",
    birthDate: "2000-02-14",
    birthPlace: "Jakarta",
    maritalStatus: "SINGLE",
    religion: "ISLAM",
    family: [],
    education: {
      schoolName: "Universitas Contoh Jakarta",
      major: "Psikologi",
      graduationYear: 2022,
    },
  },
  {
    number: "ACP-2026-0023",
    name: "Yusuf Hidayat",
    gender: "MALE",
    position: "IT Support",
    status: "Vendor",
    grade: "Staf",
    location: BDG,
    managerNumber: "ACP-2020-0003",
    joinDate: "2026-05-04",
    birthDate: "1995-10-08",
    birthPlace: "Bandung",
    maritalStatus: "MARRIED",
    religion: "ISLAM",
    family: [{ name: "Aisyah Hidayat", relationship: "SPOUSE", birthDate: "1996-12-20" }],
    education: {
      schoolName: "Politeknik Contoh Bandung",
      major: "Teknik Jaringan",
      graduationYear: 2016,
    },
  },
];

const REGION_CODE = { Jakarta: "317101", Bandung: "327301" } as const;
const BANKS = ["BCA", "Bank Mandiri", "BNI", "BRI"];

const pad = (value: number, length: number) => String(value).padStart(length, "0");
const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Format NIK: 6 digit wilayah + DDMMYY lahir (DD + 40 untuk perempuan) + 4 digit urut. FIKTIF.
export function fakeKtpNumber(employee: SeedEmployee, index: number): string {
  const [year, month, day] = employee.birthDate.split("-").map(Number) as [number, number, number];
  const dd = employee.gender === "FEMALE" ? day + 40 : day;
  return `${REGION_CODE[employee.birthPlace]}${pad(dd, 2)}${pad(month, 2)}${pad(year % 100, 2)}${pad(index + 1, 4)}`;
}

function fakeKkNumber(employee: SeedEmployee, index: number): string {
  return `${REGION_CODE[employee.birthPlace]}050520${pad(index + 1, 4)}`;
}

function fakeNpwpNumber(index: number): string {
  const n = pad(index + 1, 3);
  return `09.${n}.${n}.${(index + 1) % 10}-017.000`;
}

// PLAN §3.3: email uji memakai plus-addressing milik developer, bukan alamat fiktif.
export function seedWorkEmail(base: string | undefined, employee: SeedEmployee): string | null {
  if (!base) return null;
  const [local, domain] = base.split("@");
  if (!local || !domain) throw new Error("SEED_EMAIL_BASE must look like name@domain");
  const slug = employee.name.toLowerCase().split(" ")[0];
  return `${local}+dev-${slug}-${employee.number.slice(-4)}@${domain}`;
}

export async function seedEmployees(
  prisma: PrismaClient,
  org: OrganizationIds,
  emailBase: string | undefined,
): Promise<number> {
  const idByNumber = new Map<string, string>();
  const pick = (map: Map<string, string>, key: string) => {
    const id = map.get(key);
    if (!id) throw new Error(`Seed reference not found: ${key}`);
    return id;
  };

  for (const [index, employee] of EMPLOYEES.entries()) {
    const managerId = employee.managerNumber ? pick(idByNumber, employee.managerNumber) : null;
    const work = {
      fullName: employee.name,
      workEmail: seedWorkEmail(emailBase, employee),
      phoneNumber: `081200000${pad(index + 1, 3)}`,
      emergencyPhone: `081300000${pad(index + 1, 3)}`,
      gender: employee.gender,
      joinDate: date(employee.joinDate),
      employmentStatusId: pick(org.statuses, employee.status),
      positionId: pick(org.positions, employee.position),
      workLocationId: pick(org.locations, employee.location),
      gradeId: pick(org.grades, employee.grade),
      managerId,
      isActive: !employee.exit,
      endDate: employee.exit ? date(employee.exit.endDate) : null,
      exitReason: employee.exit?.reason ?? null,
    };
    const personal = {
      ktpNumber: fakeKtpNumber(employee, index),
      npwpNumber: fakeNpwpNumber(index),
      kkNumber: fakeKkNumber(employee, index),
      birthPlace: employee.birthPlace,
      birthDate: date(employee.birthDate),
      ktpAddress: `Jl. Contoh Raya No. ${index + 1}, ${employee.birthPlace}`,
      domicileAddress: `Jl. Contoh Domisili No. ${index + 1}, ${employee.location.split(" ").pop()}`,
      maritalStatus: employee.maritalStatus,
      religion: employee.religion,
    };
    const bank = {
      bankName: BANKS[index % BANKS.length] as string,
      accountNumber: `99900000${pad(index + 1, 2)}`,
      accountHolder: employee.name.toUpperCase(),
    };

    const id = await prisma.$transaction(async (tx) => {
      const row = await tx.employee.upsert({
        where: { employeeNumber: employee.number },
        update: work,
        create: { employeeNumber: employee.number, ...work },
      });
      await tx.employeePersonal.upsert({
        where: { employeeId: row.id },
        update: personal,
        create: { employeeId: row.id, ...personal },
      });
      await tx.employeeBankAccount.upsert({
        where: { employeeId: row.id },
        update: bank,
        create: { employeeId: row.id, ...bank },
      });
      // Daftar anak diganti utuh supaya seed ulang tidak menggandakan baris.
      await tx.familyMember.deleteMany({ where: { employeeId: row.id } });
      await tx.education.deleteMany({ where: { employeeId: row.id } });
      await tx.training.deleteMany({ where: { employeeId: row.id } });
      await tx.employmentHistory.deleteMany({ where: { employeeId: row.id } });
      // D-035: riwayat minimal — masuk kerja, lalu nonaktif bila pegawai arsip.
      await tx.employmentHistory.create({
        data: {
          employeeId: row.id,
          changeType: "HIRED",
          effectiveDate: work.joinDate,
          toStatusId: work.employmentStatusId,
          toPositionId: work.positionId,
        },
      });
      if (employee.exit) {
        await tx.employmentHistory.create({
          data: {
            employeeId: row.id,
            changeType: "DEACTIVATED",
            effectiveDate: date(employee.exit.endDate),
            fromStatusId: work.employmentStatusId,
            exitReason: employee.exit.reason,
          },
        });
      }
      if (employee.family.length > 0) {
        await tx.familyMember.createMany({
          data: employee.family.map((member) => ({
            employeeId: row.id,
            name: member.name,
            relationship: member.relationship,
            birthDate: date(member.birthDate),
          })),
        });
      }
      await tx.education.create({ data: { employeeId: row.id, ...employee.education } });
      if (employee.training) {
        await tx.training.create({ data: { employeeId: row.id, ...employee.training } });
      }
      return row.id;
    });
    idByNumber.set(employee.number, id);
  }

  return EMPLOYEES.length;
}
