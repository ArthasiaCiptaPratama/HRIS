import {
  EDUCATION_LEVEL_LABELS,
  FAMILY_RELATIONSHIP_LABELS,
  type FieldChangeSection,
  type FieldChangeSource,
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  PTKP_LABELS,
  RELIGION_LABELS,
  TRAINING_TYPE_LABELS,
} from "@hris/shared";
import { getMasterLookup, listOrgPosts, type MasterLookup } from "../organization/index.ts";
import type { EmployeeTx } from "./employee.repository.ts";

export interface FieldChange {
  section: FieldChangeSection;
  field: string;
  oldValue: string | null;
  newValue: string | null;
}
type Values = Record<string, unknown>;
const normalized = (value: string | null | undefined) => value?.trim() || null;
const labels: Record<string, Record<string, string>> = {
  gender: GENDER_LABELS,
  religion: RELIGION_LABELS,
  maritalStatus: MARITAL_STATUS_LABELS,
  ptkpStatus: PTKP_LABELS,
  relationship: FAMILY_RELATIONSHIP_LABELS,
  level: EDUCATION_LEVEL_LABELS,
  type: TRAINING_TYPE_LABELS,
};

/** Teks tampilan pada saat perubahan, tanpa id/path internal. Nilai sensitif tetap utuh. */
export function formatFieldValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (Array.isArray(value))
    return normalized(value.map((v) => String(v).replaceAll("_", " ")).join(", "));
  if (typeof value === "object" && !("toFixed" in value)) {
    return normalized(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
        .join("; "),
    );
  }
  return normalized(labels[field]?.[String(value)] ?? String(value));
}

export function diffScalars(
  section: FieldChangeSection,
  before: Values | null | undefined,
  after: Values | null | undefined,
  keys: readonly string[],
  format: (field: string, value: unknown) => string | null = formatFieldValue,
): FieldChange[] {
  return keys.flatMap((field) => {
    const oldValue = normalized(format(field, before?.[field]));
    const newValue = normalized(format(field, after?.[field]));
    return oldValue === newValue ? [] : [{ section, field, oldValue, newValue }];
  });
}

/** Antrean per kunci juga menjaga dua baris yang kebetulan mempunyai nama yang sama. */
export function diffRows<T>(
  section: FieldChangeSection,
  field: string,
  beforeRows: readonly T[],
  afterRows: readonly T[],
  keyOf: (row: T) => string,
  summarize: (row: T) => string | null,
): FieldChange[] {
  const pending = new Map<string, T[]>();
  for (const row of beforeRows) {
    const key = keyOf(row);
    pending.set(key, [...(pending.get(key) ?? []), row]);
  }
  const pairs: { before: T | undefined; after: T | undefined }[] = afterRows.map((after) => ({
    before: pending.get(keyOf(after))?.shift(),
    after,
  }));
  for (const rows of pending.values())
    for (const before of rows) pairs.push({ before, after: undefined });
  return pairs.flatMap(({ before, after }) => {
    const oldValue = normalized(before === undefined ? null : summarize(before));
    const newValue = normalized(after === undefined ? null : summarize(after));
    return oldValue === newValue ? [] : [{ section, field, oldValue, newValue }];
  });
}

export async function recordFieldChanges(
  tx: EmployeeTx,
  input: {
    employeeId: string;
    actorAccountId: string | null;
    source: FieldChangeSource;
    groupId?: string;
    refId?: string | null;
    changes: FieldChange[];
  },
) {
  const changes = input.changes
    .map((c) => ({ ...c, oldValue: normalized(c.oldValue), newValue: normalized(c.newValue) }))
    .filter((c) => c.oldValue !== c.newValue);
  if (!changes.length) return;
  const groupId = input.groupId ?? crypto.randomUUID();
  await tx.employeeFieldChange.createMany({
    data: changes.map((c) => ({
      ...c,
      employeeId: input.employeeId,
      changedBy: input.actorAccountId,
      source: input.source,
      groupId,
      refId: input.refId ?? null,
    })),
  });
}

