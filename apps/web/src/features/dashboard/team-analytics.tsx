import type { InsightWidget } from "@hris/shared";
import { Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { AnalyticsPeriodContext, currentMonth } from "./analytics";
import { InsightWidgetCard } from "./insight-widgets";
import { type BoardActions, BoardContext } from "./widget-shell";

// DSB-D1: analitik tim untuk atasan (MANAGER) — cakupan bawahan langsung (API scope "team"), tanpa rupiah,
// hanya-baca (tidak bisa diatur seperti papan SA/HR).

const TEAM_WIDGETS: InsightWidget[] = [
  { id: "team-headcount", kind: "insight", size: "md", insight: "headcount" },
  { id: "team-gender", kind: "insight", size: "sm", insight: "gender" },
  { id: "team-leave", kind: "insight", size: "sm", insight: "leave" },
  { id: "team-efficiency", kind: "insight", size: "md", insight: "efficiency" },
  { id: "team-tenure", kind: "insight", size: "md", insight: "tenureLeave" },
];
const SPAN: Record<InsightWidget["size"], string> = {
  sm: "col-span-2 sm:col-span-1",
  md: "col-span-2",
  lg: "col-span-2 lg:col-span-4",
};
const noop = () => undefined;

export function TeamAnalytics() {
  const [month, setMonth] = useState(() => currentMonth());
  const board = useMemo<BoardActions>(
    () => ({
      editing: false,
      readOnly: true,
      update: noop,
      edit: noop,
      duplicate: noop,
      remove: noop,
    }),
    [],
  );
  const period = useMemo(() => ({ month }), [month]);
  return (
    <section aria-label="Analitik tim" className="mt-6 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Users className="size-4" /> Analitik tim
          </h2>
          <p className="text-muted-foreground text-xs">
            Bawahan langsung Anda: pergerakan, kehadiran & jam kerja, cuti.
          </p>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <label htmlFor="team-analytics-month">Periode</label>
          <Input
            id="team-analytics-month"
            type="month"
            aria-label="Periode analitik tim"
            className="h-8 w-40"
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
        </div>
      </div>
      <BoardContext value={board}>
        <AnalyticsPeriodContext value={period}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {TEAM_WIDGETS.map((widget) => (
              <div key={widget.id} className={SPAN[widget.size]}>
                <InsightWidgetCard widget={widget} canSeeCost={false} />
              </div>
            ))}
          </div>
        </AnalyticsPeriodContext>
      </BoardContext>
    </section>
  );
}
