import { cn } from "@/lib/utils";
import type { Shift } from "../schemas";
import { addDays, hhmm } from "./display";

// Roster 7 hari mulai hari ini dalam grid 7 kolom (selalu muat lebar kartu, tanpa scroll / potong).

const WEEKDAY = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" });

export interface RosterWeekDay {
  date: string;
  code: string;
  shift: Shift | null;
  /** TM-D13 Fase C: jadwal hari ini diubah baru-baru ini (tukar shift / HR). */
  changed?: boolean | undefined;
}

export function RosterWeek({
  roster,
  today,
  showLegend = true,
}: {
  roster: RosterWeekDay[];
  today: string;
  showLegend?: boolean;
}) {
  const byDate = new Map(roster.map((r) => [r.date, r]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const legend = [
    ...new Map(roster.filter((r) => r.shift).map((r) => [r.code, r.shift as Shift])).values(),
  ];
  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const day = byDate.get(date);
          const isToday = date === today;
          const off = day && !day.shift;
          const color = day?.shift?.color ?? undefined;
          return (
            <li
              key={date}
              title={day?.changed ? "Jadwal berubah" : undefined}
              className={cn(
                "relative flex min-w-0 flex-col items-center rounded-lg border px-0.5 py-1.5 text-center",
                off && "bg-muted text-muted-foreground border-transparent",
                !day && "border-dashed",
                isToday && "border-brand bg-brand-soft/60 border-2",
              )}
              aria-current={isToday ? "date" : undefined}
            >
              <span
                className={cn(
                  "text-[10px] leading-none",
                  isToday ? "text-brand font-semibold" : "text-muted-foreground",
                )}
              >
                {isToday ? "Hari ini" : WEEKDAY.format(new Date(`${date}T00:00:00Z`))}
              </span>
              <span className="mt-1 text-sm leading-none font-semibold tabular-nums">
                {Number(date.slice(8))}
              </span>
              <span
                className={cn(
                  "mt-1.5 w-full truncate rounded px-0.5 py-0.5 font-mono text-[11px] leading-none font-bold",
                  !color && !off && "text-foreground",
                )}
                style={color ? { color, backgroundColor: `${color}1a` } : undefined}
              >
                {day ? day.code : "—"}
              </span>
              {day?.changed ? (
                <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-neutral-900">
                  <span className="sr-only">Jadwal berubah</span>
                </span>
              ) : null}
              {day?.shift ? (
                <span className="text-muted-foreground mt-1 hidden text-[9px] leading-none tabular-nums sm:block">
                  {hhmm(day.shift.startMinute)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {showLegend && legend.length > 0 ? (
        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {legend.map((s) => (
            <span key={s.code} className="flex items-center gap-1">
              <span
                className="font-mono font-bold"
                style={s.color ? { color: s.color } : undefined}
              >
                {s.code}
              </span>
              {s.name} {hhmm(s.startMinute)}–{hhmm(s.endMinute)}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="font-mono font-bold">OFF</span> Libur
          </span>
          {roster.some((r) => r.changed) ? (
            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <span className="size-2 rounded-full bg-amber-500" /> Jadwal berubah
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
