import {
  DRIVING_LICENSE_TYPES,
  type DrivingLicenseType,
  type EmployeeProfileInput,
  type EmployeeProfileUpdateInput,
  employeeProfileInputSchema,
  employeeProfileUpdateSchema,
} from "@hris/shared";
import type { EmployeeDetail } from "../schemas";

// EMP-D2: state form profil Tambah karyawan bertahap (urutan & label mengikuti Google Form "Formulir
// Data Karyawan"). Semua nilai string supaya mudah diikat ke input; diubah ke body API di
// `toProfileInput` dan divalidasi dengan skema bersama (`employeeProfileInputSchema`).

export type StepKey =
  | "work"
  | "personal"
  | "emergency"
  | "family"
  | "bank"
  | "education"
  | "summary";

export interface PersonalState {
  nickname: string;
  originCity: string;
  ptkpStatus: string;
  birthPlace: string;
  birthDate: string;
  religion: string;
  maritalStatus: string;
  nationality: string;
  ethnicity: string;
  bloodType: string;
  personalEmail: string;
  ktpNumber: string;
  kkNumber: string;
  npwpNumber: string;
  bpjsEmploymentNumber: string;
  bpjsHealthNumber: string;
  domicileAddress: string;
  domicileVillage: string;
  domicileDistrict: string;
  domicileCity: string;
  domicileProvince: string;
  ktpSameAsDomicile: boolean;
  ktpAddress: string;
  ktpVillage: string;
  ktpDistrict: string;
  ktpCity: string;
  ktpProvince: string;
  licenses: { type: DrivingLicenseType; number: string }[];
}

export interface EmergencyState {
  /** Alamat kontak darurat 1 (nama/hubungan/HP ada di data kerja). */
  address: string;
  name2: string;
  relationship2: string;
  phone2: string;
  address2: string;
}

/** Anggota keluarga apa adanya dari detail (kolom yang tidak tampil di form tetap terjaga saat disimpan). */
export type FamilyRaw = NonNullable<EmployeeProfileInput["family"]>[number];

export interface ChildState {
  base?: FamilyRaw;
  name: string;
  gender: string;
  birthPlace: string;
  birthDate: string;
  education: string;
  occupation: string;
}
export interface ParentState {
  base?: FamilyRaw;
  name: string;
  age: string;
  education: string;
  occupation: string;
  deceased: boolean;
}
export interface SiblingState {
  base?: FamilyRaw;
  name: string;
  age: string;
  education: string;
  occupation: string;
  relationDetail: string;
}
export interface FamilyState {
  spouse: {
    base?: FamilyRaw;
    name: string;
    birthPlace: string;
    birthDate: string;
    occupation: string;
    workAddress: string;
  };
  children: ChildState[];
  father: ParentState;
  mother: ParentState;
  siblings: SiblingState[];
  /** Anggota yang tidak punya tempat di form (hubungan "Lainnya", pasangan/ayah/ibu kedua) — disimpan apa adanya. */
  others: FamilyRaw[];
}

export interface EducationState {
  level: string;
  schoolName: string;
  major: string;
  entryYear: string;
  graduationYear: string;
}
export interface CertificationState {
  name: string;
  number: string;
  year: string;
}

export interface ProfileState {
  personal: PersonalState;
  emergency: EmergencyState;
  family: FamilyState;
  bank: { bankName: string; accountNumber: string; accountHolder: string };
  educations: EducationState[];
  certifications: CertificationState[];
}

const parent = (): ParentState => ({
  name: "",
  age: "",
  education: "",
  occupation: "",
  deceased: false,
});
export const emptyChild = (): ChildState => ({
  name: "",
  gender: "",
  birthPlace: "",
  birthDate: "",
  education: "",
  occupation: "",
});
export const emptySibling = (): SiblingState => ({
  name: "",
  age: "",
  education: "",
  occupation: "",
  relationDetail: "",
});
export const emptyEducation = (): EducationState => ({
  level: "",
  schoolName: "",
  major: "",
  entryYear: "",
  graduationYear: "",
});
export const emptyCertification = (): CertificationState => ({ name: "", number: "", year: "" });

