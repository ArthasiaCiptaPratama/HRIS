// ARS-D16: format angka Laporan (dipisah dari komponen supaya Fast Refresh tetap jalan).

export type Tone = "default" | "brand" | "success" | "warning" | "danger";

export const fmt = new Intl.NumberFormat("id-ID");
export const pct = (value: number) => `${value.toLocaleString("id-ID")}%`;

/** Ambang warna % lengkap: < 60 merah, < 85 kuning, ≥ 85 hijau. */
export const percentTone = (percent: number): Tone =>
  percent < 60 ? "danger" : percent < 85 ? "warning" : "success";
