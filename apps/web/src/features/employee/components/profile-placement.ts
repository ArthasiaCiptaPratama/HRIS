import { type OrgUnitType, POSITION_LEVEL_LABELS, type PositionLevel } from "@hris/shared";

// Header profil karyawan (template "Nama Karyawan / NIP / Jabatan / Divisi / Departemen / Level"):
// Divisi & Departemen diturunkan dari jenjang unit organisasi (D-050), Level dari level jabatan.
// Hanya dari master data yang sudah dimuat web — tanpa perubahan API.

interface Unit {
  id: string;
  name: string;
  parentId: string | null;
  unitType: OrgUnitType;
}
interface PositionRef {
  id: string;
  level: PositionLevel | null;
}

export interface ProfilePlacement {
  division: string | null;
  department: string | null;
  level: string | null;
}

/** Cari unit berjenis tertentu pada unit karyawan atau induk-induknya (paling dekat). */
function nearest(unitId: string, units: Map<string, Unit>, type: OrgUnitType): Unit | null {
  const seen = new Set<string>();
  let current = units.get(unitId);
  while (current && !seen.has(current.id)) {
    if (current.unitType === type) return current;
    seen.add(current.id);
    current = current.parentId ? units.get(current.parentId) : undefined;
  }
  return null;
}

export function profilePlacement(
  employee: {
    department: { id: string; name: string } | null;
    position: { id: string };
  },
  master: { departments: Unit[]; positions: PositionRef[] } | undefined,
): ProfilePlacement {
  const level = master?.positions.find((p) => p.id === employee.position.id)?.level ?? null;
  const levelLabel = level ? POSITION_LEVEL_LABELS[level] : null;
  if (!employee.department) return { division: null, department: null, level: levelLabel };
  // Master data belum termuat / unit di luar cakupan: tampilkan unit karyawan sebagai departemen.
  const units = new Map((master?.departments ?? []).map((u) => [u.id, u]));
  if (!units.has(employee.department.id)) {
    return { division: null, department: employee.department.name, level: levelLabel };
  }
  return {
    division: nearest(employee.department.id, units, "DIVISION")?.name ?? null,
    department:
      nearest(employee.department.id, units, "DEPARTMENT")?.name ??
      // Unit karyawan berupa Seksi/Direktorat tanpa departemen di atasnya: tampilkan unitnya sendiri.
      (units.get(employee.department.id)?.unitType === "DIVISION"
        ? null
        : employee.department.name),
    level: levelLabel,
  };
}
