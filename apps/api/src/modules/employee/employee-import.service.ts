import { createHash } from "node:crypto";
import {
  fieldPermission,
  IMPORT_FIELD_KEYS,
  type ImportFieldKey,
  type ImportRowIssue,
  isBlankImportRow,
  type NormalizedImportRow,
  normalizeImportRow,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import {
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
import type {
  CommitBody,
  ImportBody,
  ImportJobDto,
  ImportPreview,
} from "./employee-import.schema.ts";

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
  statusId?: string;
  /** Departemen untuk jabatan (dari file atau departemen jabatan saat ini). */
  departmentName?: string;
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
  const existingByNumber = new Map(existingList.map((e) => [e.employeeNumber.toUpperCase(), e]));
  const ktpOwners = await importRepo.findKtpOwners(
    normalized.flatMap((n) => (n.row.personal.ktpNumber ? [n.row.personal.ktpNumber] : [])),
  );
  const emailOwners = await importRepo.findEmailOwners(
    normalized.flatMap((n) => (n.row.workEmail ? [n.row.workEmail] : [])),
  );

  const seenNumber = new Set<string>();
  const seenKtp = new Set<string>();
  const seenEmail = new Set<string>();
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
    const existing = number ? existingByNumber.get(number) : undefined;
    if (existing) plan.existing = existing;

    // Perusahaan (D-039/D-040): kode di file > PT bawaan > satu-satunya PT dalam cakupan.
    let companyId: string | undefined;
    if (row.companyCode) {
      const company = companyByCode.get(row.companyCode);
      if (!company) plan.issues.push(issue("companyCode", "COMPANY_UNKNOWN"));
      else companyId = company.id;
    } else if (existing) companyId = existing.companyId;
    else if (body.companyId) companyId = body.companyId;
    else if (scopeCompanies.length === 1) companyId = scopeCompanies[0];
    if (companyId) {
      plan.companyId = companyId;
      if (!existing || companyId !== existing.companyId) {
        if (!policy.canCreateInCompany(ctx.actor, companyId))
          plan.issues.push(issue("companyCode", "COMPANY_OUT_OF_SCOPE"));
      }
    } else if (!existing && !plan.issues.some((i) => i.field === "companyCode")) {
      plan.issues.push(issue("companyCode", "COMPANY_REQUIRED"));
    }

    if (row.category) {
      const statusId = statusIdFor(lookup, row.category);
      if (statusId) plan.statusId = statusId;
      else plan.issues.push(issue("employmentStatusText", "STATUS_NOT_CONFIGURED"));
    }
    if (ktp && ktpOwners.has(ktp) && ktpOwners.get(ktp) !== existing?.id)
      plan.issues.push(issue("ktpNumber", "KTP_TAKEN"));
    if (
      row.workEmail &&
      emailOwners.has(row.workEmail) &&
      emailOwners.get(row.workEmail) !== existing?.id
    )
      plan.issues.push(issue("workEmail", "EMAIL_TAKEN"));

    if (existing) {
      const target = {
        employeeId: existing.id,
        managerId: existing.managerId,
        companyId: existing.companyId,
      };
      if (!policy.canViewEmployee(ctx.actor, target)) {
        plan.issues.push(issue("employeeNumber", "EXISTING_OUT_OF_SCOPE"));
      } else if (body.mode === "CREATE_ONLY") {
        plan.action = "SKIP";
        plan.issues.push(issue("employeeNumber", "EXISTS_SKIPPED", "WARNING"));
      } else {
        plan.action = "UPDATE";
        if (row.exit) plan.issues.push(issue("exitMarker", "EXIT_EXISTING_IGNORED", "WARNING"));
        // OD-6 (belum diputuskan): data sensitif milik akun sendiri tidak diubah lewat import.
        if (ctx.actor.employeeId === existing.id) {
          const hadSensitive =
            Object.keys(row.personal).length > 0 || Object.keys(row.bank).length > 0;
          row.personal = {};
          row.bank = {};
          if (hadSensitive) plan.issues.push(issue(null, "SENSITIVE_OWN_ROW", "WARNING"));
        }
        plan.departmentName =
          row.departmentName ??
          (row.positionName ? departmentNameOf(lookup, existing.positionId) : undefined);
        plan.changes = diff(row, existing, lookup, plan);
        if (plan.changes.length === 0) plan.action = "SKIP";
      }
    } else {
      if (!row.fullName) plan.issues.push(issue("fullName", "REQUIRED"));
      if (!row.category) plan.issues.push(issue("employmentStatusText", "CATEGORY_REQUIRED"));
      if (!row.joinDate) plan.issues.push(issue("joinDate", "JOIN_DATE_REQUIRED"));
      if (!row.positionName || !row.departmentName)
        plan.issues.push(issue("positionName", "POSITION_REQUIRED"));
      plan.departmentName = row.departmentName;
      if (row.exit?.date && row.joinDate && row.exit.date < row.joinDate)
        plan.issues.push(issue("exitDate", "EXIT_BEFORE_JOIN"));
    }
    if (plan.issues.some((i) => i.severity === "ERROR")) plan.action = "ERROR";
    return plan;
  });

  // 3) Master data yang belum ada (hanya dari baris yang akan ditulis), setelah pemetaan pengguna.
  const map = body.masterDataMapping ?? {};
  const mapped = (dict: Record<string, string> | undefined, key: string) => dict?.[key];
  const writing = plans.filter((p) => p.action === "CREATE" || p.action === "UPDATE");
  const names: MasterDataNames = { departments: [], positions: [], grades: [], workLocations: [] };
  for (const p of writing) {
    const dept = p.departmentName;
    if (dept && !mapped(map.departments, masterKey(dept))) names.departments.push(dept);
    if (p.row.positionName && dept && !mapped(map.positions, positionKey(dept, p.row.positionName)))
      names.positions.push({ department: dept, name: p.row.positionName });
    if (p.row.gradeName && !mapped(map.grades, masterKey(p.row.gradeName)))
      names.grades.push(p.row.gradeName);
    if (p.row.workLocationName && !mapped(map.workLocations, masterKey(p.row.workLocationName)))
      names.workLocations.push(p.row.workLocationName);
  }
  const missing = missingMasterData(lookup, names);

  const counts = { total: rows.length, create: 0, update: 0, skip: 0, error: 0, blank };
  for (const p of plans) {
    if (p.action === "CREATE") counts.create++;
    else if (p.action === "UPDATE") counts.update++;
    else if (p.action === "SKIP") counts.skip++;
    else counts.error++;
  }
  const previewRows = plans.map((p) => ({
    sourceRow: p.sourceRow,
    action: p.action,
    employeeNumber: p.row.employeeNumber ?? null,
    fullName: p.row.fullName ?? p.existing?.fullName ?? null,
    companyCode: p.companyId ? (lookup.companies.get(p.companyId)?.code ?? null) : null,
    changes: p.changes,
    issues: p.issues,
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
    preview: { counts, rows: previewRows, masterData: missing, skippedFields, previewHash },
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
  const differs = (value: unknown, current: unknown) =>
    value !== undefined && value !== (current ?? undefined);
  if (differs(row.fullName, e.fullName)) changes.push("fullName");
  if (differs(row.workEmail, e.workEmail)) changes.push("workEmail");
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
      ].filter(Boolean);

      if (plan.action === "CREATE") {
        const posId = positionId(
          plan.departmentName as string,
          row.positionName as string,
        ) as string;
        const created = await repository.createEmployee(tx, {
          companyId: plan.companyId as string,
          employeeNumber: row.employeeNumber as string,
          fullName: row.fullName as string,
          workEmail: row.workEmail ?? null,
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
          ...(has("fullName") ? { fullName: row.fullName } : {}),
          ...(has("workEmail") ? { workEmail: row.workEmail } : {}),
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

export async function getMapping(ctx: RequestContext, signature: string) {
  if (!policy.canImportEmployees(ctx.actor)) throw new ForbiddenError();
  const row = await importRepo.findMapping(signature);
  if (!row) throw new NotFoundError("Belum ada pemetaan tersimpan untuk susunan header ini.");
  return {
    signature: row.signature,
    mapping: row.mapping as Record<string, ImportFieldKey | null>,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveMapping(
  ctx: RequestContext,
  signature: string,
  mapping: Record<string, ImportFieldKey | null>,
) {
  if (!policy.canImportEmployees(ctx.actor)) throw new ForbiddenError();
  const row = await importRepo.upsertMapping(signature, mapping, ctx.actor.accountId);
  return {
    signature: row.signature,
    mapping: row.mapping as Record<string, ImportFieldKey | null>,
    updatedAt: row.updatedAt.toISOString(),
  };
}
