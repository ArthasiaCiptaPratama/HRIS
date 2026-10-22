import {
  COST_INSIGHTS,
  INSIGHT_LABELS,
  type InsightWidget,
  SEVERANCE_SCENARIO_LABELS,
  SEVERANCE_SCENARIOS,
  type SeveranceScenario,
  TENURE_BUCKET_LABELS,
  type TENURE_BUCKETS,
} from "@hris/shared";
import { type ReactNode, use, useCallback, useState } from "react";
import { FormSelect } from "@/components/form-select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AnalyticsPeriodContext,
  categoryLabel,
  exitReasonLabel,
  fmtNum,
  fmtPct,
  fmtPoints,
  fmtRupiahShort,
  genderLabel,
  monthLabel,
  useAnalytics,
} from "./analytics";
import type { DashboardAnalytics } from "./api";
import { CHROME, categorical, NEUTRAL } from "./palette";
import { type ChartOption, chartBase, EChart, esc, useThemeMode } from "./pivot-chart";
import { type DragHandleProps, useBoard, WidgetShell } from "./widget-shell";

// DSB-D1: widget "Analitik SDM & biaya" — isi tetap dari GET /dashboard/analytics (periode board).
// Widget rupiah (labor cost, kewajiban) tidak dirender bila API tidak mengirim angka biaya.

type Analytics = DashboardAnalytics;
type Small = { small: boolean };

// ── Potongan tampilan bersama ────────────────────────────────────────────────