export const emptyProfile = (): ProfileState => ({
  personal: {
    nickname: "",
    originCity: "",
    ptkpStatus: "",
    birthPlace: "",
    birthDate: "",
    religion: "",
    maritalStatus: "",
    nationality: "Indonesia",
    ethnicity: "",
    bloodType: "",
    personalEmail: "",
    ktpNumber: "",
    kkNumber: "",
    npwpNumber: "",
    bpjsEmploymentNumber: "",
    bpjsHealthNumber: "",
    domicileAddress: "",
    domicileVillage: "",
    domicileDistrict: "",
    domicileCity: "",
    domicileProvince: "",
    ktpSameAsDomicile: false,
    ktpAddress: "",
    ktpVillage: "",
    ktpDistrict: "",
    ktpCity: "",
    ktpProvince: "",
    licenses: [],
  },
  emergency: { address: "", name2: "", relationship2: "", phone2: "", address2: "" },
  family: {
    spouse: { name: "", birthPlace: "", birthDate: "", occupation: "", workAddress: "" },
    children: [],
    father: parent(),
    mother: parent(),
    siblings: [],
    others: [],
  },
  bank: { bankName: "", accountNumber: "", accountHolder: "" },
  educations: [emptyEducation()],
  certifications: [],
});

const filled = (row: object) =>
  Object.entries(row).some(
    ([k, v]) => k !== "base" && (typeof v === "string" ? v.trim() !== "" : v === true),
  );
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const opt = (v: string) => (v === "" ? null : v);

/** Keluarga terstruktur → daftar anggota (kolom asli `base` tetap, isian form menimpa). */
function familyInput(f: FamilyState): NonNullable<EmployeeProfileInput["family"]> {
  const family: NonNullable<EmployeeProfileInput["family"]> = [];
  const keep = (base: FamilyRaw | undefined) => {
    const { relationship: _r, ...rest } = base ?? ({} as FamilyRaw);
    return rest;
  };
  if (filled(f.spouse)) {
    const { base, ...spouse } = f.spouse;
    family.push({ ...keep(base), relationship: "SPOUSE", ...spouse });
  }
  for (const { base, ...c } of f.children.filter(filled))
    family.push({
      ...keep(base),
      relationship: "CHILD",
      ...c,
      gender: opt(c.gender) as "MALE" | "FEMALE" | null,
    });
  for (const [relationship, m] of [
    ["FATHER", f.father],
    ["MOTHER", f.mother],
  ] as const)
    if (filled(m))
      family.push({
        ...keep(m.base),
        relationship,
        name: m.name,
        ageAtEntry: num(m.age),
        education: m.education,
        occupation: m.occupation,
        isDeceased: m.deceased,
      });
  for (const sib of f.siblings.filter(filled))
    family.push({
      ...keep(sib.base),
      relationship: "SIBLING",
      name: sib.name,
      ageAtEntry: num(sib.age),
      education: sib.education,
      occupation: sib.occupation,
      relationDetail: sib.relationDetail,
    });
  family.push(...f.others);
  return family;
}

/** State → body `profile` API. Bagian tanpa izin tidak dikirim; baris kosong dibuang. */
/** Isian pribadi + kontak darurat (alamat & kontak ke-2) → bagian `personal` body API. */
function personalInput(s: ProfileState) {
  const p = s.personal;
  const ktp = p.ktpSameAsDomicile
    ? {
        ktpAddress: p.domicileAddress,
        ktpVillage: p.domicileVillage,
        ktpDistrict: p.domicileDistrict,
        ktpCity: p.domicileCity,
        ktpProvince: p.domicileProvince,
      }
    : {
        ktpAddress: p.ktpAddress,
        ktpVillage: p.ktpVillage,
        ktpDistrict: p.ktpDistrict,
        ktpCity: p.ktpCity,
        ktpProvince: p.ktpProvince,
      };
  const { ktpSameAsDomicile: _same, licenses, religion, maritalStatus, ptkpStatus, ...text } = p;
  const personal = {
    ...text,
    ...ktp,
    // Nilai pilihan dari daftar baku (RELIGIONS / MARITAL_STATUSES); dicek ulang skema.
    religion: opt(religion) as never,
    maritalStatus: opt(maritalStatus) as never,
    ptkpStatus: opt(ptkpStatus) as never,
    drivingLicenses: licenses,
    emergencyContactAddress: s.emergency.address,
    emergencyContact2Name: s.emergency.name2,
    emergencyContact2Relationship: s.emergency.relationship2,
    emergencyContact2Phone: s.emergency.phone2,
    emergencyContact2Address: s.emergency.address2,
  };
  return personal;
}

