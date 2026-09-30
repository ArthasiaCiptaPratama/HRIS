// Template import karyawan DUMMY (D-042, Tahap 0): replika STRUKTUR file master data kantor —
// judul di baris 2, baris "Control" berformula di baris 4, header di baris 5 (sebagian multi-baris),
// data mulai baris 6, kolom formula (NO, LAMA KERJA, USIA, …), baris RESIGN tersembunyi, dan variasi
// penulisan yang ditemukan di file asli ("Laki - Laki", "ISLAM", KTP 15 digit, END OF DATE "Permanent").
// SEMUA nilai fiktif (PLAN §5.7): nama karangan, KTP/NPWP/rekening berformat valid tapi palsu.
// Jalankan: bun run template:import  →  public/template/Template-import-karyawan.xlsx
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";

type Formula = { f: string; v: string | number };
type Value = string | number | Date | Formula | null;

const HEADERS = [
  "Keterangan",
  "Tgl Resign",
  "NO",
  "NAMA",
  "NIK",
  "JOIN DATE",
  "END OF DATE",
  "LAMA KERJA",
  "MASA AKTIF",
  "STATUS MASA\nKONTRAK KARYAWAN",
  "STATUS KARYAWAN",
  "JABATAN",
  "DIVISI / DEPARTEMENT",
  "KOTA PENEMPATAN",
  "PERUSAHAAN\n(PNR / RCE / RDA / ACP / AU / NMA)",
  "PENEMPATAN LOKASI KERJA",
  "TEMPAT LAHIR",
  "TGL LAHIR",
  "USIA",
  "KOTA ASAL",
  "STATUS",
  "Grade",
  "NO. TELP E-CONT",
  "HUBUNGAN E-CONT",
  "AGAMA",
  "JENIS KELAMIN",
  "PENDIDIKAN",
  "NO. TLP HP",
  "NO. KTP",
  "NO. NPWP",
  "ID BPJS KETENAGAKERJAAN",
  "ID BPJS KESEHATAN",
  "NOMOR OFFERING",
  "NO. REKENING",
  "NAMA BANK",
  "ALAMAT KTP",
  "ALAMAT DOMISILI",
] as const;

