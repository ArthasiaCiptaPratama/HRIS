import {
  canBeChildOf,
  childUnitType,
  type ImportFieldKey,
  type ImportRowIssue,
  ORG_UNIT_RANK,
  type OrgUnitType,
  type UnitSimilarity,
  unitKey,
  unitSimilarity,
} from "@hris/shared";
import { type MasterLookup, masterKey } from "../organization/index.ts";
import type { ImportPreview, UnitChoice } from "./employee-import.schema.ts";

// D-064: nilai kolom Departemen & Divisi (istilah di Form tidak konsisten) → unit organisasi jenis apa
// pun. Urutan: pilihan HR > nama persis unit yang ada > SARAN (salah ketik/singkatan — baris error sampai
// HR memilih) > unit baru dengan induk bawaan. Karyawan ditempatkan di unit PALING BAWAH dari keduanya.
// Dicocokkan PER PT (D-052: unit milik PT): nilai sama di PT berbeda = nilai terpisah; kandidat hanya
// unit milik PT itu atau unit grup (tanpa PT); unit baru milik PT barisnya.

type UnitColumn = "departmentName" | "divisionName";
type Unit = MasterLookup["departments"] extends Map<string, infer U> ? U : never;

interface PlanLike {
  action: "CREATE" | "UPDATE" | "SKIP" | "ERROR";
  companyId?: string;
  row: { departmentName?: string; divisionName?: string };
  issues: ImportRowIssue[];
  departmentName?: string;
}

type Resolution =
  | { kind: "existing"; unit: Unit }
  | {
      kind: "new";
      key: string;
      name: string;
      companyId: string | null;
      unitType: OrgUnitType;
      parentUnitId: string | null;
      parentKey: string | null;
    }
  | { kind: "review" }
  | { kind: "invalid" };

export interface NewUnitSpec {
  name: string;
  unitType: OrgUnitType;
  parentId: string | null;
  /** PT pemilik bila tanpa induk yang sudah ada (induk ada → PT ikut induk). */
  companyId: string | null;
  /** Induk yang juga unit baru dari import ini (dibuat lebih dulu). */
  parentName: string | null;
}

type UnitPreview = ImportPreview["units"][number];

const REASON_ORDER: Record<UnitSimilarity, number> = {
  SAME_NAME: 0,
  SPELLING: 1,
  ABBREVIATION: 2,
  CONTAINS: 3,
};

function mostCommon(counts: Map<string, number> | undefined, except: string): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  for (const [key, count] of counts ?? []) {
    if (key !== except && count > bestCount) [best, bestCount] = [key, count];
  }
  return best;
}

/** Kunci nilai per PT: "<id PT atau ->:<unitKey>". */
export const unitValueKey = (companyId: string | undefined | null, value: string) =>
  `${companyId ?? "-"}:${unitKey(value)}`;

