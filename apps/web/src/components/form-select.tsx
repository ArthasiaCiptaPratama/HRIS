import { Fragment } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Radix Select tidak menerima value "" → pilihan kosong memakai penanda internal.
const NONE = "__none__";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  /** Judul kelompok; opsi berurutan dengan grup sama ditampilkan di bawah satu judul. */
  group?: string;
}

function groupOptions(
  options: SelectOption[],
): { group: string | undefined; items: SelectOption[] }[] {
  const groups: { group: string | undefined; items: SelectOption[] }[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last && last.group === option.group) last.items.push(option);
    else groups.push({ group: option.group, items: [option] });
  }
  return groups;
}

export function FormSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  noneLabel,
  disabled,
  invalid,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  /** Tampilkan pilihan "kosong" (untuk field opsional / filter "semua"). */
  noneLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Select
      value={value === "" ? (noneLabel ? NONE : "") : value}
      onValueChange={(next) => onChange(next === NONE ? "" : next)}
      disabled={disabled ?? false}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn("w-full", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel ? (
          <SelectItem value={NONE} className="text-muted-foreground">
            {noneLabel}
          </SelectItem>
        ) : null}
        {groupOptions(options).map(({ group, items }) => {
          const rendered = items.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span>{option.label}</span>
              {option.hint ? (
                <span className="text-muted-foreground ml-1 text-xs">{option.hint}</span>
              ) : null}
            </SelectItem>
          ));
          return group ? (
            <SelectGroup key={`${group}-${items[0]?.value}`}>
              <SelectLabel>{group}</SelectLabel>
              {rendered}
            </SelectGroup>
          ) : (
            <Fragment key={`none-${items[0]?.value}`}>{rendered}</Fragment>
          );
        })}
      </SelectContent>
    </Select>
  );
}
