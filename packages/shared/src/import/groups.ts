// D-059 lanjutan: bagian berulang Formulir Data Karyawan (Google Form → Sheet → Import) sebagai field
// berkelompok — pasangan, anak 1–5, orang tua, saudara 1–5, pendidikan 1–3, sertifikasi, No. SIM per
// jenis. Header generik ("Usia", "Pendidikan", "No. Sertifikasi") dikenali dari kolom penandanya
// (`detect.ts`), bukan sinonim; HR tetap bisa memilihnya manual di dropdown (berkelompok).

import {
  DRIVING_LICENSE_LABELS,
  DRIVING_LICENSE_TYPES,
  type DrivingLicenseType,
} from "../personal-fields.ts";
import type { ImportFieldDef } from "./types.ts";

export const FAMILY_SLOTS = [1, 2, 3, 4, 5] as const;
export const EDUCATION_SLOTS = [1, 2, 3] as const;
type FamilySlot = (typeof FAMILY_SLOTS)[number];
type EducationSlot = (typeof EDUCATION_SLOTS)[number];

/** Sertifikasi di Form: kunci field + nama (disimpan sebagai bidang pelatihan, Arsip › Pelatihan). */
export const CERTIFICATIONS = [
  { key: "K3Umum", name: "Sertifikasi K3 Umum" },
  { key: "Pop", name: "Sertifikasi Pengawas Operasional Pertama (POP)" },
  { key: "Pom", name: "Sertifikasi Pengawas Operasional Madya (POM)" },
  { key: "Pou", name: "Sertifikasi Pengawas Operasional Utama (POU)" },
  { key: "SmkpMinerba", name: "SMKP Minerba" },
  { key: "Smk3Kemnaker", name: "SMK3 Kemnaker" },
  { key: "Proper", name: "PROPER" },
  { key: "Iso45001", name: "ISO 45001" },
  { key: "Iso14001", name: "ISO 14001" },
  { key: "Iso9001", name: "ISO 9001" },
  { key: "Iso50001", name: "ISO 50001" },
] as const;
export type CertificationKey = (typeof CERTIFICATIONS)[number]["key"];

type SpouseKey = `spouse${"Name" | "Occupation" | "WorkAddress" | "BirthPlace" | "BirthDate"}`;
type ChildKey = `child${FamilySlot}${"Name" | "Gender" | "BirthPlace" | "BirthDate" | "Education"}`;
type ParentKey = `${"father" | "mother"}${"Name" | "Age" | "Education" | "Occupation"}`;
type SiblingKey = `sibling${FamilySlot}${"Name" | "Age" | "Education" | "Occupation"}`;
type EducationKey =
  `education${EducationSlot}${"Level" | "School" | "EntryYear" | "GraduationYear"}`;
type CertKey = `cert${CertificationKey}${"Number" | "Year"}`;
type SimKey = `simNumber${DrivingLicenseType}`;
export type GroupFieldKey =
  | SpouseKey
  | ChildKey
  | ParentKey
  | SiblingKey
  | EducationKey
  | CertKey
  | SimKey
  | "emergencyContactAddress";

const ATTR_LABEL: Record<string, string> = {
  Name: "Nama",
  Occupation: "Pekerjaan",
  WorkAddress: "Alamat kerja",
  BirthPlace: "Tempat lahir",
  BirthDate: "Tanggal lahir",
  Gender: "Jenis kelamin",
  Education: "Pendidikan",
  Age: "Usia",
  Level: "Jenjang",
  School: "Sekolah/universitas",
  EntryYear: "Tahun masuk",
  GraduationYear: "Tahun lulus",
  Number: "No. sertifikat",
  Year: "Tahun terbit",
};

function buildGroupFields(): Record<GroupFieldKey, ImportFieldDef> {
  const out: Record<string, ImportFieldDef> = {};
  const add = (
    key: string,
    group: string,
    attr: string,
    section: ImportFieldDef["section"],
    label?: string,
  ) => {
    out[key] = { label: label ?? `${group}: ${ATTR_LABEL[attr]}`, group, section, synonyms: [] };
  };
  for (const attr of ["Name", "Occupation", "WorkAddress", "BirthPlace", "BirthDate"])
    add(`spouse${attr}`, "Pasangan", attr, "family");
  for (const n of FAMILY_SLOTS)
    for (const attr of ["Name", "Gender", "BirthPlace", "BirthDate", "Education"])
      add(`child${n}${attr}`, `Anak ${n}`, attr, "family");
  for (const [who, group] of [
    ["father", "Ayah"],
    ["mother", "Ibu"],
  ] as const)
    for (const attr of ["Name", "Age", "Education", "Occupation"])
      add(`${who}${attr}`, group, attr, "family");
  for (const n of FAMILY_SLOTS)
    for (const attr of ["Name", "Age", "Education", "Occupation"])
      add(`sibling${n}${attr}`, `Saudara ${n}`, attr, "family");
  for (const n of EDUCATION_SLOTS)
    for (const attr of ["Level", "School", "EntryYear", "GraduationYear"])
      add(`education${n}${attr}`, `Pendidikan ${n}`, attr, "education");
  for (const c of CERTIFICATIONS)
    for (const attr of ["Number", "Year"])
      add(`cert${c.key}${attr}`, "Sertifikasi", attr, "training", `${c.name}: ${ATTR_LABEL[attr]}`);
  for (const type of DRIVING_LICENSE_TYPES)
    add(`simNumber${type}`, "SIM", "Number", "personal", `No. SIM ${DRIVING_LICENSE_LABELS[type]}`);
  out.emergencyContactAddress = {
    label: "Alamat kontak darurat",
    group: "Kontak darurat",
    section: "personal",
    synonyms: ["alamat kontak darurat", "alamat darurat"],
  };
  return out as Record<GroupFieldKey, ImportFieldDef>;
}

export const GROUP_IMPORT_FIELDS = buildGroupFields();