function Metric({
  label,
  value,
  hint,
  tone,
  title,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "good" | "bad" | undefined;
  title?: string | undefined;
}) {
  return (
    <div className="bg-secondary/50 min-w-0 rounded-lg px-3 py-2">
      <p className="text-muted-foreground truncate text-[11px]">{label}</p>
      <p
        title={title}
        className={cn(
          "truncate text-lg font-semibold tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-muted-foreground truncate text-[11px]">{hint}</p> : null}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground mt-2 text-[11px] leading-snug">{children}</p>;
}

function Th({ children, left = false }: { children: ReactNode; left?: boolean }) {
  return (
    <th
      className={cn("px-2 py-1.5 font-medium whitespace-nowrap", left ? "text-left" : "text-right")}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  left = false,
  strong = false,
  title,
}: {
  children: ReactNode;
  left?: boolean;
  strong?: boolean;
  title?: string | undefined;
}) {
  return (
    <td
      title={title}
      className={cn(
        "px-2 py-1.5 whitespace-nowrap",
        left ? "max-w-[180px] truncate text-left" : "text-right",
        strong && "font-semibold",
      )}
    >
      {children}
    </td>
  );
}
function Table({
  head,
  children,
  foot,
}: {
  head: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="max-h-[320px] overflow-auto rounded-lg border">
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-muted/60 sticky top-0 backdrop-blur">
          <tr>{head}</tr>
        </thead>
        <tbody className="[&>tr]:hover:bg-muted/40 [&>tr]:border-t">{children}</tbody>
        {foot ? <tfoot className="bg-muted/40 border-t font-semibold">{foot}</tfoot> : null}
      </table>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-[140px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-xs">
      {children}
    </div>
  );
}

// ── Pergerakan karyawan (12 bulan) ───────────────────────────────────────────

function HeadcountInsight({ data, small }: { data: Analytics } & Small) {
  const h = data.headcount;
  const prev = h.history.at(-2);
  const reasons = Object.entries(h.leftByReason).filter(([, n]) => n > 0);
  const turnoverDelta = prev ? Math.round((h.turnoverPct - prev.turnoverPct) * 10) / 10 : null;
  const build = useCallback(
    ({ mode, width, animate }: { mode: "light" | "dark"; width: number; animate: boolean }) => {
      const ink = CHROME[mode];
      const compact = width < 420;
      const months = h.history.map((m) => monthLabel(m.month, "short"));
      const axisLabel = { color: ink.muted, fontSize: compact ? 10 : 11, hideOverlap: true };
      const base = chartBase(mode, animate);
      return {
        ...base,
        legend: {
          top: 0,
          left: 0,
          icon: "roundRect",
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { color: ink.ink, fontSize: 11 },
        },
        tooltip: {
          ...base.tooltip,
          trigger: "axis",
          axisPointer: { type: "line", lineStyle: { color: ink.axis } },
        },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        // Tanpa sumbu ganda: jumlah aktif (garis) dan masuk/keluar (bar) di dua panel bertumpuk.
        grid: [
          { left: 4, right: 12, top: 30, height: "32%", containLabel: true },
          { left: 4, right: 12, top: "56%", bottom: 4, containLabel: true },
        ],
        xAxis: [0, 1].map((i) => ({
          type: "category",
          gridIndex: i,
          data: months,
          axisLabel: { ...axisLabel, show: i === 1 },
          axisTick: { show: false },
          axisLine: { lineStyle: { color: ink.axis } },
        })),
        yAxis: [0, 1].map((i) => ({
          type: "value",
          gridIndex: i,
          scale: i === 0,
          splitNumber: 2,
          minInterval: 1,
          axisLabel,
          splitLine: { lineStyle: { color: ink.grid } },
        })),
        series: [
          {
            name: "Aktif akhir bulan",
            type: "line",
            xAxisIndex: 0,
            yAxisIndex: 0,
            symbolSize: 5,
            itemStyle: { color: categorical(mode, 0) },
            lineStyle: { width: 2 },
            data: h.history.map((m) => m.end),
          },
          {
            name: "Masuk",
            type: "bar",
            xAxisIndex: 1,
            yAxisIndex: 1,
            barMaxWidth: 12,
            itemStyle: { color: categorical(mode, 2), borderRadius: [3, 3, 0, 0] },
            data: h.history.map((m) => m.joined),
          },
          {
            name: "Keluar",
            type: "bar",
            xAxisIndex: 1,
            yAxisIndex: 1,
            barMaxWidth: 12,
            itemStyle: { color: categorical(mode, 1), borderRadius: [3, 3, 0, 0] },
            data: h.history.map((m) => m.left),
          },
        ],
      } as ChartOption;
    },
    [h.history],
  );
  return (
    <div className="space-y-3">
      <div className={cn("grid gap-2", small ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-5")}>
        <Metric label="Aktif awal bulan" value={fmtNum(h.start)} />
        <Metric label="+ Masuk" value={fmtNum(h.joined)} />
        <Metric label="− Keluar" value={fmtNum(h.left)} />
        <Metric
          label="= Aktif akhir bulan"
          value={fmtNum(h.end)}
          hint={
            h.endChangePct === null
              ? undefined
              : `${h.endChangePct > 0 ? "+" : ""}${fmtPct(h.endChangePct)} vs bulan lalu`
          }
        />
        <Metric
          label="Turnover"
          value={fmtPct(h.turnoverPct)}
          hint={turnoverDelta === null ? undefined : `${fmtPoints(turnoverDelta)} vs bulan lalu`}
          tone={turnoverDelta ? (turnoverDelta > 0 ? "bad" : "good") : undefined}
        />
      </div>
      {reasons.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Keluar per alasan:{" "}
          {reasons.map(([reason, n]) => `${exitReasonLabel(reason)} ${fmtNum(n)}`).join(" · ")}
        </p>
      ) : null}
      {small ? null : (
        <EChart
          build={build}
          height={240}
          label={`Pergerakan karyawan 12 bulan sampai ${monthLabel(data.month)}`}
        />
      )}
    </div>
  );
}

// ── Jenis kelamin ────────────────────────────────────────────────────────────

const GENDER_SLOTS: Record<string, number> = { MALE: 0, FEMALE: 1 };
const colorOf = (mode: "light" | "dark", key: string) =>
  key in GENDER_SLOTS ? categorical(mode, GENDER_SLOTS[key] as number) : NEUTRAL[mode];

function GenderInsight({ data }: { data: Analytics }) {
  const rows = data.gender;
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const build = useCallback(
    ({ mode, animate }: { mode: "light" | "dark"; animate: boolean }) => {
      const ink = CHROME[mode];
      const base = chartBase(mode, animate);
      return {
        ...base,
        title: {
          text: fmtNum(total),
          subtext: "aktif",
          left: "center",
          top: "36%",
          textStyle: { fontSize: 20, fontWeight: 700, color: ink.ink },
          subtextStyle: { fontSize: 11, color: ink.muted },
          itemGap: 2,
        },
        tooltip: {
          ...base.tooltip,
          trigger: "item",
          formatter: (p: { name: string; value: number; percent: number }) =>
            `<b>${esc(p.name)}</b><br/>${fmtNum(p.value)} orang · ${fmtPct(Math.round(p.percent * 10) / 10)}`,
        },
        series: [
          {
            type: "pie",
            radius: ["58%", "82%"],
            label: { show: false },
            itemStyle: { borderColor: ink.surface, borderWidth: 2, borderRadius: 4 },
            data: rows.map((r) => ({
              name: genderLabel(r.gender),
              value: r.count,
              itemStyle: { color: colorOf(mode, r.gender) },
            })),
          },
        ],
      } as ChartOption;
    },
    [rows, total],
  );
  const mode = useThemeMode();
  if (total === 0) return <Empty>Belum ada karyawan aktif.</Empty>;
  return (
    <div className="space-y-2">
      <EChart
        build={build}
        height={170}
        label={`Komposisi jenis kelamin: ${fmtNum(total)} aktif`}
      />
      {/* Legenda sebagai daftar (bukan legenda kanvas) supaya tetap terbaca di lebar ¼. */}
      <ul className="space-y-1 text-xs">
        {rows.map((r) => (
          <li key={r.gender} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: colorOf(mode, r.gender) }}
            />
            <span className="min-w-0 flex-1 truncate">{genderLabel(r.gender)}</span>
            <span className="font-medium tabular-nums">{fmtNum(r.count)}</span>
            <span className="text-muted-foreground w-12 text-right tabular-nums">
              {fmtPct(r.pct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Masa kerja vs cuti ───────────────────────────────────────────────────────

const bucketLabel = (key: string) =>
  TENURE_BUCKET_LABELS[key as (typeof TENURE_BUCKETS)[number]] ?? key;

function TenureLeaveInsight({ data, small }: { data: Analytics } & Small) {
  const { buckets } = data.tenure;
  if (small) {
    return (
      <ul className="space-y-2 text-xs">
        {buckets.map((b) => (
          <li key={b.bucket}>
            <div className="flex justify-between gap-2">
              <span className="truncate">{bucketLabel(b.bucket)}</span>
              <span className="tabular-nums">
                <b>{fmtNum(b.count)}</b> · {fmtPct(b.pct)}
              </span>
            </div>
            <p className="text-muted-foreground tabular-nums">
              Cuti terpakai {fmtNum(b.avgUsed)} / {fmtNum(b.avgGranted)} hari
            </p>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Table
      head={
        <>
          <Th left>Masa kerja</Th>
          <Th>Karyawan</Th>
          <Th>%</Th>
          <Th>Rata² masa kerja</Th>
          <Th>Rata² hak cuti</Th>
          <Th>Rata² terpakai</Th>
          <Th>Rata² sisa</Th>
        </>
      }
    >
      {buckets.map((b) => (
        <tr key={b.bucket}>
          <Td left>{bucketLabel(b.bucket)}</Td>
          <Td strong>{fmtNum(b.count)}</Td>
          <Td>{fmtPct(b.pct)}</Td>
          <Td>{fmtNum(b.avgYears)} thn</Td>
          <Td>{fmtNum(b.avgGranted)} hr</Td>
          <Td>{fmtNum(b.avgUsed)} hr</Td>
          <Td>{fmtNum(b.avgRemaining)} hr</Td>
        </tr>
      ))}
    </Table>
  );
}

// ── Ringkasan cuti ───────────────────────────────────────────────────────────

function LeaveInsight({ data, small }: { data: Analytics } & Small) {
  const l = data.leave;
  return (
    <div className={cn("grid gap-2", small ? "grid-cols-2" : "grid-cols-3")}>
      <Metric label="Sedang cuti hari ini" value={fmtNum(l.onLeaveToday)} />
      <Metric label="Menunggu persetujuan" value={fmtNum(l.pendingRequests)} />
      <Metric label={`Terpakai ${l.year}`} value={`${fmtNum(l.usedDays)} hr`} />
      <Metric label="Sisa hak cuti" value={`${fmtNum(l.remainingDays)} hr`} />
      <Metric label="Hutang cuti" value={`${fmtNum(l.debtDays)} hr`} />
    </div>
  );
}

// ── Efisiensi jam kerja ──────────────────────────────────────────────────────

function EfficiencyInsight({ data, small }: { data: Analytics } & Small) {
  const e = data.efficiency;
  const diff = Math.round((e.efficiencyPct - e.prevEfficiencyPct) * 10) / 10;
  return (
    <div className="space-y-3">
      <div className={cn("grid gap-2", small ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
        <Metric
          label="Efisiensi"
          value={fmtPct(e.efficiencyPct)}
          hint={`${fmtPoints(diff)} vs bulan lalu`}
          tone={diff > 0 ? "good" : diff < 0 ? "bad" : undefined}
        />
        <Metric
          label="Lembur"
          value={fmtPct(e.overtimePct)}
          hint={`${fmtNum(e.overtimeHours)} jam`}
        />
        <Metric label="Telat" value={fmtPct(e.latePct)} hint="dari hari hadir" />
        <Metric label="Alpha" value={fmtPct(e.alphaPct)} hint="dari hari kerja" />
      </div>
      <p className="text-muted-foreground text-xs">
        {fmtNum(e.effectiveHours)} jam efektif dari {fmtNum(e.scheduledHours)} jam terjadwal.
      </p>
      {small || e.byLocation.length === 0 ? null : (
        <Table
          head={
            <>
              <Th left>Lokasi</Th>
              <Th>Karyawan</Th>
              <Th>Efisiensi</Th>
              <Th>Lembur</Th>
              <Th>Telat</Th>
              <Th>Alpha</Th>
            </>
          }
        >
          {e.byLocation.map((row) => (
            <tr key={row.location}>
              <Td left title={row.location}>
                {row.location}
              </Td>
              <Td>{fmtNum(row.headcount)}</Td>
              <Td strong>{fmtPct(row.efficiencyPct)}</Td>
              <Td>{fmtPct(row.overtimePct)}</Td>
              <Td>{fmtPct(row.latePct)}</Td>
              <Td>{fmtPct(row.alphaPct)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ── Proyeksi 12 bulan ────────────────────────────────────────────────────────

function ProjectionInsight({ data, small }: { data: Analytics } & Small) {
  const rows = data.projection;
  const withRetire = rows.some((r) => r.retirements !== null);
  const withCost = rows.some((r) => r.costDelta !== null);
  const sum = (pick: (r: (typeof rows)[number]) => number | null) =>
    rows.reduce((t, r) => t + (pick(r) ?? 0), 0);
  if (small) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="PKWT habis" value={fmtNum(sum((r) => r.contractEnds))} hint="12 bulan" />
        <Metric
          label="Naik tingkat"
          value={fmtNum(sum((r) => r.tierChanges))}
          hint="pesangon/UPMK"
        />
        {withRetire ? (
          <Metric label="Pensiun" value={fmtNum(sum((r) => r.retirements))} hint="12 bulan" />
        ) : null}
        {withCost ? (
          <Metric
            label="Tambahan biaya"
            value={fmtRupiahShort(sum((r) => r.costDelta))}
            title={formatRupiah(sum((r) => r.costDelta))}
          />
        ) : null}
      </div>
    );
  }
  return (
    <Table
      head={
        <>
          <Th left>Bulan</Th>
          <Th>PKWT habis</Th>
          <Th>Naik tingkat pesangon/UPMK</Th>
          {withRetire ? <Th>Pensiun</Th> : null}
          {withCost ? <Th>Tambahan biaya</Th> : null}
        </>
      }
      foot={
        <tr>
          <Td left>Total</Td>
          <Td>{fmtNum(sum((r) => r.contractEnds))}</Td>
          <Td>{fmtNum(sum((r) => r.tierChanges))}</Td>
          {withRetire ? <Td>{fmtNum(sum((r) => r.retirements))}</Td> : null}
          {withCost ? <Td>{formatRupiah(sum((r) => r.costDelta))}</Td> : null}
        </tr>
      }
    >
      {rows.map((r) => (
        <tr key={r.month}>
          <Td left>{monthLabel(r.month)}</Td>
          <Td>{r.contractEnds || "–"}</Td>
          <Td>{r.tierChanges || "–"}</Td>
          {withRetire ? <Td>{r.retirements || "–"}</Td> : null}
          {withCost ? <Td>{r.costDelta ? formatRupiah(r.costDelta) : "–"}</Td> : null}
        </tr>
      ))}
    </Table>
  );
}

// ── Biaya tenaga kerja (rupiah) ──────────────────────────────────────────────

function LaborCostInsight({ cost, small }: { cost: NonNullable<Analytics["laborCost"]> } & Small) {
  const note =
    cost.wageMissing > 0 ? (
      <Note>{fmtNum(cost.wageMissing)} karyawan tanpa upah grade (tidak dihitung).</Note>
    ) : null;
  if (small) {
    return (
      <div>
        <ul className="space-y-2 text-xs">
          {cost.rows.map((r) => (
            <li key={r.category}>
              <div className="flex justify-between gap-2">
                <span className="truncate">
                  {categoryLabel(r.category)}{" "}
                  <span className="text-muted-foreground">· {fmtNum(r.headcount)}</span>
                </span>
                <span className="font-medium tabular-nums" title={formatRupiah(r.total)}>
                  {fmtRupiahShort(r.total)}
                </span>
              </div>
              <div className="bg-secondary mt-1 h-1.5 overflow-hidden rounded-full">
                <div className="bg-brand h-full rounded-full" style={{ width: `${r.pct}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t pt-2 text-xs font-semibold">
          <span>Total</span>
          <span title={formatRupiah(cost.total)}>{fmtRupiahShort(cost.total)}</span>
        </p>
        {note}
      </div>
    );
  }
  return (
    <div>
      <Table
        head={
          <>
            <Th left>Kategori</Th>
            <Th>Karyawan</Th>
            <Th>Upah</Th>
            <Th>Lembur</Th>
            <Th>Total</Th>
            <Th>%</Th>
          </>
        }
        foot={
          <tr>
            <Td left>Total</Td>
            <Td>{fmtNum(cost.rows.reduce((t, r) => t + r.headcount, 0))}</Td>
            <Td>{formatRupiah(cost.rows.reduce((t, r) => t + r.wage, 0))}</Td>
            <Td>{formatRupiah(cost.rows.reduce((t, r) => t + r.overtime, 0))}</Td>
            <Td>{formatRupiah(cost.total)}</Td>
            <Td>100%</Td>
          </tr>
        }
      >
        {cost.rows.map((r) => (
          <tr key={r.category}>
            <Td left>{categoryLabel(r.category)}</Td>
            <Td>{fmtNum(r.headcount)}</Td>
            <Td>{formatRupiah(r.wage)}</Td>
            <Td>{formatRupiah(r.overtime)}</Td>
            <Td strong>{formatRupiah(r.total)}</Td>
            <Td>{fmtPct(r.pct)}</Td>
          </tr>
        ))}
      </Table>
      {note}
    </div>
  );
}

// ── Kewajiban kompensasi (rupiah, skenario dipilih) ──────────────────────────

function LiabilityInsight({
  liability,
  scenario,
  onScenario,
  small,
}: {
  liability: NonNullable<Analytics["liability"]>;
  scenario: SeveranceScenario;
  onScenario: (scenario: SeveranceScenario) => void;
} & Small) {
  const money = (value: number) => (small ? fmtRupiahShort(value) : formatRupiah(value));
  const rows: [string, number][] = [
    ["Pesangon", liability.severance],
    ["UPMK", liability.upmk],
    ["Kompensasi PKWT", liability.pkwt],
    ["Uang pengganti cuti", liability.leaveComp],
  ];
  return (
    <div className="space-y-2">
      <FormSelect
        aria-label="Skenario kompensasi"
        className="h-8 w-full text-xs"
        value={scenario}
        onChange={(value) => onScenario(value as SeveranceScenario)}
        placeholder="Pilih skenario"
        options={SEVERANCE_SCENARIOS.map((s) => ({
          value: s,
          label: SEVERANCE_SCENARIO_LABELS[s],
        }))}
      />
      <dl className="space-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground truncate">{label}</dt>
            <dd className="tabular-nums" title={formatRupiah(value)}>
              {money(value)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t pt-1.5 font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums" title={formatRupiah(liability.total)}>
            {money(liability.total)}
          </dd>
        </div>
      </dl>
      <Note>
        Estimasi PP 35/2021 dari upah grade untuk {fmtNum(liability.employees)} karyawan
        {liability.wageMissing > 0
          ? `; ${fmtNum(liability.wageMissing)} tanpa upah grade tidak dihitung`
          : ""}
        .
      </Note>
    </div>
  );
}

// ── Kartu widget ─────────────────────────────────────────────────────────────

export function InsightWidgetCard({
  widget,
  canSeeCost,
  dragHandle,
}: {
  widget: InsightWidget;
  canSeeCost: boolean;
  dragHandle?: DragHandleProps | undefined;
}) {
  const board = useBoard();
  const { month } = use(AnalyticsPeriodContext);
  const [scenario, setScenario] = useState<SeveranceScenario>("PHK_NORMAL");
  const query = useAnalytics(widget.insight === "liability" ? scenario : "PHK_NORMAL");
  const data = query.data;
  const title = INSIGHT_LABELS[widget.insight];
  const small = widget.size === "sm";
  const isCost = COST_INSIGHTS.includes(widget.insight);

  const costMissing =
    isCost &&
    (!canSeeCost ||
      (data !== undefined &&
        (widget.insight === "laborCost" ? data.laborCost === null : data.liability === null)));
  if (costMissing) {
    // Tanpa grant "Biaya": tidak dirender; saat mengatur dashboard tampil redup supaya bisa dihapus.
    if (!board.editing) return null;
    return (
      <WidgetShell widget={widget} title={title} dragHandle={dragHandle} className="opacity-60">
        <Empty>Butuh izin Biaya (labor.cost.read).</Empty>
      </WidgetShell>
    );
  }

  const subtitle =
    widget.insight === "leave"
      ? `Hari ini · tahun ${data?.leave.year ?? month.slice(0, 4)}`
      : widget.insight === "projection"
        ? `12 bulan setelah ${monthLabel(month)}`
        : widget.insight === "liability"
          ? "Estimasi bila semua karyawan aktif keluar"
          : monthLabel(month);

  let body: ReactNode;
  if (!data && query.isError) {
    body = (
      <Empty>
        {query.error instanceof ApiError && query.error.status === 403
          ? "Analitik hanya untuk SA & HR."
          : "Gagal memuat analitik."}
      </Empty>
    );
  } else if (!data) {
    body = <Skeleton className="h-[180px] w-full rounded-lg" />;
  } else {
    const props = { data, small };
    body =
      widget.insight === "headcount" ? (
        <HeadcountInsight {...props} />
      ) : widget.insight === "gender" ? (
        <GenderInsight data={data} />
      ) : widget.insight === "tenureLeave" ? (
        <TenureLeaveInsight {...props} />
      ) : widget.insight === "leave" ? (
        <LeaveInsight {...props} />
      ) : widget.insight === "efficiency" ? (
        <EfficiencyInsight {...props} />
      ) : widget.insight === "projection" ? (
        <ProjectionInsight {...props} />
      ) : widget.insight === "laborCost" && data.laborCost ? (
        <LaborCostInsight cost={data.laborCost} small={small} />
      ) : data.liability ? (
        <LiabilityInsight
          liability={data.liability}
          scenario={scenario}
          onScenario={setScenario}
          small={small}
        />
      ) : null;
  }

  return (
    <WidgetShell widget={widget} title={title} subtitle={subtitle} dragHandle={dragHandle}>
      <div className={cn("transition-opacity", query.isFetching && data && "opacity-60")}>
        {body}
      </div>
    </WidgetShell>
  );
}
