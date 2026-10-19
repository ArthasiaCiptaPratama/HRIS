import { GENDER_LABELS, MARITAL_STATUS_LABELS, RELIGION_LABELS } from "@hris/shared";
import type { EmployeeDetail } from "./employee.schema.ts";

// Print data karyawan (2026-10-19): nilai isian "Formulir Data Karyawan" dari detail view=print. Data pribadi,
// keluarga, & rekening kosong bila pencetak tidak berhak (detail sudah menyaringnya). Digambar ke PDF oleh
// `employee-form-pdf.ts`.

const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Jumlah baris tabel di template (tetap); data lebih banyak → baris terakhir "+n lainnya". */
export const EMPLOYEE_FORM_ROWS = {
  children: 5,
  parents: 2,
  siblings: 5,
  contacts: 2,
  educations: 3,
  certifications: 11,
} as const;

export const longDate = (iso: string | null | undefined) =>
  iso ? `${Number(iso.slice(8, 10))} ${BULAN[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "";
const placeDate = (place: string | null | undefined, date: string | null | undefined) =>
  [place, longDate(date)].filter(Boolean).join(", ");
const text = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

type Family = NonNullable<EmployeeDetail["familyMembers"]>[number];

/** Usia anggota keluarga: dari tanggal lahir per `todayIso`, atau usia saat didata; "Alm." bila meninggal. */
export function familyAge(member: Family, todayIso: string): string {
  if (member.isDeceased) return "Alm.";
  if (member.birthDate) {
    const [y, m, d] = member.birthDate.split("-").map(Number) as [number, number, number];
    const [ty, tm, td] = todayIso.split("-").map(Number) as [number, number, number];
    return String(ty - y - (tm < m || (tm === m && td < d) ? 1 : 0));
  }
  return text(member.ageAtEntry);
}

/** Data organisasi yang tidak ada di detail karyawan (divisi = unit berjenis Divisi di atas departemen). */
export interface EmployeeFormOrg {
  division: string | null;
}

/** Nilai isian formulir dari detail karyawan (view=print). */
export function employeeFormData(
  e: EmployeeDetail,
  todayIso: string,
  org: EmployeeFormOrg = { division: null },
) {
  const p = e.personal;
  const family = e.familyMembers ?? [];
  const of = (relationship: Family["relationship"]) =>
    family.filter((m) => m.relationship === relationship);
  const spouse = of("SPOUSE")[0];
  const licenses = (p?.drivingLicenseNumbers ?? {}) as Record<string, string | undefined>;
  return {
    company: e.company.name,
    fullName: e.fullName,
    employeeNumber: text(e.employeeNumber),
    domicileAddress: text(p?.domicileAddress),
    ktpAddress: text(p?.ktpAddress),
    phone: text(e.phoneNumber),
    email: text(e.workEmail ?? p?.personalEmail),
    birth: placeDate(p?.birthPlace, p?.birthDate),
    religion: p?.religion
      ? (RELIGION_LABELS[p.religion as keyof typeof RELIGION_LABELS] ?? p.religion)
      : "",
    nationality: text(p?.nationality),
    ethnicity: text(p?.ethnicity),
    marital: p?.maritalStatus
      ? (MARITAL_STATUS_LABELS[p.maritalStatus as keyof typeof MARITAL_STATUS_LABELS] ??
        p.maritalStatus)
      : "",
    ktpNumber: text(p?.ktpNumber),
    bloodType: text(p?.bloodType),
    gender: e.gender ? GENDER_LABELS[e.gender] : "",
    simA: text(licenses.A),
    simC: text(licenses.C),
    npwp: text(p?.npwpNumber),
    domVillage: text(p?.domicileVillage),
    domDistrict: text(p?.domicileDistrict),
    domCity: text(p?.domicileCity),
    domProvince: text(p?.domicileProvince),
    ktpVillage: text(p?.ktpVillage),
    ktpDistrict: text(p?.ktpDistrict),
    ktpCity: text(p?.ktpCity),
    ktpProvince: text(p?.ktpProvince),
    spouseName: text(spouse?.name),
    spouseBirth: spouse ? placeDate(spouse.birthPlace, spouse.birthDate) : "",
    spouseOccupation: text(spouse?.occupation),
    spouseWorkAddress: text(spouse?.workAddress),
    children: of("CHILD").map((m) => ({
      name: m.name,
      gender: m.gender === "MALE" ? "L" : m.gender === "FEMALE" ? "P" : "",
      birth: placeDate(m.birthPlace, m.birthDate),
      education: text(m.education),
      occupation: text(m.occupation),
    })),
    parents: [...of("FATHER"), ...of("MOTHER")].map((m) => ({
      name: m.name,
      age: familyAge(m, todayIso),
      education: text(m.education),
      occupation: text(m.occupation),
    })),
    siblings: of("SIBLING").map((m) => ({
      name: m.name,
      age: familyAge(m, todayIso),
      education: text(m.education),
      occupation: text(m.occupation),
      relation: text(m.relationDetail),
    })),
    department: text(e.department?.name),
    division: text(org.division),
    position: text(e.position.name),
    joinDate: longDate(e.joinDate),
    bankName: text(e.bankAccount?.bankName),
    bankHolder: text(e.bankAccount?.accountHolder),
    bankAccount: text(e.bankAccount?.accountNumber),
    contacts: [
      {
        name: text(e.emergencyContactName),
        relation: text(e.emergencyContactRelationship),
        phone: text(e.emergencyPhone),
        address: text(p?.emergencyContactAddress),
      },
      {
        name: text(p?.emergencyContact2Name),
        relation: text(p?.emergencyContact2Relationship),
        phone: text(p?.emergencyContact2Phone),
        address: text(p?.emergencyContact2Address),
      },
    ].filter((c) => c.name || c.phone),
    educations: e.educations.map((x) => ({
      level: text(x.level),
      school: [x.schoolName, x.major].filter(Boolean).join(" - "),
      from: text(x.entryYear),
      to: text(x.graduationYear),
    })),
    certifications: e.trainings.map((t) => ({
      type: text(t.trainingField),
      number: text(t.certificateNumber),
      year: text(t.trainingYear),
    })),
  };
}

export type EmployeeFormData = ReturnType<typeof employeeFormData>;

export type PhotoFormat = "jpeg" | "png";

/** Format & ukuran piksel dari header berkas; null bila bukan JPEG/PNG (mis. WebP — tidak didukung pdf-lib). */
export function imageInfo(
  bytes: Uint8Array,
): { format: PhotoFormat; width: number; height: number } | null {
  const b = bytes;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { format: "png", width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] as number;
    const length = ((b[i + 2] as number) << 8) | (b[i + 3] as number);
    // SOF0–SOF15 kecuali DHT (C4), JPG (C8), DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        format: "jpeg",
        height: ((b[i + 5] as number) << 8) | (b[i + 6] as number),
        width: ((b[i + 7] as number) << 8) | (b[i + 8] as number),
      };
    }
    i += 2 + length;
  }
  return null;
}
