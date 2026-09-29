import { GENDER_LABELS } from "@hris/shared";
import { formatDate } from "@/lib/format";
import {
  type CellValue,
  downloadFile,
  fillXlsxTemplate,
  XLSX_MIME,
  XlsxTemplateError,
} from "@/lib/xlsx-template";
import { MARITAL_LABELS, RELATIONSHIP_LABELS, RELIGION_LABELS } from "./labels";
import type { EmployeeDetail } from "./schemas";

// Formulir "Daftar Isian Peserta" (apps/web/public/template/Template-excel.xlsx, satu lembar).
// Alamat sel di bawah mengikuti tata letak template; sel gabungan ditulis di sel kiri-atasnya.
// Kolom tanpa sumber data di HRIS (nama panggilan, suku, golongan darah, kota & tahun masuk
// sekolah, pengalaman organisasi/kerja, pekerjaan keluarga, foto) sengaja dibiarkan kosong.

export const PRINT_TEMPLATE_URL = `${import.meta.env.BASE_URL}template/Template-excel.xlsx`;
export const PRINT_SHEET_PATH = "xl/worksheets/sheet1.xml";

const ROWS = {
  education: [30, 31, 32, 33, 34],
  training: [38, 39, 40, 41, 42],
  father: 63,
  mother: 64,
  husband: 65,
  wife: 66,
  children: [67, 68, 69, 70, 71, 72],
  emergency: 76,
} as const;
/** Lebar gabungan R:AE (±47 karakter) → alamat dipecah ke tiga baris R16–R18. */
const ADDRESS_ROWS = ["R16", "R17", "R18"] as const;
const ADDRESS_LINE_CHARS = 46;

type FamilyMember = NonNullable<EmployeeDetail["familyMembers"]>[number];

/** "2023-08-01" → "01.08.2023" (format periode pada template). */
function dotDate(iso: string | null): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

/** Usia (tahun penuh) pada tanggal `today` (YYYY-MM-DD). */
export function ageOn(birthIso: string | null, todayIso: string): number | null {
  if (!birthIso) return null;
  const [by, bm, bd] = birthIso.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = todayIso.split("-").map(Number) as [number, number, number];
  const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  return age >= 0 ? age : null;
}

/** Pecah teks ke beberapa baris per kata; sisa yang tidak muat masuk baris terakhir. */
export function wrapText(text: string, width: number, lines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const word of words) {
    if (result.length === lines - 1) {
      current = current ? `${current} ${word}` : word;
      continue;
    }
    if (current && `${current} ${word}`.length > width) {
      result.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) result.push(current);
  return result;
}

const digits = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "");

/** Urut tahun naik (yang tak bertahun di akhir); ambil paling banyak `max`. */
function byYear<T>(items: T[], yearOf: (item: T) => number | null, max: number): T[] {
  return [...items]
    .sort((a, b) => (yearOf(a) ?? Number.MAX_SAFE_INTEGER) - (yearOf(b) ?? Number.MAX_SAFE_INTEGER))
    .slice(0, max);
}

