import {
  appendSheets,
  DOCUMENT_CATEGORY_LABELS,
  EDUCATION_LEVEL_LABELS,
  EMPLOYMENT_CHANGE_LABELS,
  EXPIRY_STATE_LABELS,
  GENDER_LABELS,
  MOVEMENT_TYPE_LABELS,
  TRAINING_TYPE_LABELS,
  type XlsxCell,
  type XlsxSheet,
} from "@hris/shared";
import { formatDate } from "@/lib/format";
import { imageUrlToJpeg } from "@/lib/image";
import {
  type CellValue,
  downloadFile,
  EMU_PER_PIXEL,
  fillXlsxTemplate,
  type TemplateImage,
  XLSX_MIME,
  XlsxTemplateError,
} from "@/lib/xlsx-template";
import { fetchEmployeeDocuments } from "../documents/api";
import type { EmployeeDocuments } from "../documents/schemas";
import { MARITAL_LABELS, RELATIONSHIP_LABELS, RELIGION_LABELS } from "./labels";
import type { EmployeeDetail } from "./schemas";

// Formulir "Daftar Isian Peserta" (apps/web/public/template/Template-excel.xlsx, satu lembar).
// Alamat sel di bawah mengikuti tata letak template; sel gabungan ditulis di sel kiri-atasnya.
// Kolom tanpa sumber data di HRIS (kota sekolah, pengalaman organisasi) sengaja dibiarkan kosong.
// D-058 (Arsip 1d): nama panggilan, suku, gol. darah, tahun masuk sekolah, pekerjaan keluarga (D-059) &
// pengalaman bekerja ikut terisi; daftar lengkap per kategori Arsip ditambahkan sebagai sheet terpisah.
// Foto profil (D-037) disisipkan ke bingkai kosong B9:J25.

export const PRINT_TEMPLATE_URL = `${import.meta.env.BASE_URL}template/Template-excel.xlsx`;
export const PRINT_SHEET_PATH = "xl/worksheets/sheet1.xml";
export const PRINT_DRAWING_PATH = "xl/drawings/drawing1.xml";

// Bingkai foto = sel gabungan B9:J25. Template: Calibri 11 → kolom lebar 4 = 28 px; baris bawaan
// 14,5 pt. Foto diberi jarak 3 px dari garis bingkai supaya garisnya tetap terlihat.
const PT_TO_EMU = 12700;
const PHOTO_FRAME = {
  firstCol: 1, // B (berbasis 0)
  lastCol: 9, // J
  firstRow: 8, // baris 9
  lastRow: 24, // baris 25
  colWidthEmu: 28 * EMU_PER_PIXEL,
  rowHeightEmu: 14.5 * PT_TO_EMU,
  insetEmu: 3 * EMU_PER_PIXEL,
};
const frameWidth = (PHOTO_FRAME.lastCol - PHOTO_FRAME.firstCol + 1) * PHOTO_FRAME.colWidthEmu;
const frameHeight = (PHOTO_FRAME.lastRow - PHOTO_FRAME.firstRow + 1) * PHOTO_FRAME.rowHeightEmu;
/** Rasio lebar/tinggi area foto di dalam bingkai; foto dipotong ke rasio ini agar tidak gepeng. */
export const PRINT_PHOTO_ASPECT =
  (frameWidth - 2 * PHOTO_FRAME.insetEmu) / (frameHeight - 2 * PHOTO_FRAME.insetEmu);

/** Letak foto di drawing template (anchor dua sel B9 → J25). */
export function photoImage(jpeg: Uint8Array): TemplateImage {
  const { firstCol, lastCol, firstRow, lastRow, colWidthEmu, rowHeightEmu, insetEmu } = PHOTO_FRAME;
  return {
    drawingPath: PRINT_DRAWING_PATH,
    name: "Foto Karyawan",
    jpeg,
    from: { col: firstCol, row: firstRow, colOffset: insetEmu, rowOffset: insetEmu },
    to: {
      col: lastCol,
      row: lastRow,
      colOffset: Math.round(colWidthEmu - insetEmu),
      rowOffset: Math.round(rowHeightEmu - insetEmu),
    },
  };
}

