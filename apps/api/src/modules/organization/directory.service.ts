import * as repository from "./organization.repository.ts";

// Interface baca-saja lokasi kerja & PT untuk modul lain (pengganti adapter sementara attendance).

export interface WorkLocationBrief {
  id: string;
  name: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusM: number | null;
}

function toBrief(row: Awaited<ReturnType<typeof repository.findWorkLocationsByIds>>[number]) {
  return {
    ...row,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
  };
}

/** Lokasi kerja per id, termasuk yang diarsip (data absen lama tetap punya nama lokasi). */
export async function getWorkLocationBriefs(
  ids: string[],
): Promise<Map<string, WorkLocationBrief>> {
  if (ids.length === 0) return new Map();
  const rows = await repository.findWorkLocationsByIds([...new Set(ids)]);
  return new Map(rows.map((row) => [row.id, toBrief(row)]));
}

/** Semua lokasi kerja aktif yang punya geofence lengkap (titik + radius). */
export async function listGeofencedWorkLocations(): Promise<WorkLocationBrief[]> {
  return (await repository.findGeofencedWorkLocations()).map(toBrief);
}

export async function companyExists(companyId: string): Promise<boolean> {
  return (await repository.countCompaniesById(companyId)) > 0;
}
