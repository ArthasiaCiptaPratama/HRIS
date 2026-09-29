// Label tampilan (bahasa Indonesia) untuk enum yang dikirim API.
export const MARITAL_LABELS: Record<string, string> = {
  SINGLE: "Belum menikah",
  MARRIED: "Menikah",
  DIVORCED: "Cerai hidup",
  WIDOWED: "Cerai mati",
};

export const RELIGION_LABELS: Record<string, string> = {
  ISLAM: "Islam",
  PROTESTANT: "Kristen Protestan",
  CATHOLIC: "Katolik",
  HINDU: "Hindu",
  BUDDHIST: "Buddha",
  CONFUCIAN: "Konghucu",
  OTHER: "Lainnya",
};

export const RELATIONSHIP_LABELS: Record<string, string> = {
  SPOUSE: "Pasangan",
  CHILD: "Anak",
  FATHER: "Ayah",
  MOTHER: "Ibu",
  SIBLING: "Saudara kandung",
  OTHER: "Lainnya",
};

/** Masa kerja singkat, mis. "3 th 2 bln". */
export function tenure(fromIso: string, toIso?: string | null): string {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = toIso ? new Date(`${toIso}T00:00:00Z`) : new Date();
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  if (months < 1) return "< 1 bln";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} th` : "", rest ? `${rest} bln` : ""].filter(Boolean).join(" ");
}

/** Hari ini (Asia/Jakarta) dalam format YYYY-MM-DD, untuk nilai awal input tanggal. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}
