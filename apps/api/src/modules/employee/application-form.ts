import { GENDER_LABELS, MARITAL_STATUS_LABELS, RELIGION_LABELS } from "@hris/shared";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { APPLICATION_FORM_TEMPLATE_BASE64 } from "./application-form-template.ts";
import type { EmployeeDetail } from "./employee.schema.ts";

// EMP-D1: Formulir Aplikasi (.docx) dari template Word bertanda docxtemplater (`templates/formulir-aplikasi.docx`;
// sejak 2026-10-19 = "Formulir Data Karyawan" HR tanpa pernyataan, daftar dokumen, dan tanda tangan Pelamar).
// Template boleh diubah HR di Word asalkan penanda di bawah dipakai: {fullName}, {#children}…{/children}, dst.
// Pas foto = gambar bernama FOTO_KARYAWAN di template (diganti foto, ukuran menyesuaikan rasio; dihapus bila
// tanpa foto). Tabel berulang diisi sampai jumlah baris minimum supaya tetap berbentuk formulir.

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
/** Baris minimum per tabel berulang (sama dengan jumlah baris kosong template asli). */
export const APPLICATION_FORM_MIN_ROWS = {
  children: 5,
  parents: 2,
  siblings: 5,
  educations: 3,
  certifications: 11,
  contacts: 2,
} as const;

