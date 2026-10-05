import { FAMILY_RELATIONSHIP_LABELS, MARITAL_STATUS_LABELS, RELIGION_LABELS } from "@hris/shared";
import { formatDate } from "@/lib/format";

// D-054 / OD-6: label field pengajuan & format nilai untuk tampilan perbandingan.
export const FIELD_LABELS: Record<string, string> = {
  birthPlace: "Tempat lahir",
  birthDate: "Tanggal lahir",
  ktpNumber: "NIK KTP",
  kkNumber: "No. KK",
  religion: "Agama",
  maritalStatus: "Status pernikahan",
  ktpAddress: "Alamat KTP",
  domicileAddress: "Alamat domisili",
  originCity: "Kota asal",
  phoneNumber: "No. HP",
  npwpNumber: "NPWP",
  npwpAbsent: "Belum punya NPWP",
  bpjsEmploymentNumber: "BPJS Ketenagakerjaan",
  bpjsEmploymentAbsent: "Belum punya BPJS Ketenagakerjaan",
  bpjsHealthNumber: "BPJS Kesehatan",
  bpjsHealthAbsent: "Belum punya BPJS Kesehatan",
  name: "Nama kontak darurat",
  relationship: "Hubungan",
  phone: "No. HP kontak darurat",
  bankName: "Bank",
  accountNumber: "Nomor rekening",
  accountHolder: "Atas nama",
  members: "Anggota keluarga",
  document: "Dokumen",
};

const DATE_FIELDS = new Set(["birthDate"]);

export function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (field === "religion")
    return RELIGION_LABELS[value as keyof typeof RELIGION_LABELS] ?? String(value);
  if (field === "maritalStatus")
    return MARITAL_STATUS_LABELS[value as keyof typeof MARITAL_STATUS_LABELS] ?? String(value);
  if (DATE_FIELDS.has(field)) return formatDate(String(value));
  return String(value);
}

export function memberLine(member: Record<string, unknown>): string {
  return [
    member.name,
    FAMILY_RELATIONSHIP_LABELS[member.relationship as keyof typeof FAMILY_RELATIONSHIP_LABELS],
    member.birthDate ? `lahir ${formatDate(String(member.birthDate))}` : null,
    member.phoneNumber,
  ]
    .filter(Boolean)
    .join(" · ");
}
