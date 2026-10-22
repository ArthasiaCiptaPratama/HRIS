import {
  ANALYTICS_STAT_METRICS,
  type DashboardWidget,
  EMPLOYMENT_CATEGORY_LABELS,
  type EmploymentCategory,
  EXIT_REASON_LABELS,
  type ExitReason,
  GENDER_LABELS,
  type Gender,
  type SeveranceScenario,
} from "@hris/shared";
import { createContext, use } from "react";
import { useCompanyScope } from "@/features/employee/api";
import { useDashboardAnalytics } from "./api";

// DSB-D1: periode analitik (satu bulan untuk seluruh board) + format angka widget analitik.

/** Bulan berjalan (Asia/Jakarta), YYYY-MM. */
export const currentMonth = (base = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(base).slice(0, 7);

export const AnalyticsPeriodContext = createContext<{ month: string }>({ month: currentMonth() });

/** Analitik bulan periode board, dalam cakupan perusahaan yang dipilih di top bar (D-040). */
export function useAnalytics(scenario: SeveranceScenario = "PHK_NORMAL") {
  const { month } = use(AnalyticsPeriodContext);
  const { selectedId } = useCompanyScope();
  return useDashboardAnalytics(month, selectedId, scenario);
}

/** Widget yang membaca GET /dashboard/analytics (penentu tampilnya pemilih periode). */
export const usesAnalytics = (widget: DashboardWidget) =>
  widget.kind === "insight" ||
  (widget.kind === "stat" && ANALYTICS_STAT_METRICS.includes(widget.metric));

const NUM = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const COMPACT = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export const fmtNum = (value: number) => NUM.format(value);
export const fmtPct = (value: number) => `${NUM.format(value)}%`;
/** Selisih poin persentase, mis. "+2,1 poin" / "−0,5 poin". */
export const fmtPoints = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : "±"}${NUM.format(Math.abs(value))} poin`;
/** Rupiah ringkas untuk ruang sempit, mis. "Rp 1,2 M" (angka lengkap di atribut title). */
export const fmtRupiahShort = (value: number) => `Rp ${COMPACT.format(value)}`;

export function monthLabel(month: string, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    month: style,
    year: style === "long" ? "numeric" : "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, 1)));
}

export const genderLabel = (key: string) =>
  key in GENDER_LABELS ? GENDER_LABELS[key as Gender] : "Belum diisi";
export const exitReasonLabel = (key: string) =>
  key in EXIT_REASON_LABELS ? EXIT_REASON_LABELS[key as ExitReason] : "Tanpa alasan";
export const categoryLabel = (key: string) =>
  key in EMPLOYMENT_CATEGORY_LABELS
    ? EMPLOYMENT_CATEGORY_LABELS[key as EmploymentCategory]
    : "Lainnya";