export function toProfileInput(
  s: ProfileState,
  can: { personal: boolean; bank: boolean },
): EmployeeProfileInput {
  const personal = personalInput(s);
  const licenses = s.personal.licenses;
  const family = familyInput(s.family);
  return {
    ...(can.personal && (filled(personal) || licenses.length > 0) ? { personal } : {}),
    family: can.personal ? family : [],
    educations: s.educations.filter(filled).map((e) => ({
      level: (opt(e.level) as never) ?? null,
      schoolName: e.schoolName,
      major: e.major,
      entryYear: num(e.entryYear),
      graduationYear: num(e.graduationYear),
    })),
    certifications: s.certifications
      .filter(filled)
      .map((c) => ({ name: c.name, number: c.number, year: num(c.year) })),
    ...(can.bank && filled(s.bank) ? { bank: s.bank } : {}),
  };
}

const STEP_OF: Record<string, StepKey> = {
  personal: "personal",
  family: "family",
  educations: "education",
  certifications: "education",
  bank: "bank",
};

/** Validasi di browser (skema sama dengan API) → pesan pertama + langkahnya. */
export function validateProfile(input: EmployeeProfileInput) {
  const parsed = employeeProfileInputSchema.safeParse(input);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const [section, , field] = issue?.path.map(String) ?? [];
  const key = String(issue?.path[1] ?? "");
  const step: StepKey =
    section === "personal" && key.startsWith("emergency")
      ? "emergency"
      : (STEP_OF[section ?? ""] ?? "personal");
  return { step, message: issue?.message ?? "Data tidak valid.", field };
}

// ── EMP-D4: ubah data dari detail karyawan ───────────────────────────────────────────────────

const str = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