interface DummyRow {
  resign?: string;
  name: string;
  number: string;
  join: string | Date;
  end: string | Date;
  status?: string;
  position: string;
  department: string;
  city: string;
  company: string;
  birthPlace?: string;
  birthDate?: string;
  ptkp?: string;
  grade?: string | number;
  religion?: string;
  gender?: string;
  education?: string;
  phone?: string;
  ktp?: string;
  npwp?: string;
  bpjsTk?: string | number;
  bpjsKes?: string;
  offering?: string;
  account?: string;
  bank?: string;
  address?: string;
  /** false = ALAMAT DOMISILI berisi teks sendiri (bukan formula =ALAMAT KTP). */
  domicileSame?: boolean;
}

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Variasi sengaja meniru file asli; komentar = kasus yang harus dikenali mesin import.
const ROWS: DummyRow[] = [
  {
    resign: "RESIGN ", // spasi di ujung
    name: "Contoh Resign Satu",
    number: "2401.ACP.901",
    join: d("2024-02-24"),
    end: "Permanent",
    position: "Security",
    department: "HRGA",
    city: "Kalimantan Tengah",
    company: "ACP",
  },
  {
    resign: "RESIGN",
    name: "Contoh Resign Dua",
    number: "2402.ACP.902",
    join: d("2024-03-04"),
    end: d("2025-09-30"),
    status: "PKWT I - 6 Bulan",
    position: "Wellsite",
    department: "Engineering",
    city: "Kalimantan Tengah",
    company: "ACP",
    religion: "Islam",
    gender: "Laki-Laki",
  },
  {
    name: "Budi Contoh Santoso",
    number: "2301.ACP.001",
    join: d("2023-01-09"),
    end: "Permanent",
    position: "KTT ACP",
    department: "Management",
    city: "Kalimantan Tengah",
    company: "ACP",
    birthPlace: "Palangka Raya",
    birthDate: "1980-05-12",
    ptkp: "K/3",
    grade: "4B",
    religion: "Islam",
    gender: "Laki-Laki",
    education: "S2",
    phone: "081200009001",
    ktp: "6271011205800001",
    npwp: "09.901.901.1-017.000", // format lama 15 digit bertitik
    bpjsTk: 99000000001,
    bpjsKes: "Terdaftar di BPJS 0009990000001",
    offering: "ACP.001.1/HRD/OL-IX/A-2023",
    account: "9990000000001",
    bank: "Mandiri",
    address: "Jl. Contoh Tjilik Riwut Km 1, Palangka Raya",
  },
  {
    name: "Siti Contoh Aminah",
    number: "2305.ACP.014",
    join: d("2023-05-15"),
    end: d("2026-11-30"),
    status: "PKWT II - 1 Tahun",
    position: "Geologist",
    department: "Engineering",
    city: "Kalimantan Tengah",
    company: "ACP",
    birthPlace: "Banjarmasin",
    birthDate: "1994-08-21",
    ptkp: "TK/0",
    grade: "3A",
    religion: "ISLAM", // huruf besar
    gender: "Perempuan",
    education: "S1",
    phone: "6281200009002", // awalan 62
    ktp: "6371016108940002",
    npwp: "6371016108940002", // NPWP 16 digit = NIK
    bpjsTk: "99000000002",
    bpjsKes: "Terdaftar di BPJS (Mandiri) = 0009990000002",
    account: "9990000000002",
    bank: "BRI",
    address: "Jl. Contoh A. Yani No. 2, Banjarmasin",
  },
  {
    name: "Agus Contoh Pratama",
    number: "2406.ACP.021",
    join: "01/06/2024", // tanggal sebagai TEKS
    end: d("2026-12-31"),
    status: "Probation  3 Bulan", // spasi ganda
    position: "Ass Master Bor", // singkatan dari "Assistant Master Bor"
    department: "Produksi",
    city: "Kalimantan Tengah",
    company: "ACP",
    birthPlace: "Sampit",
    birthDate: "1999-01-03",
    ptkp: "TK/0",
    grade: 1,
    religion: "Kristen",
    gender: "Laki - Laki", // spasi di sekitar tanda hubung
    education: "SMA N 3 Contoh Sampit", // jenjang + nama sekolah
    phone: "081200009003",
    ktp: "620201030199003", // 15 digit → harus ERROR
    bpjsTk: "Belum terdaftar di BPJS Ketenagakerjaan 2024", // teks tanpa nomor
    account: "9990000000003",
    bank: "BNI",
    address: "Jl. Contoh Tjilik Riwut Km 3, Sampit",
    domicileSame: false,
  },
  {
    name: "Rina Contoh Wati",
    number: "2407.ACP.022",
    join: d("2024-07-01"),
    end: d("2026-11-01"),
    status: "PKWT Ke 3 - Perpanjang 3 Bulan",
    position: "Assistant Master Bor",
    department: "Produksi",
    city: "Kalimantan Tengah",
    company: "ACP",
    birthPlace: "Kuala Kapuas",
    birthDate: "1997-12-11",
    ptkp: "K/1",
    grade: "3A",
    religion: "Katholik", // ejaan lama
    gender: "Perempuan",
    education: "D3",
    phone: "081200009004",
    ktp: "6203015112970004",
    npwp: "9990 0000 0000 0004", // berspasi
    bpjsKes: "Terdaftar di BPJS 0009990000004",
    account: "9990000000004",
    bank: "BCA",
    address: "Jl. Contoh Pemuda No. 4, Kuala Kapuas",
  },
  {
    name: "Dedi Contoh Kurniawan",
    number: "2408.ACP.023",
    join: d("2024-08-05"),
    end: d("2026-11-02"),
    // STATUS KARYAWAN kosong (7 baris di file asli)
    position: "Master Loading",
    department: "Operations",
    city: "Kalimantan Tengah",
    company: "ACP",
    ptkp: "K/2",
    religion: "Islam",
    gender: "Laki-Laki",
    education: "SMA",
    phone: "081200009005",
    ktp: "6271010508900005",
    account: "9990000000005",
    bank: "Mandiri",
  },
  {
    name: "Maya Contoh Lestari",
    number: "2410.ACP.024",
    join: d("2024-10-14"),
    end: d("2026-10-13"),
    status: "PKWT I - 3 Bulan",
    position: "Humas",
    department: "Legal",
    city: "Jakarta Selatan",
    company: "ACP",
    birthPlace: "Jakarta",
    birthDate: "1996-04-30",
    ptkp: "TK/0",
    grade: 2,
    religion: "Islam",
    gender: "Perempuan",
    education: "S1",
    phone: "081200009006",
    ktp: "3174017004960006",
    account: "9990000000006",
    bank: "Mandiri",
    address: "Jl. Contoh Gatot Subroto No. 6, Jakarta Selatan",
  },
  {
    name: "Yoga Contoh Saputra",
    number: "2501.PNR.001", // perusahaan lain dalam grup (D-039)
    join: d("2025-01-06"),
    end: d("2026-07-31"),
    status: "PKWT I - 6 Bulan",
    position: "Security",
    department: "HRGA",
    city: "Kalimantan Tengah",
    company: "PNR",
    religion: "Islam",
    gender: "Laki-Laki",
    education: "SMA",
    phone: "081200009007",
    ktp: "6271010601000007",
    account: "9990000000007",
    bank: "BRI",
  },
];

