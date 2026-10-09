import { createHash } from "node:crypto";
import {
  fieldPermission,
  IMPORT_FIELD_KEYS,
  type ImportAttachment,
  type ImportCertification,
  type ImportEducation,
  type ImportFamilyMember,
  type ImportFieldKey,
  type ImportRowIssue,
  isBlankImportRow,
  type NormalizedImportRow,
  normalizeImportRow,
  unitKey,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import {
  archivedMasterIndex,
  createMissingMasterData,
  getMasterLookup,
  type MasterDataNames,
  type MasterLookup,
  masterKey,
  missingMasterData,
  positionKey,
} from "../organization/index.ts";
import * as policy from "./employee.policy.ts";
import * as repository from "./employee.repository.ts";
import { type RequestContext, todayInJakarta } from "./employee.service.ts";
import * as importRepo from "./employee-import.repository.ts";
import {
  type CommitBody,
  type ImportBody,
  type ImportJobDto,
  type ImportPreview,
  type UnitChoice,
  unitChoicesSchema,
} from "./employee-import.schema.ts";
import { newUnitSpecs, resolveUnits } from "./employee-import-units.ts";

// D-042: import karyawan. `analyze` dipakai pratinjau & simpan (sumber kebenaran di server).
// Aturan: cakupan PT (D-040), grant untuk kolom sensitif (§4.2), master data baru boleh ditambah,
// baris resign → nonaktif, sel kosong tidak menimpa (UPSERT), baris error tidak diimpor.

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toIso = (date: Date | null | undefined) =>
  date ? date.toISOString().slice(0, 10) : undefined;

type Action = "CREATE" | "UPDATE" | "SKIP" | "ERROR";

interface RowPlan {
  sourceRow: number;
  action: Action;
  row: NormalizedImportRow;
  issues: ImportRowIssue[];
  changes: ImportFieldKey[];
  existing?: importRepo.ExistingEmployee;
  companyId?: string;
  companySource?: "FILE" | "ROW" | "DEFAULT" | "EXISTING";
  statusId?: string;
  /** Departemen untuk jabatan (dari file atau departemen jabatan saat ini). */
  departmentName?: string;
  /** D-059: keluarga/pendidikan/sertifikasi dari file yang belum ada di karyawan (ditambahkan). */
  repeated?: RepeatedRows;
}

interface RepeatedRows {
  family: ImportFamilyMember[];
  educations: ImportEducation[];
  certifications: ImportCertification[];
}

const textKey = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * D-059: impor ulang = tambah yang belum ada (tidak menghapus/menimpa). Cocok bila keluarga: hubungan +
 * nama; pendidikan: jenjang + sekolah; sertifikasi: nama = bidang pelatihan.
 */
function missingRepeated(row: NormalizedImportRow, e?: importRepo.ExistingEmployee): RepeatedRows {
  const family = e?.familyMembers ?? [];
  const educations = e?.educations ?? [];
  const trainings = e?.trainings ?? [];
  return {
    family: (row.family ?? []).filter(
      (m) =>
        !family.some(
          (f) => f.relationship === m.relationship && textKey(f.name) === textKey(m.name),
        ),
    ),
    educations: (row.educations ?? []).filter(
      (ed) =>
        !educations.some(
          (x) =>
            (ed.level === undefined || x.level === ed.level) &&
            masterKey(x.schoolName) === masterKey(ed.schoolName ?? ed.level ?? ""),
        ),
    ),
    certifications: (row.certifications ?? []).filter(
      (c) => !trainings.some((t) => textKey(t.trainingField) === textKey(c.name)),
    ),
  };
}

async function writeRepeated(
  tx: Parameters<typeof importRepo.createEducation>[0],
  employeeId: string,
  r: RepeatedRows,
) {
  for (const { source: _source, birthDate, ...m } of r.family)
    await importRepo.createFamilyMember(tx, {
      employeeId,
      ...m,
      ...(birthDate ? { birthDate: toDate(birthDate) } : {}),
    });
  for (const ed of r.educations)
    await importRepo.createEducation(tx, {
      employeeId,
      level: ed.level ?? null,
      schoolName: ed.schoolName ?? (ed.level as string),
      entryYear: ed.entryYear ?? null,
      graduationYear: ed.graduationYear ?? null,
    });
  for (const c of r.certifications)
    await importRepo.createTraining(tx, {
      employeeId,
      trainingField: c.name,
      trainingYear: c.year ?? null,
      certificateNumber: c.number ?? null,
    });
}

/**
 * D-060: lampiran baris ini yang masuk antrean — baris error dan baris yang dilewati karena mode
 * "hanya tambah baru" (karyawan sudah ada) tidak ikut; baris tanpa perubahan data tetap ikut.
 */
function queuedAttachments(plan: RowPlan): ImportAttachment[] {
  if (plan.action === "ERROR" || plan.issues.some((i) => i.code === "EXISTS_SKIPPED")) return [];
  return plan.row.attachments ?? [];
}

interface Analysis {
  preview: ImportPreview;
  plans: RowPlan[];
  lookup: MasterLookup;
  missing: MasterDataNames;
  writePersonal: boolean;
  writeBank: boolean;
}

const PERSONAL_KEYS = [
  "birthPlace",
  "birthDate",
  "originCity",
  "ptkpStatus",
  "maritalStatus",
  "religion",
  "ktpNumber",
  "npwpNumber",
  "kkNumber",
  "bpjsEmploymentNumber",
  "bpjsHealthNumber",
  "ktpAddress",
  "domicileAddress",
  // D-059: field Formulir Data Karyawan.
  "nickname",
  "nationality",
  "ethnicity",
  "bloodType",
  "drivingLicenseTypes",
  "drivingLicenseNumber",
  "drivingLicenseNumbers",
  "emergencyContactAddress",
  // D-061: rincian alamat & kontak darurat ke-2.
  "domicileVillage",
  "domicileDistrict",
  "domicileCity",
  "domicileProvince",
  "ktpVillage",
  "ktpDistrict",
  "ktpCity",
  "ktpProvince",
  "emergencyContact2Name",
  "emergencyContact2Relationship",
  "emergencyContact2Phone",
  "emergencyContact2Address",
] as const;
// Kunci data pribadi → field import (untuk daftar perubahan). maritalStatus bisa turunan PTKP.
const PERSONAL_FIELD: Record<(typeof PERSONAL_KEYS)[number], ImportFieldKey> = {
  birthPlace: "birthPlace",
  birthDate: "birthDate",
  originCity: "originCity",
  ptkpStatus: "ptkpStatus",
  maritalStatus: "maritalStatus",
  religion: "religion",
  ktpNumber: "ktpNumber",
  npwpNumber: "npwpNumber",
  kkNumber: "kkNumber",
  bpjsEmploymentNumber: "bpjsEmploymentNumber",
  bpjsHealthNumber: "bpjsHealthNumber",
  ktpAddress: "ktpAddress",
  domicileAddress: "domicileAddress",
  nickname: "nickname",
  nationality: "nationality",
  ethnicity: "ethnicity",
  bloodType: "bloodType",
  drivingLicenseTypes: "drivingLicenseTypes",
  drivingLicenseNumber: "drivingLicenseNumber",
  drivingLicenseNumbers: "drivingLicenseNumber",
  emergencyContactAddress: "emergencyContactAddress",
  domicileVillage: "domicileVillage",
  domicileDistrict: "domicileDistrict",
  domicileCity: "domicileCity",
  domicileProvince: "domicileProvince",
  ktpVillage: "ktpVillage",
  ktpDistrict: "ktpDistrict",
  ktpCity: "ktpCity",
  ktpProvince: "ktpProvince",
  emergencyContact2Name: "emergency2Name",
  emergencyContact2Relationship: "emergency2Relationship",
  emergencyContact2Phone: "emergency2Phone",
  emergencyContact2Address: "emergency2Address",
};

const EXIT_REASON = {
  RESIGNATION: "RESIGNATION",
  TERMINATION: "TERMINATION",
  OTHER: "OTHER",
} as const;

function issue(
  field: ImportFieldKey | null,
  code: string,
  severity: "ERROR" | "WARNING" = "ERROR",
) {
  return { field, code, severity } satisfies ImportRowIssue;
}

function statusIdFor(lookup: MasterLookup, category: string): string | undefined {
  return [...lookup.statuses.values()].find((s) => !s.deleted && s.category === category)?.id;
}

function activeStatus(lookup: MasterLookup, id: string): boolean {
  const status = lookup.statuses.get(id);
  return status !== undefined && !status.deleted;
}

function departmentNameOf(lookup: MasterLookup, positionId: string): string | undefined {
  const position = lookup.positions.get(positionId);
  return position ? lookup.departments.get(position.departmentId)?.name : undefined;
}

export async function analyze(ctx: RequestContext, body: ImportBody): Promise<Analysis> {
  if (!policy.canImportEmployees(ctx.actor)) throw new ForbiddenError();
  const lookup = await getMasterLookup();
  const writePersonal = policy.canWriteSensitiveViaImport(ctx.actor, "personal");
  const writeBank = policy.canWriteSensitiveViaImport(ctx.actor, "bank");
  const companyByCode = new Map(
    [...lookup.companies.values()].filter((c) => !c.deleted).map((c) => [c.code.toUpperCase(), c]),
  );
  const scopeCompanies = [...(ctx.actor.companyIds ?? [])];

  // 1) Buang kolom sensitif yang aktor tak berhak tulis (D-042 poin 5) — dicatat sebagai dilewati.
  const skipped = new Set<ImportFieldKey>();
  const rows = body.rows.map(({ sourceRow, raw }) => {
    const kept: Partial<Record<ImportFieldKey, unknown>> = {};
    for (const key of IMPORT_FIELD_KEYS) {
      if (raw[key] === undefined || raw[key] === null || raw[key] === "") continue;
      const permission = fieldPermission(key);
      const allowed =
        permission === null ||
        (permission === "employee.personal.write" ? writePersonal : writeBank);
      if (allowed) kept[key] = raw[key];
      else skipped.add(key);
    }
    return { sourceRow, raw: kept };
  });

  // 2) Normalisasi & cari karyawan yang sudah ada.
  let blank = 0;
  const normalized = rows.flatMap(({ sourceRow, raw }) => {
    if (isBlankImportRow(raw)) {
      blank++;
      return [];
    }
    return [{ sourceRow, ...normalizeImportRow(raw) }];
  });
  const numbers = [
    ...new Set(normalized.flatMap((n) => (n.row.employeeNumber ? [n.row.employeeNumber] : []))),
  ];
  const existingList = await importRepo.findByEmployeeNumbers(numbers);
  const existingByNumber = new Map(
    existingList.map((e) => [(e.employeeNumber ?? "").toUpperCase(), e]),
  );
  const ktpOwners = await importRepo.findKtpOwners(
    normalized.flatMap((n) => (n.row.personal.ktpNumber ? [n.row.personal.ktpNumber] : [])),
  );
  // D-063: kunci kedua = NIK KTP (baris tanpa NIP, atau karyawan yang belum punya NIP).
  const existingById = new Map(
    (
      await importRepo.findExistingByIds(
        [...new Set(ktpOwners.values())].filter((id) => !existingList.some((e) => e.id === id)),
      )
    )
      .concat(existingList)
      .map((e) => [e.id, e]),
  );
  const emailOwners = await importRepo.findEmailOwners(
    normalized.flatMap((n) => (n.row.workEmail ? [n.row.workEmail] : [])),
  );
  const personalEmailOwners = await importRepo.findPersonalEmailOwners(
    normalized.flatMap((n) => (n.row.personalEmail ? [n.row.personalEmail] : [])),
  );

  const seenNumber = new Set<string>();
  const seenKtp = new Set<string>();
  const seenEmail = new Set<string>();
  const seenPersonalEmail = new Set<string>();
  const plans: RowPlan[] = normalized.map(({ sourceRow, row, issues }) => {
    const plan: RowPlan = { sourceRow, action: "CREATE", row, issues: [...issues], changes: [] };
    const number = row.employeeNumber;
    if (number) {
      if (seenNumber.has(number)) plan.issues.push(issue("employeeNumber", "DUPLICATE_IN_FILE"));
      seenNumber.add(number);
    }
    const ktp = row.personal.ktpNumber;
    if (ktp) {
      if (seenKtp.has(ktp)) plan.issues.push(issue("ktpNumber", "DUPLICATE_KTP_IN_FILE"));
      seenKtp.add(ktp);
    }
    if (row.workEmail) {
      if (seenEmail.has(row.workEmail))
        plan.issues.push(issue("workEmail", "DUPLICATE_EMAIL_IN_FILE"));
      seenEmail.add(row.workEmail);
    }
    if (row.personalEmail) {
      if (seenPersonalEmail.has(row.personalEmail))
        plan.issues.push(issue("personalEmail", "DUPLICATE_PERSONAL_EMAIL_IN_FILE"));
      seenPersonalEmail.add(row.personalEmail);
    }
    let existing = number ? existingByNumber.get(number) : undefined;
    const ktpOwner = ktp ? existingById.get(ktpOwners.get(ktp) ?? "") : undefined;
    // NIP baris kosong → cocok lewat NIK; NIP baris terisi → hanya bila karyawan itu belum punya NIP
    // (NIP lalu diisi lewat import). NIP berbeda tetap bentrok (KTP_TAKEN di bawah).
    if (!existing && ktpOwner && (!number || !ktpOwner.employeeNumber)) existing = ktpOwner;
    if (existing) plan.existing = existing;

    // Perusahaan (D-039/D-040): PT per baris di Pratinjau (D-064) > kode di file > PT bawaan >
    // satu-satunya PT dalam cakupan.
    let companyId: string | undefined;
    const companyOverride = body.companyOverrides?.[String(sourceRow)];
    if (companyOverride) {
      const company = lookup.companies.get(companyOverride);
      if (!company || company.deleted) plan.issues.push(issue("companyCode", "COMPANY_UNKNOWN"));
      else [companyId, plan.companySource] = [company.id, "ROW"];
    } else if (row.companyCode) {
      const company = companyByCode.get(row.companyCode);
      if (!company) plan.issues.push(issue("companyCode", "COMPANY_UNKNOWN"));
      else [companyId, plan.companySource] = [company.id, "FILE"];
    } else if (existing) [companyId, plan.companySource] = [existing.companyId, "EXISTING"];
    else if (body.companyId) [companyId, plan.companySource] = [body.companyId, "DEFAULT"];
    else if (scopeCompanies.length === 1)
      [companyId, plan.companySource] = [scopeCompanies[0], "DEFAULT"];
    if (companyId) {
      plan.companyId = companyId;
      if (!existing || companyId !== existing.companyId) {
        if (!policy.canCreateInCompany(ctx.actor, companyId))
          plan.issues.push(issue("companyCode", "COMPANY_OUT_OF_SCOPE"));
      }
    } else if (!existing && !plan.issues.some((i) => i.field === "companyCode")) {
      plan.issues.push(issue("companyCode", "COMPANY_REQUIRED"));
    }

    // D-062: baris yang belum ada di sistem — status pilihan per baris > kolom status file > status
    // bawaan. Karyawan yang sudah ada hanya berubah status lewat kolom file (tidak lewat bawaan/per baris).
    const override = existing ? undefined : body.employmentStatusOverrides?.[String(sourceRow)];
    if (override) {
      if (activeStatus(lookup, override)) plan.statusId = override;
      else plan.issues.push(issue("employmentStatusText", "STATUS_INVALID"));
    } else if (row.category) {
      const statusId = statusIdFor(lookup, row.category);
      if (statusId) plan.statusId = statusId;
      else plan.issues.push(issue("employmentStatusText", "STATUS_NOT_CONFIGURED"));
    } else if (!existing && body.defaultEmploymentStatusId) {
      if (activeStatus(lookup, body.defaultEmploymentStatusId))
        plan.statusId = body.defaultEmploymentStatusId;
      else plan.issues.push(issue("employmentStatusText", "STATUS_INVALID"));
    }
    if (ktp && ktpOwners.has(ktp) && ktpOwners.get(ktp) !== existing?.id)
      plan.issues.push(issue("ktpNumber", "KTP_TAKEN"));
    if (
      row.workEmail &&
      emailOwners.has(row.workEmail) &&
      emailOwners.get(row.workEmail) !== existing?.id
    )
      plan.issues.push(issue("workEmail", "EMAIL_TAKEN"));
    if (
      row.personalEmail &&
      personalEmailOwners.has(row.personalEmail) &&
      personalEmailOwners.get(row.personalEmail) !== existing?.id
    )
      plan.issues.push(issue("personalEmail", "PERSONAL_EMAIL_TAKEN"));

    if (existing) {
      const target = {
        employeeId: existing.id,
        managerId: existing.managerId,
        companyId: existing.companyId,
      };
      if (!policy.canViewEmployee(ctx.actor, target)) {
        plan.issues.push(issue("employeeNumber", "EXISTING_OUT_OF_SCOPE"));
      } else if (existing.onboardingStatus !== "APPROVED") {
        // D-045: data calon diisi sendiri lewat onboarding; import tidak boleh menimpanya.
        plan.issues.push(issue("employeeNumber", "ONBOARDING_IN_PROGRESS"));
      } else if (body.mode === "CREATE_ONLY") {
        plan.action = "SKIP";
        plan.issues.push(issue("employeeNumber", "EXISTS_SKIPPED", "WARNING"));
      } else {
        plan.action = "UPDATE";
        if (row.exit) plan.issues.push(issue("exitMarker", "EXIT_EXISTING_IGNORED", "WARNING"));
        // OD-6 (belum diputuskan): data sensitif milik akun sendiri tidak diubah lewat import.
        if (ctx.actor.employeeId === existing.id) {
          const hadSensitive =
            Object.keys(row.personal).length > 0 ||
            Object.keys(row.bank).length > 0 ||
            (row.family?.length ?? 0) > 0 ||
            (row.attachments?.length ?? 0) > 0;
          row.personal = {};
          row.bank = {};
          delete row.family;
          delete row.attachments;
          if (hadSensitive) plan.issues.push(issue(null, "SENSITIVE_OWN_ROW", "WARNING"));
        }
        plan.departmentName =
          row.departmentName ??
          (row.positionName ? departmentNameOf(lookup, existing.positionId) : undefined);
        plan.repeated = missingRepeated(row, existing);
        plan.changes = diff(row, existing, lookup, plan);
        if (plan.changes.length === 0) plan.action = "SKIP";
      }
    } else {
      if (!row.fullName) plan.issues.push(issue("fullName", "REQUIRED"));
      if (!plan.statusId && !plan.issues.some((i) => i.field === "employmentStatusText"))
        plan.issues.push(issue("employmentStatusText", "CATEGORY_REQUIRED"));
      if (!row.joinDate) plan.issues.push(issue("joinDate", "JOIN_DATE_REQUIRED"));
      // D-064: unit boleh dari kolom Departemen atau Divisi (dicocokkan di langkah unit).
      if (!row.positionName || (!row.departmentName && !row.divisionName))
        plan.issues.push(issue("positionName", "POSITION_REQUIRED"));
      plan.departmentName = row.departmentName;
      if (row.exit?.date && row.joinDate && row.exit.date < row.joinDate)
        plan.issues.push(issue("exitDate", "EXIT_BEFORE_JOIN"));
    }
    if (plan.issues.some((i) => i.severity === "ERROR")) plan.action = "ERROR";
    return plan;
  });

  // 3) D-064: Departemen/Divisi → unit organisasi (pilihan HR, nama persis, saran, atau unit baru).
  //    Pemetaan lama `masterDataMapping.departments` (nama → id) tetap diterima sebagai pilihan unit.
  const map = body.masterDataMapping ?? {};
  const legacyChoices = Object.fromEntries(
    Object.entries(map.departments ?? {}).map(([name, unitId]) => [unitKey(name), { unitId }]),
  );
  const unitResult = resolveUnits(plans, lookup, body.unitMapping ?? {}, legacyChoices);
  for (const p of plans) {
    if (p.action === "UPDATE" && p.existing && (p.row.departmentName || p.row.divisionName))
      p.changes = diff(p.row, p.existing, lookup, p);
    if (p.action === "UPDATE" && p.changes.length === 0) p.action = "SKIP";
  }

  // 4) Master data yang belum ada (hanya dari baris yang akan ditulis), setelah pemetaan pengguna.
  //    Baris UPDATE hanya menyumbang nama untuk field yang BERUBAH (nilai lama tidak ditulis ulang).
  const mapped = (dict: Record<string, string> | undefined, key: string) => dict?.[key];
  const wants = (p: RowPlan, field: ImportFieldKey) =>
    p.action === "CREATE" || p.changes.includes(field);
  // D-049: nama yang hanya ada di arsip (tanpa pemetaan) → error baris, bukan membuat item baru.
  const archived = archivedMasterIndex(lookup);
  for (const p of plans) {
    if (p.action !== "CREATE" && p.action !== "UPDATE") continue;
    const dept = p.departmentName;
    if (wants(p, "positionName") && dept && p.row.positionName) {
      if (!mapped(map.departments, masterKey(dept)) && archived.departments.has(masterKey(dept)))
        p.issues.push(issue("departmentName", "MASTER_ARCHIVED"));
      const key = positionKey(dept, p.row.positionName);
      if (!mapped(map.positions, key) && archived.positions.has(key))
        p.issues.push(issue("positionName", "MASTER_ARCHIVED"));
    }
    const grade = p.row.gradeName;
    if (wants(p, "gradeName") && grade && !mapped(map.grades, masterKey(grade)))
      if (archived.grades.has(masterKey(grade)))
        p.issues.push(issue("gradeName", "MASTER_ARCHIVED"));
    const location = p.row.workLocationName;
    if (
      wants(p, "workLocationName") &&
      location &&
      !mapped(map.workLocations, masterKey(location)) &&
      archived.workLocations.has(masterKey(location))
    )
      p.issues.push(issue("workLocationName", "MASTER_ARCHIVED"));
    if (p.issues.some((i) => i.severity === "ERROR")) p.action = "ERROR";
  }
  const writing = plans.filter((p) => p.action === "CREATE" || p.action === "UPDATE");
  const names: MasterDataNames = {
    departments: unitResult.newUnits.map((u) => u.name),
    positions: [],
    grades: [],
    workLocations: [],
    departmentSpecs: newUnitSpecs(unitResult.newUnits),
  };
  for (const p of writing) {
    const dept = p.departmentName;
    if (wants(p, "positionName") && dept && !mapped(map.departments, masterKey(dept)))
      names.departments.push(dept);
    if (
      wants(p, "positionName") &&
      p.row.positionName &&
      dept &&
      !mapped(map.positions, positionKey(dept, p.row.positionName))
    )
      names.positions.push({ department: dept, name: p.row.positionName });
    if (wants(p, "gradeName") && p.row.gradeName && !mapped(map.grades, masterKey(p.row.gradeName)))
      names.grades.push(p.row.gradeName);
    if (
      wants(p, "workLocationName") &&
      p.row.workLocationName &&
      !mapped(map.workLocations, masterKey(p.row.workLocationName))
    )
      names.workLocations.push(p.row.workLocationName);
  }
  const missing = missingMasterData(lookup, names);

  const counts = {
    total: rows.length,
    create: 0,
    update: 0,
    skip: 0,
    error: 0,
    blank,
    attachments: 0,
  };
  for (const p of plans) {
    counts.attachments += queuedAttachments(p).length;
    if (p.action === "CREATE") counts.create++;
    else if (p.action === "UPDATE") counts.update++;
    else if (p.action === "SKIP") counts.skip++;
    else counts.error++;
  }
  const previewRows = plans.map((p) => ({
    sourceRow: p.sourceRow,
    action: p.action,
    employeeNumber: p.row.employeeNumber ?? p.existing?.employeeNumber ?? null,
    fullName: p.row.fullName ?? p.existing?.fullName ?? null,
    companyCode: p.companyId ? (lookup.companies.get(p.companyId)?.code ?? null) : null,
    companySource: p.companySource ?? null,
    newEmployee: !p.existing,
    employmentStatusId: p.existing ? null : (p.statusId ?? null),
    changes: p.changes,
    issues: p.issues,
    attachments: queuedAttachments(p).length,
  }));
  const skippedFields = IMPORT_FIELD_KEYS.filter((k) => skipped.has(k));
  // Hash pratinjau: berubah bila hasil analisis ATAU data karyawan terkait berubah sejak pratinjau.
  const previewHash = createHash("sha256")
    .update(
      JSON.stringify({
        rows: previewRows,
        missing,
        skippedFields,
        stamp: existingList.map((e) => `${e.id}:${e.updatedAt.toISOString()}`).sort(),
      }),
    )
    .digest("hex");
  return {
    preview: {
      counts,
      rows: previewRows,
      units: unitResult.units,
      masterData: missing,
      skippedFields,
      previewHash,
    },
    plans,
    lookup,
    missing,
    writePersonal,
    writeBank,
  };
}

/** Field yang berubah (UPSERT): hanya nilai di file yang terisi & berbeda (sel kosong tidak menimpa). */
function diff(
  row: NormalizedImportRow,
  e: importRepo.ExistingEmployee,
  lookup: MasterLookup,
  plan: RowPlan,
): ImportFieldKey[] {
  const changes: ImportFieldKey[] = [];
  // Array (jenis SIM) & objek (nomor SIM per jenis) dibandingkan isinya, bukan rujukannya.
  const same = (a: unknown, b: unknown) =>
    (a !== null && typeof a === "object") || (b !== null && typeof b === "object")
      ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
      : a === b;
  const differs = (value: unknown, current: unknown) =>
    value !== undefined && !same(value, current ?? undefined);
  // D-063: NIP hanya bisa diisi (karyawan yang dicocokkan lewat NIK belum punya NIP), tidak diganti.
  if (row.employeeNumber && !e.employeeNumber) changes.push("employeeNumber");
  if (differs(row.fullName, e.fullName)) changes.push("fullName");
  if (differs(row.workEmail, e.workEmail)) changes.push("workEmail");
  if (differs(row.personalEmail, e.personalEmail)) changes.push("personalEmail");
  if (differs(row.phoneNumber, e.phoneNumber)) changes.push("phoneNumber");
  if (differs(row.emergencyPhone, e.emergencyPhone)) changes.push("emergencyPhone");
  if (differs(row.emergencyContactName, e.emergencyContactName))
    changes.push("emergencyContactName");
  if (differs(row.emergencyContactRelationship, e.emergencyContactRelationship))
    changes.push("emergencyContactRelationship");
  if (differs(row.gender, e.gender)) changes.push("gender");
  if (differs(row.joinDate, toIso(e.joinDate))) changes.push("joinDate");
  if (plan.companyId && plan.companyId !== e.companyId) changes.push("companyCode");
  if (plan.statusId && plan.statusId !== e.employmentStatusId) changes.push("employmentStatusText");
  const currentDept = departmentNameOf(lookup, e.positionId);
  const currentPosition = lookup.positions.get(e.positionId)?.name;
  if (
    row.positionName &&
    plan.departmentName &&
    positionKey(plan.departmentName, row.positionName) !==
      positionKey(currentDept ?? "", currentPosition ?? "")
  )
    changes.push("positionName");
  const grade = e.gradeId ? lookup.grades.get(e.gradeId)?.name : undefined;
  if (row.gradeName && masterKey(row.gradeName) !== masterKey(grade ?? ""))
    changes.push("gradeName");
  const location = e.workLocationId ? lookup.locations.get(e.workLocationId)?.name : undefined;
  if (row.workLocationName && masterKey(row.workLocationName) !== masterKey(location ?? ""))
    changes.push("workLocationName");
  const p = e.personal;
  for (const key of PERSONAL_KEYS) {
    const value = row.personal[key];
    const current = p ? (key === "birthDate" ? toIso(p.birthDate) : p[key]) : undefined;
    if (differs(value, current)) changes.push(PERSONAL_FIELD[key]);
  }
  if (differs(row.bank.bankName, e.bankAccount?.bankName)) changes.push("bankName");
  if (differs(row.bank.accountNumber, e.bankAccount?.accountNumber))
    changes.push("bankAccountNumber");
  if (differs(row.bank.accountHolder, e.bankAccount?.accountHolder))
    changes.push("bankAccountHolder");
  if (
    row.education &&
    !e.educations.some(
      (ed) =>
        ed.level === row.education?.level &&
        masterKey(ed.schoolName) ===
          masterKey(row.education?.schoolName ?? row.education?.level ?? ""),
    )
  )
    changes.push("educationText");
  if (plan.repeated) {
    for (const item of [
      ...plan.repeated.family,
      ...plan.repeated.educations,
      ...plan.repeated.certifications,
    ])
      changes.push(item.source);
  }
  return changes;
}

export async function preview(ctx: RequestContext, body: ImportBody): Promise<ImportPreview> {
  return (await analyze(ctx, body)).preview;
}

const personalData = (row: NormalizedImportRow) => ({
  ...row.personal,
  ...(row.personal.birthDate ? { birthDate: toDate(row.personal.birthDate) } : {}),
});

export async function commit(
  ctx: RequestContext,
  body: CommitBody,
  now = new Date(),
): Promise<{ jobId: string; counts: ImportPreview["counts"] }> {
  const analysis = await analyze(ctx, body);
  if (analysis.preview.previewHash !== body.previewHash) {
    throw new ConflictError("Data berubah sejak pratinjau. Ulangi pratinjau sebelum menyimpan.");
  }
  const { plans, lookup, missing, preview: result } = analysis;
  const audit = {
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  };
  const map = body.masterDataMapping ?? {};

  const attachments: importRepo.AttachmentInput[] = [];
  const queue = (plan: RowPlan, employeeId: string) => {
    for (const a of queuedAttachments(plan))
      attachments.push({
        employeeId,
        sourceRow: plan.sourceRow,
        field: a.source,
        target: a.target,
        note: a.note,
        documentNumber: a.documentNumber ?? null,
        driveFileIds: a.fileIds,
      });
  };

  const jobId = await importRepo.withLongTransaction(async (tx) => {
    const index = await createMissingMasterData(tx, lookup, missing, audit);
    const positionId = (dept: string, name: string) =>
      map.positions?.[positionKey(dept, name)] ?? index.positions.get(positionKey(dept, name));
    const gradeId = (name: string) =>
      map.grades?.[masterKey(name)] ?? index.grades.get(masterKey(name));
    const locationId = (name: string) =>
      map.workLocations?.[masterKey(name)] ?? index.workLocations.get(masterKey(name));

    for (const plan of plans) {
      const { row } = plan;
      const sensitiveSections = [
        Object.keys(row.personal).length > 0 && "personal",
        (row.bank.accountNumber || row.bank.bankName) && "bank",
        (row.family?.length ?? 0) > 0 && "family",
      ].filter(Boolean);

      if (plan.action === "CREATE") {
        const posId = positionId(
          plan.departmentName as string,
          row.positionName as string,
        ) as string;
        const created = await repository.createEmployee(tx, {
          companyId: plan.companyId as string,
          employeeNumber: row.employeeNumber ?? null,
          fullName: row.fullName as string,
          workEmail: row.workEmail ?? null,
          personalEmail: row.personalEmail ?? null,
          phoneNumber: row.phoneNumber ?? null,
          emergencyPhone: row.emergencyPhone ?? null,
          emergencyContactName: row.emergencyContactName ?? null,
          emergencyContactRelationship: row.emergencyContactRelationship ?? null,
          gender: row.gender ?? null,
          joinDate: toDate(row.joinDate as string),
          employmentStatusId: plan.statusId as string,
          positionId: posId,
          workLocationId: row.workLocationName ? (locationId(row.workLocationName) ?? null) : null,
          gradeId: row.gradeName ? (gradeId(row.gradeName) ?? null) : null,
          managerId: null,
          ...(row.exit
            ? {
                isActive: false,
                endDate: toDate(row.exit.date as string),
                exitReason: EXIT_REASON[row.exit.reason],
              }
            : {}),
        });
        if (Object.keys(row.personal).length > 0)
          await importRepo.upsertPersonal(tx, created.id, personalData(row));
        if (row.bank.accountNumber) await importRepo.upsertBank(tx, created.id, row.bank, false);
        if (row.education)
          await importRepo.createEducation(tx, {
            employeeId: created.id,
            level: row.education.level,
            schoolName: row.education.schoolName ?? row.education.level,
          });
        await writeRepeated(tx, created.id, missingRepeated(row));
        queue(plan, created.id);
        await repository.createHistory(tx, {
          employeeId: created.id,
          changeType: "HIRED",
          effectiveDate: toDate(row.joinDate as string),
          toStatusId: plan.statusId as string,
          toPositionId: posId,
          toCompanyId: plan.companyId as string,
          note: "Import data karyawan",
          changedBy: ctx.actor.accountId,
        });
        if (row.exit) {
          await repository.createHistory(tx, {
            employeeId: created.id,
            changeType: "DEACTIVATED",
            effectiveDate: toDate(row.exit.date as string),
            fromStatusId: plan.statusId as string,
            exitReason: EXIT_REASON[row.exit.reason],
            note: "Import data karyawan",
            changedBy: ctx.actor.accountId,
          });
        }
        await writeAudit(
          {
            ...audit,
            action: "employee.employee.create",
            entityType: "employee.employee",
            entityId: created.id,
            after: {
              source: "import",
              employeeNumber: row.employeeNumber,
              companyId: plan.companyId,
              employmentStatusId: plan.statusId,
              isActive: !row.exit,
            },
          },
          tx,
        );
        if (sensitiveSections.length > 0)
          await writeAudit(
            {
              ...audit,
              action: "employee.sensitive.write",
              entityType: "employee.employee",
              entityId: created.id,
              after: { source: "import", sections: sensitiveSections },
            },
            tx,
          );
      }

      if (plan.action === "UPDATE" && plan.existing) {
        const e = plan.existing;
        const has = (key: ImportFieldKey) => plan.changes.includes(key);
        const newPositionId =
          has("positionName") && plan.departmentName && row.positionName
            ? positionId(plan.departmentName, row.positionName)
            : undefined;
        await repository.updateEmployee(tx, e.id, {
          ...(has("employeeNumber") ? { employeeNumber: row.employeeNumber } : {}),
          ...(has("fullName") ? { fullName: row.fullName } : {}),
          ...(has("workEmail") ? { workEmail: row.workEmail } : {}),
          ...(has("personalEmail") ? { personalEmail: row.personalEmail } : {}),
          ...(has("phoneNumber") ? { phoneNumber: row.phoneNumber } : {}),
          ...(has("emergencyPhone") ? { emergencyPhone: row.emergencyPhone } : {}),
          ...(has("emergencyContactName")
            ? { emergencyContactName: row.emergencyContactName }
            : {}),
          ...(has("emergencyContactRelationship")
            ? { emergencyContactRelationship: row.emergencyContactRelationship }
            : {}),
          ...(has("gender") ? { gender: row.gender } : {}),
          ...(has("joinDate") ? { joinDate: toDate(row.joinDate as string) } : {}),
          ...(has("companyCode") ? { companyId: plan.companyId } : {}),
          ...(has("employmentStatusText") ? { employmentStatusId: plan.statusId } : {}),
          ...(newPositionId ? { positionId: newPositionId } : {}),
          ...(has("gradeName") && row.gradeName ? { gradeId: gradeId(row.gradeName) } : {}),
          ...(has("workLocationName") && row.workLocationName
            ? { workLocationId: locationId(row.workLocationName) }
            : {}),
        });
        const today = toDate(todayInJakarta(now));
        if (has("employmentStatusText"))
          await repository.createHistory(tx, {
            employeeId: e.id,
            changeType: "STATUS_CHANGED",
            effectiveDate: today,
            fromStatusId: e.employmentStatusId,
            toStatusId: plan.statusId as string,
            note: "Import data karyawan",
            changedBy: ctx.actor.accountId,
          });
        if (newPositionId)
          await repository.createHistory(tx, {
            employeeId: e.id,
            changeType: "POSITION_CHANGED",
            effectiveDate: today,
            fromPositionId: e.positionId,
            toPositionId: newPositionId,
            note: "Import data karyawan",
            changedBy: ctx.actor.accountId,
          });
        if (has("companyCode"))
          await repository.createHistory(tx, {
            employeeId: e.id,
            changeType: "COMPANY_CHANGED",
            effectiveDate: today,
            fromCompanyId: e.companyId,
            toCompanyId: plan.companyId as string,
            note: "Import data karyawan",
            changedBy: ctx.actor.accountId,
          });
        const personalChanges = PERSONAL_KEYS.filter((k) => has(PERSONAL_FIELD[k]));
        if (personalChanges.length > 0) {
          const data = personalData(row);
          await importRepo.upsertPersonal(
            tx,
            e.id,
            Object.fromEntries(personalChanges.map((k) => [k, data[k]])),
          );
        }
        if (has("bankName") || has("bankAccountNumber") || has("bankAccountHolder"))
          await importRepo.upsertBank(tx, e.id, row.bank, e.bankAccount !== null);
        if (has("educationText") && row.education)
          await importRepo.createEducation(tx, {
            employeeId: e.id,
            level: row.education.level,
            schoolName: row.education.schoolName ?? row.education.level,
          });
        if (plan.repeated) await writeRepeated(tx, e.id, plan.repeated);
        queue(plan, e.id);
        await writeAudit(
          {
            ...audit,
            action: "employee.employee.update",
            entityType: "employee.employee",
            entityId: e.id,
            before: {
              companyId: e.companyId,
              positionId: e.positionId,
              employmentStatusId: e.employmentStatusId,
            },
            after: { source: "import", changedFields: plan.changes },
          },
          tx,
        );
        const sections = [
          personalChanges.length > 0 && "personal",
          (plan.repeated?.family.length ?? 0) > 0 && "family",
          (has("bankName") || has("bankAccountNumber") || has("bankAccountHolder")) && "bank",
        ].filter(Boolean);
        if (sections.length > 0)
          await writeAudit(
            {
              ...audit,
              action: "employee.sensitive.write",
              entityType: "employee.employee",
              entityId: e.id,
              after: { source: "import", sections },
            },
            tx,
          );
      }
    }

    // Karyawan tanpa perubahan data (UPSERT) tetap boleh mendapat lampiran.
    for (const plan of plans)
      if (plan.action === "SKIP" && plan.existing) queue(plan, plan.existing.id);
    const id = await importRepo.createJob(
      tx,
      {
        actorAccountId: ctx.actor.accountId,
        companyId: body.companyId ?? null,
        fileName: body.fileName,
        fileSha256: body.fileSha256,
        mode: body.mode,
        totalRows: result.counts.total,
        createdCount: result.counts.create,
        updatedCount: result.counts.update,
        skippedCount: result.counts.skip,
        errorCount: result.counts.error,
        skippedFields: result.skippedFields,
      },
      plans.flatMap((p) =>
        p.issues.map((i) => ({
          sourceRow: p.sourceRow,
          sourceColumn: null,
          field: i.field,
          code: i.code,
          severity: i.severity,
        })),
      ),
    );
    await importRepo.createAttachments(tx, id, attachments);
    await writeAudit(
      {
        ...audit,
        action: "employee.import.completed",
        entityType: "employee.import_job",
        entityId: id,
        after: {
          mode: body.mode,
          fileSha256: body.fileSha256,
          counts: result.counts,
          newMasterData: {
            departments: missing.departments.length,
            positions: missing.positions.length,
            grades: missing.grades.length,
            workLocations: missing.workLocations.length,
          },
          skippedFields: result.skippedFields,
          attachments: attachments.length,
        },
      },
      tx,
    );
    return id;
  });
  return { jobId, counts: result.counts };
}

function toJobDto(job: NonNullable<Awaited<ReturnType<typeof importRepo.findJob>>>): ImportJobDto {
  return {
    id: job.id,
    actorAccountId: job.actorAccountId,
    companyId: job.companyId,
    fileName: job.fileName,
    mode: job.mode,
    totalRows: job.totalRows,
    createdCount: job.createdCount,
    updatedCount: job.updatedCount,
    skippedCount: job.skippedCount,
    errorCount: job.errorCount,
    skippedFields: job.skippedFields,
    createdAt: job.createdAt.toISOString(),
  };
}

/** Riwayat import: SA semua; HR hanya import miliknya sendiri. */
export async function listJobs(ctx: RequestContext, query: { page: number; pageSize: number }) {
  if (!policy.canImportEmployees(ctx.actor)) throw new ForbiddenError();
  const where = ctx.actor.role === "SUPER_ADMIN" ? {} : { actorAccountId: ctx.actor.accountId };
  const { rows, total } = await importRepo.listJobs(
    where,
    (query.page - 1) * query.pageSize,
    query.pageSize,
  );
  return {
    data: rows.map((row) => toJobDto({ ...row, issues: [] })),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function getJob(ctx: RequestContext, id: string) {
  if (!policy.canImportEmployees(ctx.actor)) throw new ForbiddenError();
  const job = await importRepo.findJob(id);
  if (!job || (ctx.actor.role !== "SUPER_ADMIN" && job.actorAccountId !== ctx.actor.accountId)) {
    throw new NotFoundError("Riwayat import tidak ditemukan.");
  }
  return {
    ...toJobDto(job),
    issues: job.issues.map((i) => ({
      sourceRow: i.sourceRow,
      sourceColumn: i.sourceColumn,
      field: i.field,
      code: i.code,
      severity: i.severity,
    })),
  };
}

/**
 * Profil tersimpan: bentuk lama = peta kolom saja; D-064 = `{ columns, units }` (pilihan unit ikut
 * diingat). Pilihan unit yang tidak lolos skema (mis. versi lama) diabaikan, bukan error.
 */
function mappingDto(row: { signature: string; mapping: unknown; updatedAt: Date }) {
  const stored = (row.mapping ?? {}) as Record<string, unknown>;
  const modern = typeof stored.columns === "object" && stored.columns !== null;
  const units = unitChoicesSchema.safeParse(modern ? stored.units : undefined);
  return {
    signature: row.signature,
    mapping: (modern ? stored.columns : stored) as Record<string, ImportFieldKey | null>,
    unitChoices: units.success ? units.data : {},
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getMapping(ctx: RequestContext, signature: string) {
  if (!policy.canImportEmployees(ctx.actor)) throw new ForbiddenError();
  const row = await importRepo.findMapping(signature);
  if (!row) throw new NotFoundError("Belum ada pemetaan tersimpan untuk susunan header ini.");
  return mappingDto(row);
}

export async function saveMapping(
  ctx: RequestContext,
  signature: string,
  mapping: Record<string, ImportFieldKey | null>,
  unitChoices?: Record<string, UnitChoice>,
) {
  if (!policy.canImportEmployees(ctx.actor)) throw new ForbiddenError();
  // Tanpa pilihan unit di permintaan → pilihan yang sudah tersimpan dipertahankan.
  const kept =
    unitChoices ??
    (await importRepo.findMapping(signature).then((r) => (r ? mappingDto(r).unitChoices : {})));
  const row = await importRepo.upsertMapping(
    signature,
    { columns: mapping, units: kept },
    ctx.actor.accountId,
  );
  return mappingDto(row);
}