/** Detail karyawan → state form (untuk Ubah data). */
export function profileFromDetail(e: EmployeeDetail): ProfileState {
  const base = emptyProfile();
  const p = e.personal;
  const numbers = (p?.drivingLicenseNumbers ?? {}) as Record<string, string>;
  const licenses = (p?.drivingLicenseTypes ?? [])
    .filter((t): t is DrivingLicenseType =>
      (DRIVING_LICENSE_TYPES as readonly string[]).includes(t),
    )
    .map((type) => ({ type, number: numbers[type] ?? "" }));
  const raw = (m: NonNullable<EmployeeDetail["familyMembers"]>[number]): FamilyRaw => ({
    relationship: m.relationship as FamilyRaw["relationship"],
    name: m.name,
    gender: (m.gender ?? null) as FamilyRaw["gender"],
    birthPlace: m.birthPlace ?? null,
    birthDate: m.birthDate ?? null,
    education: m.education ?? null,
    occupation: m.occupation ?? null,
    workAddress: m.workAddress ?? null,
    relationDetail: m.relationDetail ?? null,
    ageAtEntry: m.ageAtEntry ?? null,
    isDeceased: m.isDeceased ?? false,
    phoneNumber: m.phoneNumber ?? null,
    address: m.address ?? null,
  });
  const members = (e.familyMembers ?? []).map(raw);
  const take = (relationship: string) => {
    const i = members.findIndex((m) => m.relationship === relationship);
    return i >= 0 ? members.splice(i, 1)[0] : undefined;
  };
  const spouse = take("SPOUSE");
  const father = take("FATHER");
  const mother = take("MOTHER");
  const all = (relationship: string) => {
    const picked = members.filter((m) => m.relationship === relationship);
    for (const m of picked) members.splice(members.indexOf(m), 1);
    return picked;
  };
  const parent = (m: FamilyRaw | undefined): ParentState =>
    m
      ? {
          base: m,
          name: m.name,
          age: str(m.ageAtEntry),
          education: str(m.education),
          occupation: str(m.occupation),
          deceased: Boolean(m.isDeceased),
        }
      : { name: "", age: "", education: "", occupation: "", deceased: false };
  return {
    personal: {
      ...base.personal,
      nickname: str(p?.nickname),
      originCity: str(p?.originCity),
      ptkpStatus: str(p?.ptkpStatus),
      birthPlace: str(p?.birthPlace),
      birthDate: str(p?.birthDate),
      religion: str(p?.religion),
      maritalStatus: str(p?.maritalStatus),
      nationality: str(p?.nationality),
      ethnicity: str(p?.ethnicity),
      bloodType: str(p?.bloodType),
      personalEmail: str(p?.personalEmail),
      ktpNumber: str(p?.ktpNumber),
      kkNumber: str(p?.kkNumber),
      npwpNumber: str(p?.npwpNumber),
      bpjsEmploymentNumber: str(p?.bpjsEmploymentNumber),
      bpjsHealthNumber: str(p?.bpjsHealthNumber),
      domicileAddress: str(p?.domicileAddress),
      domicileVillage: str(p?.domicileVillage),
      domicileDistrict: str(p?.domicileDistrict),
      domicileCity: str(p?.domicileCity),
      domicileProvince: str(p?.domicileProvince),
      ktpAddress: str(p?.ktpAddress),
      ktpVillage: str(p?.ktpVillage),
      ktpDistrict: str(p?.ktpDistrict),
      ktpCity: str(p?.ktpCity),
      ktpProvince: str(p?.ktpProvince),
      licenses,
    },
    emergency: {
      address: str(p?.emergencyContactAddress),
      name2: str(p?.emergencyContact2Name),
      relationship2: str(p?.emergencyContact2Relationship),
      phone2: str(p?.emergencyContact2Phone),
      address2: str(p?.emergencyContact2Address),
    },
    family: {
      spouse: spouse
        ? {
            base: spouse,
            name: spouse.name,
            birthPlace: str(spouse.birthPlace),
            birthDate: str(spouse.birthDate),
            occupation: str(spouse.occupation),
            workAddress: str(spouse.workAddress),
          }
        : base.family.spouse,
      children: all("CHILD").map((m) => ({
        base: m,
        name: m.name,
        gender: str(m.gender),
        birthPlace: str(m.birthPlace),
        birthDate: str(m.birthDate),
        education: str(m.education),
        occupation: str(m.occupation),
      })),
      father: parent(father),
      mother: parent(mother),
      siblings: all("SIBLING").map((m) => ({
        base: m,
        name: m.name,
        age: str(m.ageAtEntry),
        education: str(m.education),
        occupation: str(m.occupation),
        relationDetail: str(m.relationDetail),
      })),
      others: members,
    },
    bank: {
      bankName: str(e.bankAccount?.bankName),
      accountNumber: str(e.bankAccount?.accountNumber),
      accountHolder: str(e.bankAccount?.accountHolder),
    },
    educations: [],
    certifications: [],
  };
}

/**
 * Body `PATCH /employees/{id}/profile`: hanya bagian yang berubah dibanding `initial` dan boleh diubah.
 * null = tidak ada perubahan.
 */
export function toProfileUpdate(
  current: ProfileState,
  initial: ProfileState,
  can: { personal: boolean; bank: boolean },
): EmployeeProfileUpdateInput | null {
  const sections = (s: ProfileState) => {
    const all = toProfileInput(s, { personal: true, bank: true });
    return {
      personal: JSON.stringify(personalInput(s)),
      family: JSON.stringify(all.family ?? []),
      bank: JSON.stringify(s.bank),
      body: { personal: personalInput(s), family: all.family ?? [], bank: s.bank },
    };
  };
  const now = sections(current);
  const before = sections(initial);
  const out: EmployeeProfileUpdateInput = {};
  if (can.personal && now.personal !== before.personal) out.personal = now.body.personal;
  if (can.personal && now.family !== before.family) out.family = now.body.family;
  if (can.bank && now.bank !== before.bank && filled(current.bank)) out.bank = now.body.bank;
  return Object.keys(out).length ? out : null;
}

/** Validasi body ubah (skema sama dengan API) → pesan pertama + langkahnya. */
export function validateProfileUpdate(input: EmployeeProfileUpdateInput) {
  const parsed = employeeProfileUpdateSchema.safeParse(input);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const [section] = issue?.path.map(String) ?? [];
  const key = String(issue?.path[1] ?? "");
  const step: StepKey =
    section === "personal" && key.startsWith("emergency")
      ? "emergency"
      : (STEP_OF[section ?? ""] ?? "personal");
  return { step, message: issue?.message ?? "Data tidak valid." };
}