// ── Penulis OOXML minimal (cukup untuk Excel, LibreOffice, read-excel-file) ────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (n: number) => {
  let s = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26))
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};
const TODAY = d(new Date().toISOString().slice(0, 10));
const serial = (date: Date) => (date.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;

function cell(ref: string, value: Value, header = false): string {
  if (value === null || value === "") return "";
  if (value instanceof Date) return `<c r="${ref}" s="1"><v>${serial(value)}</v></c>`;
  if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === "object") {
    const v = value.v;
    return typeof v === "number"
      ? `<c r="${ref}"><f>${esc(value.f)}</f><v>${v}</v></c>`
      : `<c r="${ref}" t="str"><f>${esc(value.f)}</f><v>${esc(v)}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${header ? ' s="2"' : ""}><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

const years = (from: Date) =>
  Math.round(((TODAY.getTime() - from.getTime()) / 86_400_000 / 365) * 100) / 100;

function dataRow(r: number, row: DummyRow): { cells: Value[]; hidden: boolean } {
  const join = row.join instanceof Date ? row.join : null;
  const end = row.end instanceof Date ? row.end : null;
  const active = end ? Math.round((TODAY.getTime() - end.getTime()) / 86_400_000) : "permanent";
  const birth = row.birthDate ? d(row.birthDate) : null;
  return {
    hidden: Boolean(row.resign),
    cells: [
      row.resign ?? null,
      row.resign ? d("2026-05-31") : null,
      { f: `ROW()-5`, v: r - 5 },
      row.name,
      row.number,
      row.join,
      row.end,
      { f: `IF(F${r}="","-",(TODAY()-F${r})/365)`, v: join ? years(join) : "-" },
      { f: `IF(G${r}="permanent","permanent",TODAY()-G${r})`, v: active },
      {
        f: `IF(I${r}="permanent","permanent",IF(AND(I${r}<0),"aktif","expired"))`,
        v: active === "permanent" ? "permanent" : active < 0 ? "aktif" : "expired",
      },
      row.status ?? null,
      row.position,
      row.department,
      row.city,
      row.company,
      { f: `N${r}`, v: row.city },
      row.birthPlace ?? null,
      birth,
      { f: `IF(R${r}="","-",(TODAY()-R${r})/365)`, v: birth ? years(birth) : "-" },
      null, // KOTA ASAL (kosong di file asli)
      row.ptkp ?? null,
      row.grade ?? null,
      null, // NO. TELP E-CONT (kosong)
      null, // HUBUNGAN E-CONT (kosong)
      row.religion ?? null,
      row.gender ?? null,
      row.education ?? null,
      row.phone ?? null,
      row.ktp ?? null,
      row.npwp ?? null,
      row.bpjsTk ?? null,
      row.bpjsKes ?? null,
      row.offering ?? null,
      row.account ?? null,
      row.bank ?? null,
      row.address ?? null,
      row.domicileSame === false
        ? "Mess Karyawan Site Contoh, Kalimantan Tengah"
        : row.address
          ? { f: `AJ${r}`, v: row.address }
          : null,
    ],
  };
}

function sheetXml(): string {
  const rows: string[] = [];
  rows.push(`<row r="2">${cell("C2", "MASTER DATA KARYAWAN PT. CONTOH GRUP (DATA DUMMY)")}</row>`);
  // Baris "Control": rasio keterisian per kolom (formula agregat — harus dilewati mesin import).
  const last = 5 + ROWS.length;
  const control = [cell("B4", "Control")];
  for (let c = 4; c <= HEADERS.length; c++) {
    const col = colName(c);
    control.push(cell(`${col}4`, { f: `COUNTA(${col}6:${col}60)/C${last}`, v: 1 }));
  }
  rows.push(`<row r="4">${control.join("")}</row>`);
  rows.push(
    `<row r="5">${HEADERS.map((h, i) => cell(`${colName(i + 1)}5`, h, true)).join("")}</row>`,
  );
  ROWS.forEach((row, i) => {
    const r = 6 + i;
    const { cells, hidden } = dataRow(r, row);
    const xml = cells.map((v, c) => cell(`${colName(c + 1)}${r}`, v)).join("");
    rows.push(`<row r="${r}"${hidden ? ' hidden="1"' : ""}>${xml}</row>`);
  });
  // Baris bernomor tanpa data (hanya formula NO) seperti file asli — harus dianggap kosong.
  for (let r = 6 + ROWS.length; r <= 30; r++)
    rows.push(`<row r="${r}">${cell(`C${r}`, { f: "ROW()-5", v: r - 5 })}</row>`);
  const widths = HEADERS.map(
    (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 3 ? 26 : 16}" customWidth="1"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="5" ySplit="5" topLeftCell="F6" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

const files: Record<string, string> = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="ACP" sheetId="1" r:id="rId1"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  // s=1: tanggal dd-mmm-yy (numFmt bawaan 15); s=2: header tebal + wrap (header multi-baris).
  "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf numFmtId="15" applyNumberFormat="1"/><xf fontId="1" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  "xl/worksheets/sheet1.xml": sheetXml(),
};

const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "public", "template", "Template-import-karyawan.xlsx");
writeFileSync(out, zip);
process.stdout.write(
  `template dummy: ${ROWS.length} baris → ${path.relative(process.cwd(), out)}\n`,
);
