import {
  buildWorkbook,
  DRIVING_LICENSE_LABELS,
  EDUCATION_LEVEL_LABELS,
  EMPLOYMENT_CATEGORY_LABELS,
  EMPLOYMENT_CHANGE_LABELS,
  FAMILY_RELATIONSHIP_LABELS,
  GENDER_LABELS,
  IMPORT_FIELDS,
  MARITAL_STATUS_LABELS,
  MOVEMENT_TYPE_LABELS,
  POSITION_LEVEL_LABELS,
  PTKP_LABELS,
  RELIGION_LABELS,
  TRAINING_TYPE_LABELS,
  type XlsxCell,
  type XlsxSheet,
} from "@hris/shared";
import { hasPermission } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ForbiddenError } from "../../core/errors.ts";
import { getMasterLookup } from "../organization/index.ts";
import * as policy from "./employee.policy.ts";
import type { EmployeeWhere } from "./employee.repository.ts";
import { buildWhere, type RequestContext, scopeWhere, todayInJakarta } from "./employee.service.ts";
import * as repository from "./employee-export.repository.ts";
import type { EmployeeExportInput, EmployeeExportSection } from "./employee-export.schema.ts";

// Label umum mengikuti kamus Import, tanpa menjadikan ekspor sebagai format impor ulang.
const IMPORT_LABELS = new Map(
  Object.entries(IMPORT_FIELDS).map(([key, field]) => [key, field.label]),
);

// Nilai baru/tak dikenal tetap ditampilkan agar tidak hilang menjadi sel kosong.
function labelOf(value: string | null | undefined, labels: Readonly<Record<string, string>>) {
  if (value === null || value === undefined) return value;
  return Object.hasOwn(labels, value) ? (labels[value] ?? value) : value;
}

const PERSONAL_VALUE_LABELS = new Map<string, Readonly<Record<string, string>>>([
  ["maritalStatus", MARITAL_STATUS_LABELS],
  ["religion", RELIGION_LABELS],
  ["ptkpStatus", PTKP_LABELS],
]);