const ROWS = {
  education: [30, 31, 32, 33, 34],
  training: [38, 39, 40, 41, 42],
  father: 63,
  mother: 64,
  husband: 65,
  wife: 66,
  children: [67, 68, 69, 70, 71, 72],
  work: [55, 56, 57, 58, 59],
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
    // Usia dari tanggal lahir; tanpa tanggal lahir → usia saat didata (Formulir Data Karyawan).
    cells[`S${row}`] = ageOn(member.birthDate, todayIso) ?? member.ageAtEntry ?? null;
    cells[`V${row}`] = member.occupation ?? null;
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
    // Kop formulir mengikuti perusahaan karyawan (D-039); template berisi "PT. ARTHASIA CIPTA PRATAMA".
    B2: employee.company.name.toUpperCase(),
    R9: employee.fullName,
    R10: personal?.nickname ?? null,
    R11: personal
      ? [personal.birthPlace, personal.birthDate ? formatDate(personal.birthDate) : null]
          .filter(Boolean)
          .join(", ")
      : null,
    R12: employee.gender ? GENDER_LABELS[employee.gender] : null,
    R13: personal?.religion ? (RELIGION_LABELS[personal.religion] ?? personal.religion) : null,
    R14: personal?.ethnicity ?? null,
    R15: personal?.bloodType ?? null,
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
    cells[`Q${row}`] = edu.entryYear ?? null;
    cells[`U${row}`] = edu.graduationYear;
    cells[`Y${row}`] = edu.major;
  });
  byYear(employee.trainings, (t) => t.trainingYear, ROWS.training.length).forEach((training, i) => {
    const row = ROWS.training[i];
    cells[`D${row}`] = training.trainingField;
    cells[`R${row}`] = training.organizer;
    cells[`AB${row}`] = training.trainingYear;
  });

  byYear(employee.workExperiences ?? [], (w) => w.startYear, ROWS.work.length).forEach(
    (work, i) => {
      const row = ROWS.work[i];
      cells[`D${row}`] = work.companyName;
      cells[`O${row}`] = work.position;
      cells[`U${row}`] = `${work.startYear}–${work.endYear ?? "sekarang"}`;
      cells[`AA${row}`] = work.description;
    },
  );

  Object.assign(cells, familyRows(family, employee.gender, todayIso));

  // Kontak darurat: data kontak darurat karyawan (D-059); bila belum diisi, cari anggota keluarga yang
  // nomornya sama dengan nomor darurat.
  if (employee.emergencyPhone || employee.emergencyContactName) {
    const phone = digits(employee.emergencyPhone);
    const contact = family.find((m) => phone !== "" && digits(m.phoneNumber) === phone);
    const row = ROWS.emergency;
    cells[`D${row}`] = employee.emergencyContactName ?? contact?.name;
    cells[`M${row}`] =
      employee.emergencyContactRelationship ??
      (contact ? (RELATIONSHIP_LABELS[contact.relationship] ?? contact.relationship) : null);
    cells[`P${row}`] = personal?.emergencyContactAddress ?? contact?.address;
    cells[`AB${row}`] = employee.emergencyPhone;
  }
  return cells;
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : null;
const text = <K extends string>(
  labels: Record<K, string>,
  value: K | null | undefined,
): XlsxCell => (value ? (labels[value] ?? value) : null);

/**
 * D-058 (Arsip 1d): sheet tambahan per kategori Arsip — daftar lengkap (template hanya memuat 5 baris
 * per bagian). Keluarga hanya bila API mengirimkannya (hak data pribadi); dokumen = metadata versi
 * aktif yang boleh dilihat pencetak (tanpa file).
 */