export const longDate = (iso: string | null | undefined) =>
  iso ? `${Number(iso.slice(8, 10))} ${BULAN[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "";
const placeDate = (place: string | null | undefined, date: string | null | undefined) =>
  [place, longDate(date)].filter(Boolean).join(", ");
const text = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

type Row = Record<string, string>;
function padRows(rows: Row[], min: number, keys: readonly string[]): Row[] {
  // Baris kosong berisi semua kunci (string kosong): tanpa ini docxtemplater mencari nilai ke data induk.
  const blank = () => Object.fromEntries(keys.map((k) => [k, ""]));
  return [...rows, ...Array.from({ length: Math.max(0, min - rows.length) }, blank)];
}

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
export interface ApplicationFormOrg {
  division: string | null;
}

/** Nilai penanda template dari detail karyawan (view=print). Data pribadi kosong bila pencetak tidak berhak. */
export function applicationFormData(
  e: EmployeeDetail,
  todayIso: string,
  org: ApplicationFormOrg = { division: null },
) {
  const p = e.personal;
  const family = e.familyMembers ?? [];
  const of = (relationship: Family["relationship"]) =>
    family.filter((m) => m.relationship === relationship);
  const spouse = of("SPOUSE")[0];
  const licenses = p?.drivingLicenseNumbers ?? {};
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
    children: padRows(
      of("CHILD").map((m) => ({
        name: m.name,
        gender: m.gender === "MALE" ? "L" : m.gender === "FEMALE" ? "P" : "",
        birth: placeDate(m.birthPlace, m.birthDate),
        education: text(m.education),
        occupation: text(m.occupation),
      })),
      APPLICATION_FORM_MIN_ROWS.children,
      ["name", "gender", "birth", "education", "occupation"],
    ),
    parents: padRows(
      [...of("FATHER"), ...of("MOTHER")].map((m) => ({
        name: m.name,
        age: familyAge(m, todayIso),
        education: text(m.education),
        occupation: text(m.occupation),
      })),
      APPLICATION_FORM_MIN_ROWS.parents,
      ["name", "age", "education", "occupation"],
    ),
    siblings: padRows(
      of("SIBLING").map((m) => ({
        name: m.name,
        age: familyAge(m, todayIso),
        education: text(m.education),
        occupation: text(m.occupation),
        relation: text(m.relationDetail),
      })),
      APPLICATION_FORM_MIN_ROWS.siblings,
      ["name", "age", "education", "occupation", "relation"],
    ),
    educations: padRows(
      e.educations.map((x) => ({
        level: text(x.level),
        school: [x.schoolName, x.major].filter(Boolean).join(" — "),
        from: text(x.entryYear),
        to: text(x.graduationYear),
      })),
      APPLICATION_FORM_MIN_ROWS.educations,
      ["level", "school", "from", "to"],
    ),
    // Belum ada nomor sertifikat di data pelatihan: kolom "No." diisi penyelenggara.
    certifications: padRows(
      e.trainings.map((t) => ({
        type: text(t.trainingField),
        number: text(t.organizer),
        year: text(t.trainingYear),
      })),
      APPLICATION_FORM_MIN_ROWS.certifications,
      ["type", "number", "year"],
    ),
    // Template "Formulir Data Karyawan" (2026-10-19): kepegawaian, rekening, tabel kontak darurat.
    department: text(e.department?.name),
    division: text(org.division),
    position: text(e.position.name),
    joinDate: longDate(e.joinDate),
    bankName: text(e.bankAccount?.bankName),
    bankHolder: text(e.bankAccount?.accountHolder),
    bankAccount: text(e.bankAccount?.accountNumber),
    contacts: padRows(
      [
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
      APPLICATION_FORM_MIN_ROWS.contacts,
      ["name", "relation", "phone", "address"],
    ),
    ec1Name: text(e.emergencyContactName),
    ec1Phone: text(e.emergencyPhone),
    ec1Relation: text(e.emergencyContactRelationship),
    ec1Address: text(p?.emergencyContactAddress),
    // Penanda lama (template 2026-10-16) tetap tersedia untuk template yang masih memakainya.
    ec2Name: text(p?.emergencyContact2Name),
    ec2Phone: text(p?.emergencyContact2Phone),
    ec2Relation: text(p?.emergencyContact2Relationship),
    ec2Address: text(p?.emergencyContact2Address),
    printedAt: longDate(todayIso),
  };
}

export type ApplicationFormData = ReturnType<typeof applicationFormData>;

// --- Foto ---

const EMU_PER_CM = 360_000;
/** Kotak foto maksimum & tinggi area foto di template (6 baris × 589 twip ≈ 6,23 cm). */
const PHOTO_BOX_CM = { width: 4.0, height: 5.4, area: 6.23 };

export type PhotoFormat = "jpeg" | "png";

/** Format & ukuran piksel dari header berkas; null bila bukan JPEG/PNG (mis. WebP — tidak didukung Word). */
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

export type PhotoOutcome = "included" | "none" | "unsupported";

/** Ganti gambar FOTO_KARYAWAN dengan pas foto (atau hapus bila tanpa foto / format tidak didukung). */
function placePhoto(zip: PizZip, photo: Uint8Array | null): PhotoOutcome {
  const docFile = zip.file("word/document.xml");
  const relsFile = zip.file("word/_rels/document.xml.rels");
  if (!docFile || !relsFile) return "none";
  let xml = docFile.asText();
  const drawing =
    /<w:drawing>(?:(?!<\/w:drawing>).)*?name="FOTO_KARYAWAN"(?:(?!<\/w:drawing>).)*?<\/w:drawing>/s;
  const block = drawing.exec(xml)?.[0];
  if (!block) return "none";
  const info = photo ? imageInfo(photo) : null;
  if (!photo || !info) {
    zip.file("word/document.xml", xml.replace(drawing, ""));
    return photo ? "unsupported" : "none";
  }
  const relId = /r:embed="([^"]+)"/.exec(block)?.[1];
  if (!relId) return "none";
  const scale = Math.min(
    (PHOTO_BOX_CM.width * EMU_PER_CM) / info.width,
    (PHOTO_BOX_CM.height * EMU_PER_CM) / info.height,
  );
  const cx = Math.round(info.width * scale);
  const cy = Math.round(info.height * scale);
  // Gambar mengambang: offset vertikal supaya di tengah area foto.
  const offset = Math.max(0, Math.round((PHOTO_BOX_CM.area * EMU_PER_CM - cy) / 2));
  const sized = block
    .replace(
      /<wp:posOffset>-?\d+<\/wp:posOffset>(?=<\/wp:positionV>)/,
      `<wp:posOffset>${offset}</wp:posOffset>`,
    )
    .replace(/<wp:extent cx="\d+" cy="\d+"\/>/, `<wp:extent cx="${cx}" cy="${cy}"/>`)
    .replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`);
  xml = xml.replace(block, sized);
  // Berkas gambar baru sesuai format foto; relasi gambar diarahkan ke sana.
  const ext = info.format === "png" ? "png" : "jpeg";
  const media = `media/foto-karyawan.${ext}`;
  zip.file(`word/${media}`, photo);
  const rels = relsFile
    .asText()
    .replace(new RegExp(`(<Relationship [^>]*Id="${relId}"[^>]*Target=")[^"]+(")`), `$1${media}$2`)
    .replace(new RegExp(`(<Relationship [^>]*Target=")[^"]+("[^>]*Id="${relId}")`), `$1${media}$2`);
  zip.file("word/_rels/document.xml.rels", rels);
  const typesFile = zip.file("[Content_Types].xml");
  if (typesFile) {
    const types = typesFile.asText();
    if (!new RegExp(`<Default Extension="${ext}"`, "i").test(types)) {
      zip.file(
        "[Content_Types].xml",
        types.replace(
          /(<Types[^>]*>)/,
          `$1<Default Extension="${ext}" ContentType="image/${ext}"/>`,
        ),
      );
    }
  }
  zip.file("word/document.xml", xml);
  return "included";
}

/** Isi template → .docx. `template` default = template tersemat; dipisah supaya bisa diuji/diganti. */
export function renderApplicationForm(
  data: ApplicationFormData,
  photo: Uint8Array | null,
  template: Uint8Array = Buffer.from(APPLICATION_FORM_TEMPLATE_BASE64, "base64"),
): { docx: Uint8Array; photo: PhotoOutcome } {
  const doc = new Docxtemplater(new PizZip(template), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(data);
  const zip = doc.getZip();
  const outcome = placePhoto(zip, photo);
  return {
    docx: zip.generate({ type: "uint8array", compression: "DEFLATE" }),
    photo: outcome,
  };
}
