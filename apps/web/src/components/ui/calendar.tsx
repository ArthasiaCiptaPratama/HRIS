import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { id as idLocale } from "react-day-picker/locale";
import { cn } from "@/lib/utils";

// Nama hari/bulan Indonesia tetap (tidak bergantung ICU runtime), dan tanggal kalender biasa
// `YYYY-MM-DD` <-> Date lokal tanpa pergeseran zona waktu.
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/** Header kolom: Sen, Sel, Rab, Kam, Jum, Sab, Min. */
export const weekdayShort = (date: Date): string => (DAYS[date.getDay()] ?? "").slice(0, 3);

/** "Senin, 24 November 2026" (label aksesibel sel kalender). */
export const dayLabel = (d: Date): string =>
  `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** "Senin, 24 Nov 2026" (teks tombol pemicu). */
export const dayLabelShort = (d: Date): string =>
  `${DAYS[d.getDay()]}, ${d.getDate()} ${(MONTHS[d.getMonth()] ?? "").slice(0, 3)} ${d.getFullYear()}`;

const pad = (n: number) => String(n).padStart(2, "0");

export const toIso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `YYYY-MM-DD` -> Date lokal tengah malam; undefined bila kosong/tidak valid. */
export function fromIso(iso: string | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIso(d) === iso ? d : undefined;
}

export const addDaysLocal = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const navButton =
  "inline-flex size-8 items-center justify-center rounded-md border bg-background outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Kalender (react-day-picker, gaya shadcn): bahasa Indonesia, pekan mulai Senin
 * (header Sen–Min), hari ini disorot, mode `single` / `range`. Tanpa impor stylesheet.
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={idLocale}
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      className={cn("p-1", className)}
      formatters={{ formatWeekdayName: weekdayShort }}
      labels={{
        labelDayButton: (date, modifiers) =>
          `${dayLabel(date)}${modifiers.today ? ", hari ini" : ""}${modifiers.selected ? ", dipilih" : ""}`,
        labelPrevious: () => "Bulan sebelumnya",
        labelNext: () => "Bulan berikutnya",
      }}
      classNames={{
        root: "w-fit text-sm",
        months: "relative flex flex-col gap-2",
        month: "flex flex-col gap-2",
        month_caption: "flex h-8 items-center justify-center px-8",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: navButton,
        button_next: navButton,
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-xs font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "relative size-9 p-0 text-center text-sm",
        day_button:
          "inline-flex size-9 items-center justify-center rounded-md font-normal outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        today: "[&>button]:font-semibold [&>button]:ring-1 [&>button]:ring-brand/60",
        outside: "text-muted-foreground/60",
        disabled: "text-muted-foreground/40 [&>button]:pointer-events-none",
        hidden: "invisible",
        selected: "[&>button]:bg-brand [&>button]:text-brand-foreground",
        range_start: "rounded-l-md bg-brand/15",
        range_middle:
          "bg-brand/15 [&>button]:bg-transparent [&>button]:text-foreground [&>button]:hover:bg-brand/25",
        range_end: "rounded-r-md bg-brand/15",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: c }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", c)} aria-hidden />
          ) : (
            <ChevronRight className={cn("size-4", c)} aria-hidden />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