function familyRows(
  members: FamilyMember[],
  employeeGender: EmployeeDetail["gender"],
  todayIso: string,
) {
  const cells: Record<string, CellValue> = {};
  const put = (row: number, member: FamilyMember, gender: string | null) => {
    cells[`G${row}`] = member.name;
    cells[`P${row}`] = gender;
    cells[`S${row}`] = ageOn(member.birthDate, todayIso);
  };
  const first = (relationship: string) => members.find((m) => m.relationship === relationship);

  const father = first("FATHER");
  if (father) put(ROWS.father, father, GENDER_LABELS.MALE);
  const mother = first("MOTHER");
  if (mother) put(ROWS.mother, mother, GENDER_LABELS.FEMALE);

  // Pasangan pegawai perempuan = Suami, pegawai laki-laki = Isteri; jenis kelamin pegawai kosong →
  // isi baris Suami lalu Isteri sesuai urutan data.
  const spouses = members.filter((m) => m.relationship === "SPOUSE");
  const spouseRows: { row: number; gender: string }[] =
    employeeGender === "MALE"
      ? [{ row: ROWS.wife, gender: GENDER_LABELS.FEMALE }]
      : employeeGender === "FEMALE"
        ? [{ row: ROWS.husband, gender: GENDER_LABELS.MALE }]
        : [
            { row: ROWS.husband, gender: GENDER_LABELS.MALE },
            { row: ROWS.wife, gender: GENDER_LABELS.FEMALE },
          ];
  spouses.slice(0, spouseRows.length).forEach((spouse, i) => {
    const slot = spouseRows[i];
    if (slot) put(slot.row, spouse, employeeGender ? slot.gender : null);
  });

  const children = [...members.filter((m) => m.relationship === "CHILD")].sort((a, b) =>
    (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999"),
  );
  children.slice(0, ROWS.children.length).forEach((child, i) => {
    const row = ROWS.children[i];
    if (row) put(row, child, null);
  });
  return cells;
}

/** Data pegawai → nilai sel template. Bagian sensitif hanya terisi bila API mengirimkannya. */
export function buildPrintCells(
  employee: EmployeeDetail,
  todayIso: string,
): Record<string, CellValue> {
  const personal = employee.personal ?? null;
  const family = employee.familyMembers ?? [];
  const cells: Record<string, CellValue> = {
    R9: employee.fullName,
    R11: personal
      ? [personal.birthPlace, personal.birthDate ? formatDate(personal.birthDate) : null]
          .filter(Boolean)
          .join(", ")
      : null,
    R12: employee.gender ? GENDER_LABELS[employee.gender] : null,
    R13: personal?.religion ? (RELIGION_LABELS[personal.religion] ?? personal.religion) : null,
    R19: personal?.maritalStatus
      ? (MARITAL_LABELS[personal.maritalStatus] ?? personal.maritalStatus)
      : null,
    R20: employee.phoneNumber,
    R21: employee.workEmail,
    R24: `${dotDate(employee.joinDate)} s/d ${dotDate(employee.endDate)}`.trimEnd(),
    R25: employee.department?.name,
    R26: employee.position.name,
  };

  const address = personal?.domicileAddress || personal?.ktpAddress || "";
  const addressLines = wrapText(address, ADDRESS_LINE_CHARS, ADDRESS_ROWS.length);
  ADDRESS_ROWS.forEach((ref, i) => {
    cells[ref] = addressLines[i] ?? null;
  });

  byYear(employee.educations, (e) => e.graduationYear, ROWS.education.length).forEach((edu, i) => {
    const row = ROWS.education[i];
    cells[`D${row}`] = edu.schoolName;
    cells[`U${row}`] = edu.graduationYear;
    cells[`Y${row}`] = edu.major;
  });
  byYear(employee.trainings, (t) => t.trainingYear, ROWS.training.length).forEach((training, i) => {
    const row = ROWS.training[i];
    cells[`D${row}`] = training.trainingField;
    cells[`R${row}`] = training.organizer;
    cells[`AB${row}`] = training.trainingYear;
  });

  Object.assign(cells, familyRows(family, employee.gender, todayIso));

  // Kontak darurat: nomor dari data kerja; nama/hubungan/alamat bila nomornya milik anggota keluarga.
  if (employee.emergencyPhone) {
    const phone = digits(employee.emergencyPhone);
    const contact = family.find((m) => phone !== "" && digits(m.phoneNumber) === phone);
    const row = ROWS.emergency;
    cells[`D${row}`] = contact?.name;
    cells[`M${row}`] = contact
      ? (RELATIONSHIP_LABELS[contact.relationship] ?? contact.relationship)
      : null;
    cells[`P${row}`] = contact?.address;
    cells[`AB${row}`] = employee.emergencyPhone;
  }
  return cells;
}

/** Nama file aman untuk Windows/Linux: "Data Pegawai - ACP-2023-0007 - Agus Pratama.xlsx". */
export function printFileName(employee: Pick<EmployeeDetail, "employeeNumber" | "fullName">) {
  const safe = (text: string) =>
    text
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  return `Data Pegawai - ${safe(employee.employeeNumber)} - ${safe(employee.fullName)}.xlsx`;
}

async function loadTemplate(): Promise<Uint8Array> {
  const response = await fetch(PRINT_TEMPLATE_URL, { cache: "no-cache" });
  if (!response.ok) throw new XlsxTemplateError("Template Excel tidak ditemukan di server.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  // File .xlsx = arsip ZIP ("PK"); server SPA bisa mengembalikan index.html untuk path yang salah.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new XlsxTemplateError("Template Excel tidak valid.");
  }
  return bytes;
}

/** Buat file .xlsx dari template untuk satu pegawai lalu unduh. */
export async function downloadEmployeeXlsx(employee: EmployeeDetail, todayIso: string) {
  const template = await loadTemplate();
  const bytes = fillXlsxTemplate(template, PRINT_SHEET_PATH, buildPrintCells(employee, todayIso));
  downloadFile(bytes, printFileName(employee), XLSX_MIME);
}
