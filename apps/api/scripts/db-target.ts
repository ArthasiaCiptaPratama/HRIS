// Alat bantu klasifikasi target database (dipakai use-db, guard-local-db, dan preload test).
// Hanya tooling: tidak di-import oleh runtime aplikasi (src/), jadi tidak melanggar batas modul.

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/** Host (`host:port`) untuk ditampilkan. Tidak pernah memuat kredensial (user/password dibuang). */
export function hostOf(url: string | undefined): string {
  if (!url || url.trim() === "") return "(kosong)";
  try {
    return new URL(url).host || "(tanpa host)";
  } catch {
    return "(tak terurai)";
  }
}

function hostnameOf(url: string | undefined): string | undefined {
  if (!url || url.trim() === "") return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/** True bila hostname jelas lokal (localhost/loopback). Tak terurai → dianggap lokal (tidak memblokir). */
export function isLocalHostname(hostname: string | undefined): boolean {
  if (hostname === undefined) return true;
  const bare = hostname.replace(/^\[/, "").replace(/\]$/, "");
  return LOCAL_HOSTNAMES.has(bare) || bare.endsWith(".localhost");
}

/** True hanya bila URL terisi DAN host-nya terbukti non-lokal. Dipakai jaring pengaman destruktif. */
export function isRemoteUrl(url: string | undefined): boolean {
  const hostname = hostnameOf(url);
  if (hostname === undefined) return false;
  return !isLocalHostname(hostname);
}

export type DbTarget = "local" | "remote" | "empty";

export function classifyUrl(url: string | undefined): DbTarget {
  if (!url || url.trim() === "") return "empty";
  return isRemoteUrl(url) ? "remote" : "local";
}

/** D-066: satu-satunya project Supabase yang boleh berisi nama asli (staging `hris-staging`). */
export const STAGING_PROJECT_REF = "iwgzuwcxsxnbjibhbqgh";

/**
 * Target sebuah script data asli: `local` (DB lokal, tanpa flag) atau `staging` (hanya bila `remoteRef`
 * = ref staging DAN URL memang menunjuk project itu — host `db.<ref>.supabase.co` atau user pooler
 * `postgres.<ref>`). Selain itu `null` = ditolak. Produksi/proyek lain tidak pernah lolos.
 */
export function realDataTarget(
  url: string | undefined,
  remoteRef: string | undefined,
): "local" | "staging" | null {
  const target = classifyUrl(url);
  if (target === "empty") return null;
  if (remoteRef === undefined)
    return target === "local" && !/supabase/i.test(url ?? "") ? "local" : null;
  if (remoteRef !== STAGING_PROJECT_REF || target !== "remote") return null;
  try {
    const parsed = new URL(url as string);
    const pointsToRef =
      parsed.hostname === `db.${remoteRef}.supabase.co` ||
      decodeURIComponent(parsed.username) === `postgres.${remoteRef}`;
    return pointsToRef ? "staging" : null;
  } catch {
    return null;
  }
}