export async function exportEmployees(
  ctx: RequestContext,
  input: EmployeeExportInput,
  now = new Date(),
) {
  if (!policy.canExportEmployees(ctx.actor)) throw new ForbiddenError();
  const filter = "filter" in input ? input.filter : undefined;
  const employeeIds = "employeeIds" in input ? input.employeeIds : undefined;
  const sections: EmployeeExportSection[] = [...new Set(["identity" as const, ...input.sections])];
  const personal = sections.includes("personal") || sections.includes("family");
  const bank = sections.includes("bank");
  // Pemilik data sendiri bukan pengecualian untuk ekspor massal; grant wajib bagi HR.
  if (personal && !hasPermission(ctx.actor, "employee.personal.read")) {
    throw new ForbiddenError("Ekspor data pribadi/keluarga butuh izin baca data pribadi.");
  }
  if (bank && !hasPermission(ctx.actor, "employee.bank.read")) {
    throw new ForbiddenError("Ekspor rekening butuh izin baca rekening.");
  }
  const lookup = await getMasterLookup();
  const where: EmployeeWhere = filter
    ? buildWhere(ctx.actor, { ...filter, active: true, page: 1, pageSize: 100 }, lookup)
    : { AND: [scopeWhere(ctx.actor), { isActive: true, id: { in: employeeIds ?? [] } }] };
  const employees = await repository.findExportEmployees(where);
  if (employees.length > 5000) {
    throw new BusinessRuleError(
      "Maksimal 5.000 karyawan per ekspor; persempit filter halaman ini.",
    );
  }
  for (const row of employees) {
    const target = { employeeId: row.id, managerId: row.managerId, companyId: row.companyId };
    if (
      (personal && !policy.canReadPersonal(ctx.actor, target)) ||
      (bank && !policy.canReadBank(ctx.actor, target))
    ) {
      throw new ForbiddenError(
        "Izin baca data pribadi/rekening diperlukan untuk semua PT karyawan yang diekspor.",
      );
    }
  }
  // Cakupan diulang saat mengambil relasi agar perpindahan PT tidak membocorkan data.
  const parts = await repository.findExportParts(
    { AND: [where, { id: { in: employees.map((e) => e.id) } }] },
    sections,
  );
  const byId = new Map(employees.map((e) => [e.id, e]));
  const sheets: XlsxSheet[] = [];
  const main: XlsxCell[][] = [
    [
      "NIP",
      "Nama",
      "PT",
      "Unit",
      "Jabatan",
      "Level",
      "Status kepegawaian",
      "Kategori",
      "Tanggal masuk",
      "Lokasi kerja",
      "Homebase",
      "Atasan langsung",
    ],
  ];
  if (sections.includes("contact"))
    main[0]?.push(
      "Email kantor",
      IMPORT_FIELDS.phoneNumber.label,
      "Nama kontak darurat",
      "Hubungan kontak darurat",
      IMPORT_FIELDS.emergencyPhone.label,
    );
  const personalColumns = [
    ["ktpNumber", "NIK KTP"],
    ["npwpNumber", "NPWP"],
    ["kkNumber", "Nomor KK"],
    ["birthPlace", "Tempat lahir"],
    ["birthDate", "Tanggal lahir"],
    ["ktpAddress", "Alamat KTP"],
    ["domicileAddress", "Alamat domisili"],
    ["maritalStatus", "Status pernikahan"],
    ["religion", "Agama"],
    ["bpjsEmploymentNumber", "Nomor BPJS Ketenagakerjaan"],
    ["bpjsHealthNumber", "Nomor BPJS Kesehatan"],
    ["ptkpStatus", "Status PTKP"],
    ["originCity", "Kota asal"],
    ["nickname", "Nama panggilan"],
    ["nationality", "Kewarganegaraan"],
    ["ethnicity", "Suku"],
    ["bloodType", "Golongan darah"],
    ["drivingLicenseNumber", "Nomor SIM"],
    ["emergencyContactAddress", "Alamat kontak darurat"],
    ["domicileVillage", "Kelurahan/desa domisili"],
    ["domicileDistrict", "Kecamatan domisili"],
    ["domicileCity", "Kota domisili"],
    ["domicileProvince", "Provinsi domisili"],
    ["ktpVillage", "Kelurahan/desa KTP"],
    ["ktpDistrict", "Kecamatan KTP"],
    ["ktpCity", "Kota KTP"],
    ["ktpProvince", "Provinsi KTP"],
    ["emergencyContact2Name", "Nama kontak darurat 2"],
    ["emergencyContact2Relationship", "Hubungan kontak darurat 2"],
    ["emergencyContact2Phone", "Nomor HP kontak darurat 2"],
    ["emergencyContact2Address", "Alamat kontak darurat 2"],
  ] as const;
  if (sections.includes("personal"))
    main[0]?.push(
      "Jenis kelamin",
      "Email pribadi",
      ...personalColumns.map(([key, label]) => IMPORT_LABELS.get(key) ?? label),
      "Jenis SIM",
    );
  if (bank)
    main[0]?.push(
      IMPORT_FIELDS.bankName.label,
      IMPORT_FIELDS.bankAccountNumber.label,
      IMPORT_FIELDS.bankAccountHolder.label,
    );
  const repeat = (
    section: EmployeeExportSection,
    name: string,
    headers: string[],
    rows: XlsxCell[][],
  ) => {
    if (sections.includes(section))
      sheets.push({
        name,
        title: name,
        rows: [["NIP", "Nama", ...headers], ...rows],
        freezeColumns: 2,
      });
  };
  const family: XlsxCell[][] = [],
    education: XlsxCell[][] = [],
    training: XlsxCell[][] = [],
    experience: XlsxCell[][] = [],
    employment: XlsxCell[][] = [];
  const ref = (map: Map<string, { name: string }>, id: string | null) =>
    id ? (map.get(id)?.name ?? "") : "";
  for (const row of parts) {
    const base = byId.get(row.id);
    if (!base) continue;
    const position = lookup.positions.get(row.positionId);
    const status = lookup.statuses.get(row.employmentStatusId);
    const prefix = [row.employeeNumber, row.fullName];
    const line: XlsxCell[] = [
      ...prefix,
      ref(lookup.companies, row.companyId),
      ref(lookup.departments, position?.departmentId ?? null),
      position?.name,
      labelOf(position?.level, POSITION_LEVEL_LABELS),
      status?.name,
      labelOf(status?.category, EMPLOYMENT_CATEGORY_LABELS),
      row.joinDate,
      ref(lookup.locations, row.workLocationId),
      ref(lookup.homebases, row.homebaseId),
      row.manager?.fullName,
    ];
    if (sections.includes("contact"))
      line.push(
        base.workEmail,
        base.phoneNumber,
        base.emergencyContactName,
        base.emergencyContactRelationship,
        base.emergencyPhone,
      );
    if (sections.includes("personal"))
      line.push(
        labelOf(row.gender, GENDER_LABELS),
        row.personalEmail,
        ...personalColumns.map(([key]) => {
          const value = row.personal?.[key];
          const labels = PERSONAL_VALUE_LABELS.get(key);
          return labels && typeof value === "string" ? labelOf(value, labels) : value;
        }),
        row.personal?.drivingLicenseTypes
          .map((type) => labelOf(type, DRIVING_LICENSE_LABELS))
          .join(", "),
      );
    if (bank)
      line.push(
        row.bankAccount?.bankName,
        row.bankAccount?.accountNumber,
        row.bankAccount?.accountHolder,
      );
    main.push(line);
    for (const r of row.familyMembers ?? [])
      family.push([
        ...prefix,
        r.name,
        labelOf(r.relationship, FAMILY_RELATIONSHIP_LABELS),
        r.relationDetail,
        labelOf(r.gender, GENDER_LABELS),
        r.birthPlace,
        r.birthDate,
        r.ageAtEntry,
        r.isDeceased ? "Ya" : "Tidak",
        r.education,
        r.occupation,
        r.phoneNumber,
        r.address,
        r.workAddress,
      ]);
    for (const r of row.educations ?? [])
      education.push([
        ...prefix,
        labelOf(r.level, EDUCATION_LEVEL_LABELS),
        r.schoolName,
        r.major,
        r.entryYear,
        r.graduationYear,
      ]);
    for (const r of row.trainings ?? [])
      training.push([
        ...prefix,
        r.trainingField,
        labelOf(r.type, TRAINING_TYPE_LABELS),
        r.organizer,
        r.duration,
        r.trainingYear,
        r.startDate,
        r.endDate,
        r.hours,
        r.cost?.toString(),
        r.certificateNumber,
      ]);
    for (const r of row.workExperiences ?? [])
      experience.push([
        ...prefix,
        r.companyName,
        r.position,
        r.startYear,
        r.endYear,
        r.description,
      ]);
    for (const r of row.histories ?? [])
      employment.push([
        ...prefix,
        r.effectiveDate,
        labelOf(r.changeType, EMPLOYMENT_CHANGE_LABELS),
        ref(lookup.positions, r.fromPositionId),
        ref(lookup.positions, r.toPositionId) || r.toPositionName,
        r.toDepartmentName,
        ref(lookup.statuses, r.fromStatusId),
        ref(lookup.statuses, r.toStatusId),
        ref(lookup.companies, r.fromCompanyId),
        ref(lookup.companies, r.toCompanyId),
        labelOf(r.movementType, MOVEMENT_TYPE_LABELS),
        r.decreeNumber,
        r.note,
      ]);
  }
  sheets.push({ name: "Karyawan", title: "Data Karyawan", rows: main, freezeColumns: 2 });
  repeat(
    "family",
    "Keluarga",
    [
      "Nama anggota keluarga",
      "Hubungan",
      "Keterangan hubungan",
      "Jenis kelamin",
      "Tempat lahir",
      "Tanggal lahir",
      "Usia saat didata",
      "Sudah meninggal",
      "Pendidikan",
      "Pekerjaan",
      "Nomor HP",
      "Alamat",
      "Alamat kerja",
    ],
    family,
  );
  repeat(
    "education",
    "Pendidikan",
    ["Jenjang", "Nama sekolah", "Jurusan", "Tahun masuk", "Tahun lulus"],
    education,
  );
  repeat(
    "training",
    "Pelatihan",
    [
      "Bidang pelatihan",
      "Jenis",
      "Penyelenggara",
      "Durasi",
      "Tahun pelatihan",
      "Tanggal mulai",
      "Tanggal selesai",
      "Jam",
      "Biaya (Rp)",
      "Nomor sertifikat",
    ],
    training,
  );
  repeat(
    "experience",
    "Pengalaman Kerja",
    ["Nama perusahaan", "Jabatan", "Tahun mulai", "Tahun selesai", "Keterangan"],
    experience,
  );
  repeat(
    "employment",
    "Riwayat Jabatan",
    [
      "Tanggal efektif",
      "Jenis perubahan",
      "Jabatan asal",
      "Jabatan tujuan",
      "Unit tujuan",
      "Status asal",
      "Status tujuan",
      "PT asal",
      "PT tujuan",
      "Jenis perpindahan",
      "Nomor SK",
      "Catatan",
    ],
    employment,
  );
  const bytes = buildWorkbook(sheets, { title: "Data Karyawan", creator: "HRIS Arthasia" }, now);
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
    action: "employee.export",
    entityType: "employee",
    entityId: null,
    after: {
      ...(filter ? { filters: filter } : { employeeIdsCount: employeeIds?.length ?? 0 }),
      sections,
      rows: parts.length,
    },
  });
  return {
    fileName: `data-karyawan-${todayInJakarta(now)}.xlsx`,
    rows: parts.length,
    contentBase64: Buffer.from(bytes).toString("base64"),
  };
}
