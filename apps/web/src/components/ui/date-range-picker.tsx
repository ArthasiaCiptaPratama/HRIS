import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";
import type { Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { addDaysLocal, Calendar, dayLabelShort, fromIso, toIso } from "./calendar";

export interface DateRange {
  /** Tanggal kalender `YYYY-MM-DD` (bisa kosong). */
  from: string;
  to: string;
}

type Field = "from" | "to";

/**
 * Pemilih rentang tanggal: dua tombol berlabel ("Dari" / "Sampai") yang membuka kalender yang sama.
 * Tombol menampilkan tanggal beserta nama harinya. Nilai selalu string `YYYY-MM-DD`
 * (tanpa konversi zona waktu). `maxDays` menonaktifkan tanggal yang membuat rentang melebihi batas.
 */
export function DateRangePicker({
  value,
  onChange,
  maxDays,
  disabled,
  fromLabel = "Dari",
  toLabel = "Sampai",
  idPrefix = "range",
  invalid,
  placeholder = "Pilih tanggal",
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  maxDays?: number;
  disabled?: boolean;
  fromLabel?: string;
  toLabel?: string;
  idPrefix?: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<Field>("from");
  // Hari awal yang baru dipilih; klik berikutnya melengkapi rentang.
  const [anchorDay, setAnchorDay] = useState<Date | undefined>();
  const buttons = useRef<Record<Field, HTMLButtonElement | null>>({ from: null, to: null });

  const from = fromIso(value.from);
  const to = fromIso(value.to);
  const span = maxDays ? maxDays - 1 : undefined;

  const openFor = (f: Field) => {
    setField(f);
    setAnchorDay(f === "to" ? from : undefined);
    setOpen(true);
  };

  // Tanggal yang membuat rentang > maxDays dinonaktifkan.
  const disabledDays: Matcher[] = [];
  if (span !== undefined) {
    if (field === "to" && from) disabledDays.push({ after: addDaysLocal(from, span) });
  }

  const pick = (day: Date) => {
    const iso = toIso(day);
    if (field === "from") {
      // Dari dipilih: Sampai dipertahankan hanya bila masih sah (>= Dari dan <= maxDays);
      // selain itu disamakan dengan Dari. Lalu lanjut memilih Sampai.
      const keepTo = to && day <= to && (span === undefined || to <= addDaysLocal(day, span));
      onChange({ from: iso, to: keepTo ? value.to : iso });
      setAnchorDay(day);
      setField("to");
      return;
    }
    if (anchorDay && day >= anchorDay) {
      onChange({ from: toIso(anchorDay), to: iso });
      setOpen(false);
      return;
    }
    // Sampai sebelum Dari: mulai ulang rentang dari hari ini.
    onChange({ from: iso, to: iso });
    setAnchorDay(day);
  };

  const trigger = (f: Field, label: string, date: Date | undefined) => {
    const id = `${idPrefix}-${f}`;
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Button
          ref={(el) => {
            buttons.current[f] = el;
          }}
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open && field === f}
          aria-invalid={invalid ? true : undefined}
          onClick={() => openFor(f)}
          className={cn("w-full justify-start px-3 font-normal", !date && "text-muted-foreground")}
        >
          <CalendarDays aria-hidden />
          <span className="truncate">{date ? dayLabelShort(date) : placeholder}</span>
        </Button>
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="grid grid-cols-2 gap-3">
          {trigger("from", fromLabel, from)}
          {trigger("to", toLabel, to)}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-auto p-3"
        aria-label={`Pilih tanggal ${field === "from" ? fromLabel : toLabel}`}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          buttons.current[field]?.focus();
        }}
      >
        <Calendar
          mode="range"
          selected={from && to ? { from, to } : undefined}
          defaultMonth={(field === "from" ? from : to) ?? from ?? to}
          onDayClick={pick}
          disabled={disabledDays}
        />
      </PopoverContent>
    </Popover>
  );
}
