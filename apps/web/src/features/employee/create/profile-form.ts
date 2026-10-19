import {
  type DrivingLicenseType,
  type EmployeeProfileInput,
  employeeProfileInputSchema,
} from "@hris/shared";

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

export interface ChildState {
  name: string;
  gender: string;
  birthPlace: string;
  birthDate: string;
  education: string;
  occupation: string;
}
export interface ParentState {
  name: string;
  age: string;
  education: string;
  occupation: string;
  deceased: boolean;
}
export interface SiblingState {
  name: string;
  age: string;
  education: string;
  occupation: string;
  relationDetail: string;
}
export interface FamilyState {
  spouse: {
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
  },
  bank: { bankName: "", accountNumber: "", accountHolder: "" },
  educations: [emptyEducation()],
  certifications: [],
});

const filled = (row: object) =>
  Object.values(row).some((v) => (typeof v === "string" ? v.trim() !== "" : v === true));
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const opt = (v: string) => (v === "" ? null : v);

/** State → body `profile` API. Bagian tanpa izin tidak dikirim; baris kosong dibuang. */
export function toProfileInput(
  s: ProfileState,
  can: { personal: boolean; bank: boolean },
): EmployeeProfileInput {
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
  const { ktpSameAsDomicile: _same, licenses, religion, maritalStatus, ...text } = p;
  const personal = {
    ...text,
    ...ktp,
    // Nilai pilihan dari daftar baku (RELIGIONS / MARITAL_STATUSES); dicek ulang skema.
    religion: opt(religion) as never,
    maritalStatus: opt(maritalStatus) as never,
    drivingLicenses: licenses,
    emergencyContactAddress: s.emergency.address,
    emergencyContact2Name: s.emergency.name2,
    emergencyContact2Relationship: s.emergency.relationship2,
    emergencyContact2Phone: s.emergency.phone2,
    emergencyContact2Address: s.emergency.address2,
  };
  const f = s.family;
  const family: NonNullable<EmployeeProfileInput["family"]> = [];
  if (filled(f.spouse)) family.push({ relationship: "SPOUSE", ...f.spouse });
  for (const c of f.children.filter(filled))
    family.push({ relationship: "CHILD", ...c, gender: opt(c.gender) as "MALE" | "FEMALE" | null });
  for (const [relationship, m] of [
    ["FATHER", f.father],
    ["MOTHER", f.mother],
  ] as const)
    if (filled(m))
      family.push({
        relationship,
        name: m.name,
        ageAtEntry: num(m.age),
        education: m.education,
        occupation: m.occupation,
        isDeceased: m.deceased,
      });
  for (const sib of f.siblings.filter(filled))
    family.push({
      relationship: "SIBLING",
      name: sib.name,
      ageAtEntry: num(sib.age),
      education: sib.education,
      occupation: sib.occupation,
      relationDetail: sib.relationDetail,
    });
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