export const PERSONAL_FIELDS = [
  "ktpNumber",
  "npwpNumber",
  "kkNumber",
  "birthPlace",
  "birthDate",
  "ktpAddress",
  "domicileAddress",
  "maritalStatus",
  "religion",
  "bpjsEmploymentNumber",
  "bpjsHealthNumber",
  "ptkpStatus",
  "originCity",
  "npwpAbsent",
  "bpjsEmploymentAbsent",
  "bpjsHealthAbsent",
  "nickname",
  "nationality",
  "ethnicity",
  "bloodType",
  "drivingLicenseTypes",
  "drivingLicenseNumber",
  "drivingLicenseNumbers",
  "emergencyContactAddress",
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
export const EMERGENCY_FIELDS = [
  "emergencyContactName",
  "emergencyContactRelationship",
  "emergencyPhone",
] as const;
export const BANK_FIELDS = ["bankName", "accountNumber", "accountHolder"] as const;
const ROW_FIELDS: Partial<Record<FieldChangeSection, readonly string[]>> = {
  FAMILY: [
    "relationship",
    "name",
    "birthDate",
    "phoneNumber",
    "address",
    "gender",
    "birthPlace",
    "education",
    "occupation",
    "ageAtEntry",
    "workAddress",
    "relationDetail",
    "isDeceased",
  ],
  EDUCATION: ["level", "schoolName", "major", "entryYear", "graduationYear"],
  // Biaya selalu baris tersendiri supaya tidak bocor lewat ringkasan item.
  TRAINING: [
    "trainingField",
    "organizer",
    "duration",
    "trainingYear",
    "type",
    "startDate",
    "endDate",
    "hours",
    "certificateNumber",
  ],
  WORK_EXPERIENCE: ["companyName", "position", "startYear", "endYear", "description"],
};
export function summarizeRow(section: FieldChangeSection, row: Values): string | null {
  return normalized(
    (ROW_FIELDS[section] ?? [])
      .flatMap((field) => {
        const value = formatFieldValue(field, row[field]);
        return value === null ? [] : [value];
      })
      .join(" · "),
  );
}
const key = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("id");
export const familyKey = (row: Values) => `${row.relationship}:${key(row.name)}`;

/** Snapshot hanya bagian yang relevan, selalu di transaksi penulisan. */
export async function fieldSnapshot(
  tx: EmployeeTx,
  employeeId: string,
  sections: readonly FieldChangeSection[],
) {
  // Satu query per bagian, berurutan: `include` banyak relasi di klien transaksi interaktif membuat
  // adapter pg menjalankan query paralel di satu koneksi (peringatan pg; dilarang di pg@9).
  const has = (section: FieldChangeSection) => sections.includes(section);
  const where = { employeeId };
  const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } });
  const personal = has("PERSONAL") ? await tx.employeePersonal.findUnique({ where }) : null;
  const bankAccount = has("BANK") ? await tx.employeeBankAccount.findUnique({ where }) : null;
  const familyMembers = has("FAMILY")
    ? await tx.familyMember.findMany({ where, orderBy: { id: "asc" } })
    : [];
  const educations = has("EDUCATION")
    ? await tx.education.findMany({ where, orderBy: { id: "asc" } })
    : [];
  const trainings = has("TRAINING")
    ? await tx.training.findMany({ where, orderBy: { id: "asc" } })
    : [];
  const workExperiences = has("WORK_EXPERIENCE")
    ? await tx.workExperience.findMany({ where, orderBy: { id: "asc" } })
    : [];
  return {
    ...employee,
    personal,
    bankAccount,
    familyMembers,
    educations,
    trainings,
    workExperiences,
  };
}
type Snapshot = Awaited<ReturnType<typeof fieldSnapshot>>;

export async function diffWork(
  tx: EmployeeTx,
  before: Values,
  after: Values,
  lookup?: MasterLookup,
) {
  const masters = lookup ?? (await getMasterLookup(tx));
  const managerIds = [
    ...new Set(
      [before.managerId, after.managerId].filter((id): id is string => typeof id === "string"),
    ),
  ];
  // Berurutan: klien transaksi interaktif tidak boleh menjalankan query paralel.
  const managers = await tx.employee.findMany({
    where: { id: { in: managerIds } },
    select: { id: true, fullName: true },
  });
  const posts = before.orgPostId || after.orgPostId ? await listOrgPosts(tx) : [];
  const display = (row: Values) => ({
    ...row,
    company: masters.companies.get(String(row.companyId))?.name ?? null,
    position: masters.positions.get(String(row.positionId))?.name ?? null,
    status: masters.statuses.get(String(row.employmentStatusId))?.name ?? null,
    workLocation: masters.locations.get(String(row.workLocationId))?.name ?? null,
    grade: masters.grades.get(String(row.gradeId))?.name ?? null,
    manager: managers.find((m) => m.id === row.managerId)?.fullName ?? null,
    orgPost: (() => {
      const post = posts.find((p) => p.id === row.orgPostId);
      return post
        ? [post.positionName, post.departmentName, post.code].filter(Boolean).join(" · ")
        : null;
    })(),
  });
  return diffScalars("WORK", display(before), display(after), [
    "employeeNumber",
    "fullName",
    "workEmail",
    "phoneNumber",
    "gender",
    "joinDate",
    "company",
    "position",
    "orgPost",
    "workLocation",
    "grade",
    "manager",
    "status",
  ]);
}

export async function diffSnapshots(
  tx: EmployeeTx,
  before: Snapshot,
  after: Snapshot,
  sections: readonly FieldChangeSection[],
  lookup?: MasterLookup,
): Promise<FieldChange[]> {
  const changes: FieldChange[] = [];
  if (sections.includes("WORK")) changes.push(...(await diffWork(tx, before, after, lookup)));
  if (sections.includes("EMERGENCY"))
    changes.push(...diffScalars("EMERGENCY", before, after, EMERGENCY_FIELDS));
  if (sections.includes("PERSONAL"))
    changes.push(
      ...diffScalars("PERSONAL", before.personal, after.personal, PERSONAL_FIELDS),
      ...diffScalars("PERSONAL", before, after, ["personalEmail"]),
    );
  if (sections.includes("BANK"))
    changes.push(...diffScalars("BANK", before.bankAccount, after.bankAccount, BANK_FIELDS));
  const lists = [
    ["FAMILY", "familyMembers", familyKey],
    ["EDUCATION", "educations", (r: Values) => `${r.level}:${key(r.schoolName)}`],
    ["TRAINING", "trainings", (r: Values) => key(r.trainingField)],
    [
      "WORK_EXPERIENCE",
      "workExperiences",
      (r: Values) => `${key(r.companyName)}:${key(r.position)}:${r.startYear}`,
    ],
  ] as const;
  for (const [section, property, keyOf] of lists) {
    if (!sections.includes(section)) continue;
    changes.push(
      ...diffRows<Values>(
        section,
        section === "FAMILY" ? "member" : "item",
        before[property],
        after[property],
        keyOf,
        (r) => summarizeRow(section, r),
      ),
    );
    if (section === "TRAINING")
      changes.push(
        ...diffRows<Values>(section, "cost", before[property], after[property], keyOf, (r) =>
          formatFieldValue("cost", r.cost),
        ),
      );
  }
  return changes;
}
