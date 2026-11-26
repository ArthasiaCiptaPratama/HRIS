import {
  addContractDays,
  type ContractKind,
  contractEndFromDuration,
  contractRuleIssueCode,
  type EmploymentCategory,
  type ImportContractPeriod,
  type ImportFieldKey,
  type ImportRowIssue,
  importContractPeriod,
  type NormalizedImportRow,
  validateContractStage,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import {
  canManageContractsInCompany,
  correctContract,
  fillContract,
  readEmployeeContracts,
} from "../contract/index.ts";
import type { MasterLookup } from "../organization/index.ts";
import * as repository from "./employee.repository.ts";
import {
  copyActiveContract,
  type RequestContext,
  recordContractCorrection,
} from "./employee.service.ts";

// KTR-D12 (K3 poin 2): kolom kontrak di import → tabel kontrak lewat fungsi modul kontrak (aturan sama
// dengan aksi tab Kepegawaian). Pratinjau memakai pemeriksaan murni yang sama dengan service kontrak
// supaya pesan pratinjau = hasil simpan.

const toIso = (date: Date) => date.toISOString().slice(0, 10);
const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export interface ContractPlan {
  action: "CREATE" | "CORRECT" | "KEEP";
  kind: ContractKind;
  sequence: number | null;
  startDate: string;
  endDate: string;
  firstPkwtStartDate: string | null;
  /** Nilai "Mulai PKWT 1" yang dikirim ke service kontrak (null = tidak dikirim). */
  firstPkwtInput: string | null;
  /** Kontrak aktif yang dikoreksi/dibiarkan (nilai lamanya untuk pratinjau). */
  contractId: string | null;
  previous: { startDate: string; endDate: string } | null;
  category: "PKWT" | "PROBATION";
  joinDate: string;
}

/** Bagian rencana baris yang dibaca/diubah di sini (RowPlan service import). */
export interface ContractRowPlan {
  action: "CREATE" | "UPDATE" | "SKIP" | "ERROR";
  row: NormalizedImportRow;
  issues: ImportRowIssue[];
  changes: ImportFieldKey[];
  kept?: ImportFieldKey[];
  existing?: {
    id: string;
    companyId: string;
    employmentStatusId: string;
    joinDate: Date;
    isActive: boolean;
  };
  companyId?: string;
  statusId?: string;
  deactivate?: unknown;
  contract?: ContractPlan;
}

type ContractDto = Awaited<ReturnType<typeof readEmployeeContracts>>["contracts"][number];

// Baris karyawan yang sudah ada tetapi tidak boleh/tidak akan disentuh import.
const UNTOUCHED = new Set(["EXISTS_SKIPPED", "EXISTING_OUT_OF_SCOPE", "ONBOARDING_IN_PROGRESS"]);

const issue = (field: ImportFieldKey | null, code: string, severity: "ERROR" | "WARNING") =>
  ({ field, code, severity }) satisfies ImportRowIssue;

function ruleIssues(period: ImportContractPeriod, errors: string[], warnings: string[]) {
  const fieldOf = (code: string): ImportFieldKey =>
    code === "CONTRACT_STAGE_INVALID" || code === "CONTRACT_STAGE_ORDER"
      ? "contractStage"
      : code.startsWith("CONTRACT_FIRST_PKWT")
        ? "pkwtFirstStartDate"
        : code === "CONTRACT_OVERLAP" || code === "CONTRACT_BEFORE_JOIN"
          ? period.startField
          : period.endField;
  const toIssue = (severity: "ERROR" | "WARNING") => (message: string) => {
    const code = contractRuleIssueCode(message);
    return issue(fieldOf(code), code, severity);
  };
  // Satu pesan per kode (mis. dua pelanggaran tahap yang sama).
  const issues = [...errors.map(toIssue("ERROR")), ...warnings.map(toIssue("WARNING"))];
  return issues.filter((item, index) => issues.findIndex((i) => i.code === item.code) === index);
}

/** Sama dengan `fillContract` (modul kontrak) tanpa menulis. */
function checkCreate(
  kind: ContractKind,
  sequence: number,
  startDate: string,
  endDate: string,
  first: string | undefined,
  joinDate: string,
) {
  const errors: string[] = [];
  if (startDate < joinDate) errors.push("Tanggal mulai kontrak tidak boleh sebelum tanggal masuk.");
  if (kind === "PKWT" && sequence > 1 && !first)
    errors.push("Tanggal mulai PKWT 1 wajib untuk tahap lama tanpa kontrak sebelumnya.");
  if (kind === "PKWT" && sequence === 1 && first && first !== startDate)
    errors.push("Tanggal mulai PKWT 1 harus sama dengan awal tahap 1.");
  const stage = validateContractStage({
    kind,
    sequence: kind === "PKWT" ? sequence : null,
    startDate,
    endDate,
    previous:
      kind === "PKWT" && first
        ? { endDate: addContractDays(startDate, -1), sequence: sequence - 1, firstPkwtStart: first }
        : null,
  });
  return { errors: [...errors, ...stage.errors], warnings: stage.warnings };
}

/** Sama dengan `correctContract` (modul kontrak) tanpa menulis. */
function checkCorrect(
  active: ContractDto,
  contracts: ContractDto[],
  startDate: string,
  endDate: string,
  inputFirst: string | undefined,
  joinDate: string,
) {
  const errors: string[] = [];
  if (startDate < joinDate) errors.push("Tanggal mulai kontrak tidak boleh sebelum tanggal masuk.");
  const previous = active.previousContractId
    ? contracts.find((c) => c.id === active.previousContractId)
    : undefined;
  let firstPkwtStart: string | undefined;
  if (previous) {
    let root = previous;
    for (const seen = new Set<string>(); root.previousContractId && !seen.has(root.id); ) {
      seen.add(root.id);
      const next = contracts.find((c) => c.id === root.previousContractId);
      if (!next) break;
      root = next;
    }
    firstPkwtStart = root.pkwtFirstStartDate ?? root.startDate;
  } else if (active.kind === "PKWT" && (active.sequence ?? 1) > 1) {
    firstPkwtStart = inputFirst ?? active.pkwtFirstStartDate ?? undefined;
    if (!firstPkwtStart)
      errors.push("Tanggal mulai PKWT 1 wajib untuk tahap lama tanpa kontrak sebelumnya.");
  } else if (active.kind === "PKWT" && inputFirst && inputFirst !== startDate) {
    errors.push("Tanggal mulai PKWT 1 harus sama dengan awal tahap 1.");
  }
  const stage = validateContractStage({
    kind: active.kind,
    sequence: active.sequence,
    startDate,
    endDate,
    previous: previous
      ? {
          endDate: previous.endDate,
          sequence: previous.sequence,
          firstPkwtStart: firstPkwtStart ?? previous.startDate,
        }
      : firstPkwtStart
        ? {
            endDate: addContractDays(startDate, -1),
            sequence: (active.sequence ?? 1) - 1,
            firstPkwtStart,
          }
        : null,
  });
  return { errors: [...errors, ...stage.errors], warnings: stage.warnings };
}

/**
 * Rencana kontrak per baris (dipanggil `analyze` setelah aksi baris diketahui). Mengisi `plan.contract`,
 * menambah masalah baris, dan menandai kolom kontrak sebagai berubah/dibiarkan.
 * Mode: tanpa kontrak aktif → dibuat (semua mode); kontrak aktif tahap sama & tanggal beda → Perbarui:
 * dikoreksi, Isi yang kosong saja: dibiarkan; tahap/jenis beda → error.
 */
export async function planImportContracts(
  ctx: RequestContext,
  plans: ContractRowPlan[],
  lookup: MasterLookup,
  mode: "CREATE_ONLY" | "UPSERT" | "FILL_EMPTY",
  today: string,
): Promise<string[]> {
  const categoryOf = (statusId: string | undefined): EmploymentCategory | null =>
    (statusId ? lookup.statuses.get(statusId)?.category : undefined) ?? null;
  const touched = (p: ContractRowPlan) => !p.issues.some((i) => UNTOUCHED.has(i.code));
  const wanted = plans.filter(
    (p) =>
      p.existing &&
      touched(p) &&
      importContractPeriod(p.row.contract, "PKWT") !== null &&
      p.existing.isActive,
  );
  const contractsOf = new Map<string, ContractDto[]>();
  for (const p of wanted) {
    const e = p.existing as NonNullable<ContractRowPlan["existing"]>;
    if (contractsOf.has(e.id)) continue;
    const read = await readEmployeeContracts(
      {
        id: e.id,
        companyId: e.companyId,
        category: null,
        joinDate: e.joinDate,
        pkwttStartDate: null,
      },
      today,
      { manage: false, missingGrant: false },
    );
    contractsOf.set(e.id, read.contracts);
  }

  for (const plan of plans) {
    const { row, existing } = plan;
    if (existing && !touched(plan)) continue;
    // KTR-D4: ubah status ke/dari PKWT / Karyawan Percobaan hanya lewat Ubah Status / aksi kontrak.
    if (existing && plan.changes.includes("employmentStatusText")) {
      const from = categoryOf(existing.employmentStatusId);
      const to = categoryOf(plan.statusId);
      if ([from, to].some((c) => c === "PKWT" || c === "PROBATION")) {
        plan.issues.push(issue("employmentStatusText", "STATUS_CONTRACT_CATEGORY", "ERROR"));
        plan.action = "ERROR";
        continue;
      }
    }
    const category =
      existing && !plan.changes.includes("employmentStatusText")
        ? categoryOf(existing.employmentStatusId)
        : categoryOf(plan.statusId);
    const period = importContractPeriod(row.contract, category, {
      ...(row.contractSequence !== undefined ? { sequence: row.contractSequence } : {}),
      ...(row.durationMonths !== undefined ? { durationMonths: row.durationMonths } : {}),
    });
    if (period === null) continue;
    if ("ignored" in period) {
      plan.issues.push(issue(period.ignored[0] ?? null, "CONTRACT_FIELDS_IGNORED", "WARNING"));
      continue;
    }
    const willBeInactive = existing ? !existing.isActive || Boolean(plan.deactivate) : !!row.exit;
    if (willBeInactive) {
      plan.issues.push(issue(period.sources[0] ?? null, "CONTRACT_INACTIVE_IGNORED", "WARNING"));
      continue;
    }
    const companyId = plan.companyId ?? existing?.companyId;
    if (!companyId) continue;
    if (!canManageContractsInCompany(ctx.actor, companyId)) {
      plan.issues.push(issue(period.sources[0] ?? null, "CONTRACT_NO_PERMISSION", "WARNING"));
      continue;
    }
    const joinDate =
      existing && !plan.changes.includes("joinDate") ? toIso(existing.joinDate) : row.joinDate;
    if (!joinDate) continue;
    const kind = period.kind;
    const contracts = existing ? (contractsOf.get(existing.id) ?? []) : [];
    const active = contracts.find((c) => c.status === "ACTIVE");
    const before = plan.issues.length;

    if (active) {
      const stageMismatch =
        active.kind !== kind ||
        (kind === "PKWT" && period.sequence !== null && period.sequence !== active.sequence);
      if (stageMismatch) {
        plan.issues.push(
          issue(
            row.contract.stage !== undefined ? "contractStage" : "employmentStatusText",
            "CONTRACT_STAGE_MISMATCH",
            "ERROR",
          ),
        );
      } else {
        // Koreksi: kolom yang kosong = nilai kontrak aktif (sel kosong tidak menimpa).
        const startDate = period.startDate ?? active.startDate;
        const endDate =
          period.endDate ??
          (row.contract.durationMonths !== undefined
            ? contractEndFromDuration(startDate, row.contract.durationMonths)
            : active.endDate);
        const inputFirst =
          kind === "PKWT" && !active.previousContractId ? period.firstPkwtStartDate : undefined;
        // Tahap 1 tanpa kontrak sebelumnya: Mulai PKWT 1 wajib sama dengan awal tahap (juga saat tanggal tak berubah).
        if (inputFirst !== undefined && (active.sequence ?? 1) === 1 && inputFirst !== startDate) {
          plan.issues.push(issue("pkwtFirstStartDate", "CONTRACT_FIRST_PKWT_MISMATCH", "ERROR"));
          plan.action = "ERROR";
          continue;
        }
        const changed =
          startDate !== active.startDate ||
          endDate !== active.endDate ||
          (inputFirst !== undefined &&
            (active.sequence ?? 1) > 1 &&
            inputFirst !== active.pkwtFirstStartDate);
        if (changed) {
          const base = {
            kind,
            sequence: active.sequence,
            startDate,
            endDate,
            contractId: active.id,
            previous: { startDate: active.startDate, endDate: active.endDate },
            category: kind,
            joinDate,
          };
          if (mode === "FILL_EMPTY") {
            plan.contract = {
              ...base,
              action: "KEEP",
              firstPkwtStartDate: active.pkwtFirstStartDate,
              firstPkwtInput: null,
            };
            plan.kept = [...new Set([...(plan.kept ?? []), ...period.sources])];
          } else {
            const result = checkCorrect(
              active,
              contracts,
              startDate,
              endDate,
              inputFirst,
              joinDate,
            );
            plan.issues.push(...ruleIssues(period, result.errors, result.warnings));
            plan.contract = {
              ...base,
              action: "CORRECT",
              firstPkwtStartDate:
                (active.sequence ?? 1) > 1 && !active.previousContractId
                  ? (inputFirst ?? active.pkwtFirstStartDate)
                  : active.pkwtFirstStartDate,
              firstPkwtInput: inputFirst ?? null,
            };
          }
        }
      }
    } else if (!period.startDate || !period.endDate) {
      plan.issues.push(
        issue(
          period.startDate ? period.endField : period.startField,
          "CONTRACT_INCOMPLETE",
          "WARNING",
        ),
      );
    } else {
      const sequence = kind === "PKWT" ? (period.sequence ?? 1) : null;
      // Mulai PKWT 1 = mulai tahap 1 tidak perlu disimpan terpisah.
      const first =
        kind === "PKWT" && !(sequence === 1 && period.firstPkwtStartDate === period.startDate)
          ? period.firstPkwtStartDate
          : undefined;
      const result = checkCreate(
        kind,
        sequence ?? 1,
        period.startDate,
        period.endDate,
        first,
        joinDate,
      );
      plan.issues.push(...ruleIssues(period, result.errors, result.warnings));
      plan.contract = {
        action: "CREATE",
        kind,
        sequence,
        startDate: period.startDate,
        endDate: period.endDate,
        firstPkwtStartDate: first ?? null,
        firstPkwtInput: first ?? null,
        contractId: null,
        previous: null,
        category: kind,
        joinDate,
      };
    }

    const added = plan.issues.slice(before);
    if (added.some((i) => i.severity === "ERROR")) {
      plan.action = "ERROR";
      continue;
    }
    if (plan.contract && plan.contract.action !== "KEEP" && existing) {
      plan.changes = [...new Set([...plan.changes, ...period.sources])];
      if (plan.action === "SKIP") plan.action = "UPDATE";
    }
  }
  return [...contractsOf.values()].flat().map((c) => `${c.id}:${c.updatedAt}`);
}

/** Bentuk pratinjau (tanpa id kontrak). */
export function contractPreview(plan: ContractPlan | undefined) {
  if (!plan) return null;
  return {
    action: plan.action,
    kind: plan.kind,
    sequence: plan.sequence,
    startDate: plan.startDate,
    endDate: plan.endDate,
    firstPkwtStartDate: plan.firstPkwtStartDate,
    previous: plan.previous,
  };
}

/**
 * Tulis kontrak baris (di transaksi import) lewat modul kontrak + salinan kolom karyawan + riwayat +
 * audit. Pelanggaran aturan di sini (data berubah setelah pratinjau) menggagalkan seluruh simpan.
 */
export async function writeImportContract(
  tx: repository.EmployeeTx,
  ctx: RequestContext,
  employee: { id: string; companyId: string; employmentStatusId: string },
  plan: ContractPlan,
  audit: { actorAccountId: string; requestId: string | null; ip: string | null },
) {
  const actorId = ctx.actor.accountId;
  const target = {
    id: employee.id,
    companyId: employee.companyId,
    category: plan.category,
    joinDate: toDate(plan.joinDate),
    pkwttStartDate: null,
  };
  if (plan.action === "CREATE") {
    const result = await fillContract(
      target,
      {
        kind: plan.kind,
        ...(plan.sequence !== null ? { sequence: plan.sequence } : {}),
        startDate: plan.startDate,
        endDate: plan.endDate,
        ...(plan.firstPkwtInput ? { firstPkwtStartDate: plan.firstPkwtInput } : {}),
        note: "Import data karyawan",
      },
      actorId,
      tx,
    );
    await copyActiveContract(tx, employee.id, result.contract);
    await repository.createHistory(tx, {
      employeeId: employee.id,
      changeType: "CONTRACT_STAGE_CHANGED",
      effectiveDate: toDate(plan.startDate),
      fromStatusId: employee.employmentStatusId,
      toStatusId: employee.employmentStatusId,
      note: "Import data karyawan",
      changedBy: actorId,
    });
    await writeAudit(
      {
        ...audit,
        action: "contract.contract.create",
        entityType: "contract",
        entityId: employee.id,
        after: {
          source: "import",
          contractId: result.contract.id,
          kind: result.contract.kind,
          sequence: result.contract.sequence,
          startDate: result.contract.startDate,
          endDate: result.contract.endDate,
        },
      },
      tx,
    );
    return;
  }
  if (plan.action !== "CORRECT" || !plan.contractId) return;
  const note = "Koreksi lewat import";
  const result = await correctContract(
    target,
    plan.contractId,
    {
      startDate: plan.startDate,
      endDate: plan.endDate,
      ...(plan.firstPkwtInput ? { firstPkwtStartDate: plan.firstPkwtInput } : {}),
      note,
    },
    actorId,
    tx,
  );
  await copyActiveContract(tx, employee.id, result.contract);
  await recordContractCorrection(
    tx,
    employee.id,
    actorId,
    "IMPORT",
    result.before,
    result.contract,
  );
  await writeAudit(
    {
      ...audit,
      action: "contract.contract.correct",
      entityType: "contract",
      entityId: employee.id,
      before: {
        contractId: result.before.id,
        startDate: result.before.startDate,
        endDate: result.before.endDate,
        pkwtFirstStartDate: result.before.pkwtFirstStartDate,
      },
      after: {
        source: "import",
        startDate: result.contract.startDate,
        endDate: result.contract.endDate,
        pkwtFirstStartDate: result.contract.pkwtFirstStartDate,
      },
      reason: note,
    },
    tx,
  );
}