export function buildArchiveSheets(
  employee: EmployeeDetail,
  documents: EmployeeDocuments["documents"] | null,
  todayIso: string,
): XlsxSheet[] {
  const sheets: XlsxSheet[] = [
    {
      name: "Pendidikan",
      rows: [
        ["Jenjang", "Sekolah/universitas", "Jurusan", "Tahun masuk", "Tahun lulus"],
        ...employee.educations.map((e) => [
          text(EDUCATION_LEVEL_LABELS, e.level),
          e.schoolName,
          e.major,
          e.entryYear ?? null,
          e.graduationYear,
        ]),
      ],
    },
    {
      name: "Pelatihan",
      rows: [
        [
          "Bidang pelatihan",
          "Penyelenggara",
          "Jenis",
          "Mulai",
          "Selesai",
          "Jam",
          "Tahun",
          "No. sertifikat",
        ],
        ...employee.trainings.map((t) => [
          t.trainingField,
          t.organizer,
          text(TRAINING_TYPE_LABELS, t.type),
          day(t.startDate),
          day(t.endDate),
          t.hours ?? null,
          t.trainingYear,
          t.certificateNumber ?? null,
        ]),
      ],
    },
    {
      name: "Riwayat Kerja",
      rows: [
        ["Perusahaan", "Jabatan", "Tahun mulai", "Tahun selesai", "Keterangan"],
        ...(employee.workExperiences ?? []).map((w) => [
          w.companyName,
          w.position,
          w.startYear,
          w.endYear,
          w.description,
        ]),
      ],
    },
    {
      name: "Riwayat Kepegawaian",
      rows: [
        [
          "Tanggal",
          "Perubahan",
          "Jenis mutasi",
          "Dari jabatan",
          "Ke jabatan",
          "Dari PT",
          "Ke PT",
          "No. SK",
          "Catatan",
        ],
        ...employee.histories.map((h) => [
          day(h.effectiveDate),
          text(EMPLOYMENT_CHANGE_LABELS, h.changeType),
          text(MOVEMENT_TYPE_LABELS, h.movementType),
          h.fromPosition?.name ?? null,
          h.toPosition?.name ?? h.toPositionName ?? null,
          h.fromCompany?.name ?? null,
          h.toCompany?.name ?? null,
          h.decreeNumber ?? null,
          h.note,
        ]),
      ],
    },
  ];
  if (employee.familyMembers) {
    sheets.push({
      name: "Keluarga",
      rows: [
        [
          "Nama",
          "Hubungan",
          "Jenis kelamin",
          "Tempat lahir",
          "Tanggal lahir",
          "Usia",
          "Pendidikan",
          "Pekerjaan",
          "No. HP",
        ],
        ...employee.familyMembers.map((m) => [
          m.name,
          RELATIONSHIP_LABELS[m.relationship] ?? m.relationship,
          m.gender ? (GENDER_LABELS[m.gender as keyof typeof GENDER_LABELS] ?? m.gender) : null,
          m.birthPlace ?? null,
          day(m.birthDate),
          ageOn(m.birthDate, todayIso) ?? m.ageAtEntry ?? null,
          m.education ?? null,
          m.occupation ?? null,
          m.phoneNumber,
        ]),
      ],
    });
  }
  if (documents) {
    sheets.push({
      name: "Dokumen",
      rows: [
        [
          "Jenis dokumen",
          "Kategori",
          "Nomor",
          "Tanggal terbit",
          "Kedaluwarsa",
          "Masa berlaku",
          "Versi",
          "Catatan",
        ],
        ...documents
          .filter((d) => d.isCurrent)
          .map((d) => [
            d.documentType.name,
            text(DOCUMENT_CATEGORY_LABELS, d.documentType.category),
            d.documentNumber,
            day(d.issuedAt),
            day(d.expiresAt),
            text(EXPIRY_STATE_LABELS, d.expiryState),
            d.version,
            d.note,
          ]),
      ],
    });
  }
  return sheets;
}

/** Nama file aman untuk Windows/Linux: "Data Karyawan - ACP-2023-0007 - Agus Pratama.xlsx". */
export function printFileName(employee: Pick<EmployeeDetail, "employeeNumber" | "fullName">) {
  const safe = (text: string) =>
    text
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  return `Data Karyawan - ${safe(employee.employeeNumber)} - ${safe(employee.fullName)}.xlsx`;
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

export type PhotoOutcome = "included" | "none" | "failed";

/** Buat file .xlsx dari template untuk satu pegawai (dengan foto bila ada) lalu unduh. */
export async function downloadEmployeeXlsx(
  employee: EmployeeDetail,
  todayIso: string,
): Promise<PhotoOutcome> {
  const template = await loadTemplate();
  const images: TemplateImage[] = [];
  let photo: PhotoOutcome = "none";
  if (employee.photoUrl) {
    try {
      const { bytes } = await imageUrlToJpeg(employee.photoUrl, PRINT_PHOTO_ASPECT);
      images.push(photoImage(bytes));
      photo = "included";
    } catch {
      // Foto gagal diambil (mis. jaringan): formulir tetap dibuat dengan bingkai kosong.
      photo = "failed";
    }
  }
  // Dokumen hanya metadata; gagal diambil (mis. jaringan) → sheet Dokumen dilewati, cetak tetap jalan.
  const documents = await fetchEmployeeDocuments(employee.id)
    .then((data) => data.documents)
    .catch(() => null);
  const bytes = appendSheets(
    fillXlsxTemplate(template, PRINT_SHEET_PATH, buildPrintCells(employee, todayIso), images),
    buildArchiveSheets(employee, documents, todayIso),
  );
  downloadFile(bytes, printFileName(employee), XLSX_MIME);
  return photo;
}