export function resolveUnits(
  plans: PlanLike[],
  lookup: MasterLookup,
  choices: Record<string, UnitChoice>,
  /** Pilihan lama tanpa PT (kunci `unitKey`) — dipakai bila tidak ada pilihan per PT. */
  fallbackChoices: Record<string, UnitChoice> = {},
): { units: UnitPreview[]; newUnits: NewUnitSpec[] } {
  const live = [...lookup.departments.values()].filter((d) => !d.deleted);
  // Kandidat per PT: unit milik PT itu + unit grup (tanpa PT). Baris tanpa PT → unit grup saja.
  const candidatesOf = (companyId: string | null) =>
    live.filter((u) => u.companyId === null || (companyId !== null && u.companyId === companyId));
  const allowed = (unit: Unit | undefined, companyId: string | null): unit is Unit =>
    Boolean(unit && !unit.deleted && (unit.companyId === null || unit.companyId === companyId));
  const archivedKeys = new Set(
    [...lookup.departments.values()].filter((d) => d.deleted).map((d) => unitKey(d.name)),
  );

  // 1) Nilai unik per PT + kunci, dengan kolom asal, jumlah baris, dan pasangan kolom lain di baris.
  interface Value {
    key: string;
    baseKey: string;
    companyId: string | null;
    spellings: Map<string, number>;
    columns: Set<UnitColumn>;
    rows: number;
    partners: Map<string, number>;
  }
  const values = new Map<string, Value>();
  const keyOf = (p: PlanLike, raw: string | undefined) =>
    raw && unitKey(raw) ? unitValueKey(p.companyId, raw) : undefined;
  const keysOf = (p: PlanLike) => ({
    dept: keyOf(p, p.row.departmentName),
    div: keyOf(p, p.row.divisionName),
  });
  const active = plans.filter((p) => p.action !== "SKIP");
  for (const p of active) {
    const { dept, div } = keysOf(p);
    for (const [column, key, raw, partner] of [
      ["departmentName", dept, p.row.departmentName, div],
      ["divisionName", div, p.row.divisionName, dept],
    ] as const) {
      if (!key || !raw) continue;
      const value = values.get(key) ?? {
        key,
        baseKey: unitKey(raw),
        companyId: p.companyId ?? null,
        spellings: new Map(),
        columns: new Set(),
        rows: 0,
        partners: new Map(),
      };
      value.spellings.set(raw, (value.spellings.get(raw) ?? 0) + 1);
      value.columns.add(column);
      value.rows++;
      if (partner && partner !== key)
        value.partners.set(partner, (value.partners.get(partner) ?? 0) + 1);
      values.set(key, value);
    }
  }
  // Ejaan terlengkap ("HR & GA" > "HRGA"), seri → paling sering; huruf besar dibiarkan (singkatan unit).
  const nameOf = (v: Value) =>
    [...v.spellings.entries()].sort((a, b) => b[0].length - a[0].length || b[1] - a[1])[0]?.[0] ??
    v.key;

  // 2) Saran: unit yang ada + nilai lain di file yang lebih sering dipakai (atau seri → HR memilih).
  const suggestionsOf = (v: Value): UnitPreview["suggestions"] => {
    const name = nameOf(v);
    const fromUnits = candidatesOf(v.companyId).flatMap((u) => {
      const reason = unitSimilarity(name, u.name);
      return reason ? [{ unitId: u.id, key: null, name: u.name, reason }] : [];
    });
    const fromFile = [...values.values()].flatMap((other) => {
      if (other.key === v.key || other.companyId !== v.companyId || other.rows < v.rows) return [];
      const reason = unitSimilarity(name, nameOf(other));
      return reason ? [{ unitId: null, key: other.key, name: nameOf(other), reason }] : [];
    });
    return [...fromUnits, ...fromFile]
      .sort((a, b) => REASON_ORDER[a.reason] - REASON_ORDER[b.reason])
      .slice(0, 6);
  };

  // 3) Penyelesaian dasar per kunci (sameAs & induk bawaan diselesaikan setelahnya).
  const base = new Map<string, Resolution | { kind: "sameAs"; target: string }>();
  const status = new Map<string, UnitPreview["status"]>();
  for (const v of values.values()) {
    const choice = choices[v.key] ?? fallbackChoices[v.baseKey];
    if (choice && "unitId" in choice) {
      // Unit PT lain tidak boleh dipilih (karyawan PT ini tidak ditempatkan di unit PT lain).
      const unit = lookup.departments.get(choice.unitId);
      const ok = allowed(unit, v.companyId);
      base.set(v.key, ok && unit ? { kind: "existing", unit } : { kind: "invalid" });
      status.set(v.key, ok ? "CHOSEN" : "INVALID");
    } else if (choice && "sameAs" in choice) {
      const ok = choice.sameAs !== v.key && values.get(choice.sameAs)?.companyId === v.companyId;
      base.set(v.key, ok ? { kind: "sameAs", target: choice.sameAs } : { kind: "invalid" });
      status.set(v.key, ok ? "CHOSEN" : "INVALID");
    } else if (choice && "create" in choice) {
      base.set(v.key, {
        kind: "new",
        key: v.key,
        name: nameOf(v),
        companyId: v.companyId,
        unitType: choice.create.unitType,
        parentUnitId: choice.create.parentUnitId ?? null,
        parentKey: choice.create.parentKey ?? null,
      });
      status.set(v.key, "CHOSEN");
    } else {
      // Nama persis: unit milik PT ini diutamakan dari unit grup.
      const exact = candidatesOf(v.companyId).filter((u) => unitKey(u.name) === v.baseKey);
      const own = exact.filter((u) => u.companyId !== null);
      const match = own.length === 1 ? own[0] : exact.length === 1 ? exact[0] : undefined;
      if (match) {
        base.set(v.key, { kind: "existing", unit: match });
        status.set(v.key, "MATCHED");
      } else if (exact.length > 1 || suggestionsOf(v).length > 0 || archivedKeys.has(v.baseKey)) {
        base.set(v.key, { kind: "review" });
        status.set(v.key, "NEEDS_REVIEW");
      } else {
        base.set(v.key, {
          kind: "new",
          key: v.key,
          name: nameOf(v),
          companyId: v.companyId,
          unitType: v.columns.has("departmentName") ? "DEPARTMENT" : "DIVISION",
          parentUnitId: null,
          parentKey: null,
        });
        status.set(v.key, "NEW");
      }
    }
  }

  const resolved = new Map<string, Resolution>();
  const follow = (key: string): Resolution => {
    const r = base.get(key);
    if (!r) return { kind: "invalid" };
    if (r.kind !== "sameAs") return r;
    const target = base.get(r.target);
    // Satu tingkat saja: target yang juga "sama dengan" nilai lain dianggap tidak sah.
    return !target || target.kind === "sameAs" ? { kind: "invalid" } : target;
  };
  for (const key of values.keys()) resolved.set(key, follow(key));

  // 4) Induk bawaan unit baru tanpa pilihan HR: ikut pasangan kolom lain di baris yang sama.
  for (const v of values.values()) {
    const r = resolved.get(v.key);
    if (r?.kind !== "new" || status.get(v.key) !== "NEW") continue;
    const partnerKey = mostCommon(v.partners, v.key);
    const partner = partnerKey ? resolved.get(partnerKey) : undefined;
    if (v.columns.has("departmentName")) {
      // Departemen baru di bawah Divisi/Direktorat yang sudah ada (pola D-061).
      if (
        partner?.kind === "existing" &&
        ORG_UNIT_RANK[partner.unit.unitType] < ORG_UNIT_RANK.DEPARTMENT
      )
        r.parentUnitId = partner.unit.id;
    } else if (partner?.kind === "existing" && partner.unit.unitType !== "SECTION") {
      r.unitType = childUnitType(partner.unit.unitType);
      r.parentUnitId = partner.unit.id;
    } else if (partner?.kind === "new" && partnerKey) {
      r.unitType = childUnitType(partner.unitType);
      r.parentKey = partnerKey;
    }
  }

  // 5) Validasi induk unit baru (jenis yang sah, tanpa siklus).
  const typeOf = (r: Resolution | undefined) =>
    r?.kind === "existing" ? r.unit.unitType : r?.kind === "new" ? r.unitType : undefined;
  for (const [key, r] of resolved) {
    if (r.kind !== "new") continue;
    let parentType: OrgUnitType | null = null;
    let valid = true;
    if (r.parentUnitId) {
      const parent = lookup.departments.get(r.parentUnitId);
      valid = allowed(parent, r.companyId);
      parentType = parent?.unitType ?? null;
    } else if (r.parentKey) {
      const parent = resolved.get(r.parentKey);
      valid =
        r.parentKey !== key &&
        values.get(r.parentKey)?.companyId === r.companyId &&
        (parent?.kind === "existing" ||
          (parent?.kind === "new" && parent.parentKey !== key && parent.key !== key));
      parentType = typeOf(parent) ?? null;
    }
    if (!valid || !canBeChildOf(r.unitType, parentType)) {
      resolved.set(key, { kind: "invalid" });
      status.set(key, "INVALID");
    }
  }

  // 5b) Nama unit baru unik se-grup (nama unit unik di DB): bentrok dengan unit yang ada atau dengan unit
  //     baru bernama sama di PT lain → akhiran kode PT, mis. "Operations (CD2)" (pola bagan D-052).
  const taken = new Set([...lookup.departments.values()].map((d) => unitKey(d.name)));
  const newByName = new Map<string, Set<string | null>>();
  for (const r of resolved.values())
    if (r.kind === "new")
      newByName.set(
        unitKey(r.name),
        (newByName.get(unitKey(r.name)) ?? new Set()).add(r.companyId),
      );
  for (const r of new Set(resolved.values())) {
    if (r.kind !== "new") continue;
    const code = r.companyId ? lookup.companies.get(r.companyId)?.code : undefined;
    const clash = taken.has(unitKey(r.name)) || (newByName.get(unitKey(r.name))?.size ?? 0) > 1;
    if (clash && code) r.name = `${r.name} (${code})`;
  }

  // 6) Penempatan per baris: unit paling bawah dari Departemen & Divisi.
  const chainOf = (r: Resolution, depth = 0): string[] => {
    if (depth > 12) return [];
    if (r.kind === "existing") {
      const ids: string[] = [];
      let current: Unit | undefined = r.unit;
      for (let i = 0; current && i < 12; i++) {
        ids.push(`u:${current.id}`);
        current = current.parentId ? lookup.departments.get(current.parentId) : undefined;
      }
      return ids;
    }
    if (r.kind !== "new") return [];
    const parent = r.parentUnitId ? lookup.departments.get(r.parentUnitId) : undefined;
    const up = parent
      ? chainOf({ kind: "existing", unit: parent }, depth + 1)
      : r.parentKey
        ? chainOf(resolved.get(r.parentKey) ?? { kind: "invalid" }, depth + 1)
        : [];
    return [`k:${r.key}`, ...up];
  };
  const nameOfRes = (r: Resolution) =>
    r.kind === "existing" ? r.unit.name : r.kind === "new" ? r.name : undefined;
  const used = new Set<string>();
  const issue = (field: ImportFieldKey, code: string, severity: "ERROR" | "WARNING" = "ERROR") =>
    ({ field, code, severity }) satisfies ImportRowIssue;
  for (const p of active) {
    const { dept, div } = keysOf(p);
    const parts: { field: UnitColumn; r: Resolution }[] = [];
    for (const [field, key] of [
      ["departmentName", dept],
      ["divisionName", div],
    ] as const) {
      if (!key) continue;
      const r = resolved.get(key) ?? { kind: "invalid" };
      if (r.kind === "review") p.issues.push(issue(field, "UNIT_UNMATCHED"));
      else if (r.kind === "invalid") p.issues.push(issue(field, "UNIT_INVALID"));
      else parts.push({ field, r });
    }
    if (p.issues.some((i) => i.severity === "ERROR")) p.action = "ERROR";
    const [first, second] = parts;
    if (!first) continue;
    let place = first.r;
    if (second) {
      const a = chainOf(first.r);
      const b = chainOf(second.r);
      if (a[0] === b[0]) place = first.r;
      else if (b.includes(a[0] ?? "")) place = second.r;
      else if (a.includes(b[0] ?? "")) place = first.r;
      else {
        // Tidak segaris: ambil yang jenjangnya paling bawah, seri → Divisi; tandai untuk dicek HR.
        const ra = ORG_UNIT_RANK[typeOf(first.r) ?? "DEPARTMENT"];
        const rb = ORG_UNIT_RANK[typeOf(second.r) ?? "DEPARTMENT"];
        place = rb >= ra ? second.r : first.r;
        p.issues.push(issue("divisionName", "UNIT_NOT_IN_LINE", "WARNING"));
      }
    }
    p.departmentName = nameOfRes(place);
    if (p.action !== "ERROR")
      for (const id of chainOf(place)) if (id.startsWith("k:")) used.add(id.slice(2));
  }

  // 7) Unit baru yang dipakai (termasuk induk baru dari unit yang dipakai), induk lebih dulu.
  const newUnits: NewUnitSpec[] = [];
  const ordered = [...used].sort(
    (a, b) =>
      chainOf(resolved.get(a) ?? { kind: "invalid" }).length -
      chainOf(resolved.get(b) ?? { kind: "invalid" }).length,
  );
  for (const key of ordered) {
    const r = resolved.get(key);
    if (r?.kind !== "new") continue;
    const parent = r.parentKey ? resolved.get(r.parentKey) : undefined;
    newUnits.push({
      name: r.name,
      unitType: r.unitType,
      parentId: r.parentUnitId ?? (parent?.kind === "existing" ? parent.unit.id : null),
      parentName: parent?.kind === "new" ? parent.name : null,
      companyId: r.companyId,
    });
  }

  // Urutan tetap (tidak bergantung pilihan HR): per PT, lalu jumlah baris, lalu nama.
  const codeOf = (id: string | null) => (id ? (lookup.companies.get(id)?.code ?? "") : "");
  const units: UnitPreview[] = [...values.values()]
    .sort(
      (a, b) =>
        codeOf(a.companyId).localeCompare(codeOf(b.companyId)) ||
        b.rows - a.rows ||
        a.baseKey.localeCompare(b.baseKey),
    )
    .map((v) => {
      const r = resolved.get(v.key);
      const b = base.get(v.key);
      return {
        key: v.key,
        name: nameOf(v),
        companyId: v.companyId,
        companyCode: v.companyId ? codeOf(v.companyId) || null : null,
        newName: r?.kind === "new" ? r.name : null,
        columns: [...v.columns],
        rows: v.rows,
        status: status.get(v.key) ?? "INVALID",
        unitId: r?.kind === "existing" ? r.unit.id : null,
        sameAs: b?.kind === "sameAs" ? b.target : null,
        create:
          r?.kind === "new"
            ? { unitType: r.unitType, parentUnitId: r.parentUnitId, parentKey: r.parentKey }
            : null,
        suggestions: status.get(v.key) === "NEEDS_REVIEW" ? suggestionsOf(v) : [],
      };
    });
  return { units, newUnits };
}

/** Kunci `masterKey` nama unit baru → spesifikasi (untuk pembuatan master data). */
export function newUnitSpecs(newUnits: NewUnitSpec[]) {
  return Object.fromEntries(newUnits.map((u) => [masterKey(u.name), u]));
}
