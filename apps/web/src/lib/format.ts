// PROMPT §7: tanggal `dd MMM yyyy`, zona Asia/Jakarta, bahasa Indonesia.
const DATE = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const DATE_TIME = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

export function formatDate(iso: string | null | undefined): string {
  return iso ? DATE.format(new Date(iso)) : "—";
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? DATE_TIME.format(new Date(iso)) : "—";
}

const RUPIAH = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

/** PROMPT §7: uang `Rp 1.234.567` (desimal hanya bila ada). */
export function formatRupiah(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `Rp ${RUPIAH.format(value)}`;
}
