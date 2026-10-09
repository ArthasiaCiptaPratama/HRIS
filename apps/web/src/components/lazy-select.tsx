import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { type KeyboardEvent, memo, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SelectOption } from "./form-select";

// Pemilih untuk tabel berisi banyak dropdown (pemetaan ratusan kolom import, status per baris).
// Radix Select memasang SEMUA item walau tertutup (agar label terpilih bisa tampil) → 171 kolom ×
// ±200 field ≈ 34 ribu elemen dan halaman tersendat. Di sini daftar hanya dipasang saat terbuka.

function groupOptions(options: SelectOption[]) {
  const groups: { group: string | undefined; items: SelectOption[] }[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last && last.group === option.group) last.items.push(option);
    else groups.push({ group: option.group, items: [option] });
  }
  return groups;
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

function LazySelectList({
  value,
  options,
  searchable,
  onPick,
}: {
  value: string;
  options: SelectOption[];
  searchable: boolean;
  onPick: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) =>
      normalize(`${o.label} ${o.hint ?? ""} ${o.group ?? ""}`).includes(q),
    );
  }, [options, query]);

  const focusOption = (from: HTMLElement | null, step: 1 | -1) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
    if (items.length === 0) return;
    const index = from ? items.indexOf(from) : -1;
    const next = items[Math.min(Math.max(index + step, 0), items.length - 1)];
    next?.focus();
  };
  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(document.activeElement as HTMLElement, event.key === "ArrowDown" ? 1 : -1);
    }
  };

  return (
    <div className="flex max-h-[min(60vh,420px)] flex-col">
      {searchable ? (
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <input
            // biome-ignore lint/a11y/noAutofocus: pencarian langsung siap saat daftar dibuka
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                focusOption(null, 1);
              } else if (e.key === "Enter" && filtered[0]) {
                e.preventDefault();
                onPick(filtered[0].value);
              }
            }}
            placeholder="Cari…"
            aria-label="Cari pilihan"
            className="placeholder:text-muted-foreground h-9 w-full bg-transparent text-sm outline-none"
          />
        </div>
      ) : null}
      <div
        ref={listRef}
        role="listbox"
        tabIndex={-1}
        onKeyDown={onListKey}
        className="overflow-y-auto p-1"
      >
        {filtered.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-sm">Tidak ditemukan.</p>
        ) : (
          groupOptions(filtered).map(({ group, items }) => (
            <div key={`${group ?? "-"}-${items[0]?.value}`} role="presentation">
              {group ? <p className="text-muted-foreground px-2 py-1.5 text-xs">{group}</p> : null}
              {items.map((option) => {
                const selected = option.value === value;
                return (
                  <div
                    key={option.value}
                    role="option"
                    tabIndex={-1}
                    aria-selected={selected}
                    onClick={() => onPick(option.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPick(option.value);
                      }
                    }}
                    className="hover:bg-accent focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-left text-sm outline-hidden"
                  >
                    <span className="min-w-0">
                      {option.label}
                      {option.hint ? (
                        <span className="text-muted-foreground ml-1 text-xs">{option.hint}</span>
                      ) : null}
                    </span>
                    {selected ? (
                      <CheckIcon className="absolute right-2 size-4" aria-hidden />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const LazySelect = memo(function LazySelect({
  value,
  onChange,
  options,
  placeholder,
  searchable = options.length > 12,
  invalid,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Sebaiknya referensi stabil (konstanta/useMemo) agar baris tabel tidak digambar ulang. */
  options: SelectOption[];
  placeholder: string;
  searchable?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          className={cn(
            "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30 flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-left text-sm whitespace-nowrap shadow-xs outline-none focus-visible:ring-[3px]",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
        onOpenAutoFocus={(e) => {
          // Tanpa pencarian: fokus ke pilihan terpilih (atau pertama) supaya panah bisa dipakai.
          if (searchable) return;
          e.preventDefault();
          const root = e.currentTarget as HTMLElement | null;
          const target =
            root?.querySelector<HTMLElement>("[role=option][aria-selected=true]") ??
            root?.querySelector<HTMLElement>("[role=option]");
          target?.focus();
        }}
      >
        <LazySelectList
          value={value}
          options={options}
          searchable={searchable}
          onPick={(next) => {
            setOpen(false);
            if (next !== value) onChange(next);
          }}
        />
      </PopoverContent>
    </Popover>
  );
});
