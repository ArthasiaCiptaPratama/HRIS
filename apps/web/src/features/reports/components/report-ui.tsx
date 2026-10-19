import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Info,
  type LucideIcon,
  Search,
  X,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmt, pct, percentTone, type Tone } from "../format";

// ARS-D16: komponen tampilan Laporan — kartu KPI, panel, angka rata kanan (0 diredupkan), bilah data,
// progres persen berambang warna, tabel dengan cari/urut/halaman, chip saringan.

const TONE_ICON: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  brand: "bg-brand-soft text-brand-soft-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-destructive/10 text-destructive",
};
const TONE_VALUE: Record<Tone, string> = {
  default: "",
  brand: "",
  success: "",
  warning: "text-warning-soft-foreground",
  danger: "text-destructive",
};

/** Penjelasan rumus/definisi; Popover (bukan tooltip) supaya bisa dibuka dengan sentuhan. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Penjelasan ${label}`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs leading-relaxed" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  info,
  tone = "default",
  glyph,
  pressed,
  onClick,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  info?: ReactNode;
  tone?: Tone;
  /** Isi ubin selain ikon (mis. angka tingkat SP 1/2/3). */
  glyph?: ReactNode;
  /** Kartu yang menyaring daftar: status aktif saringan. */
  pressed?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex size-8 items-center justify-center rounded-lg", TONE_ICON[tone])}>
          {glyph ?? <Icon className="size-4" aria-hidden />}
        </span>
        {info && !onClick ? <InfoTip label={label}>{info}</InfoTip> : null}
      </div>
      <p className="text-muted-foreground mt-3 text-xs font-medium">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-2xl leading-tight font-semibold tracking-tight tabular-nums",
          TONE_VALUE[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
      {children}
    </>
  );
  const className = cn(
    "bg-card relative flex flex-col rounded-xl border p-4 text-left shadow-xs transition-colors",
    onClick &&
      "hover:border-foreground/25 cursor-pointer focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
    // Kartu penyaring yang aktif: garis tepi lebih tegas (tanpa sorotan warna).
    pressed && "border-foreground/50 bg-muted/40",
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    // Kartu penyaring tidak memakai ⓘ (tombol di dalam tombol tidak sah).
    <button type="button" aria-pressed={pressed} className={className} onClick={onClick}>
      {body}
    </button>
  );
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5", className)}>
      {children}
    </div>
  );
}

export function Panel({
  title,
  description,
  info,
  aside,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  info?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("bg-card min-w-0 rounded-xl border shadow-xs", className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold">{title}</h2>
            {info && typeof title === "string" ? <InfoTip label={title}>{info}</InfoTip> : null}
          </div>
          {description ? (
            <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
          ) : null}
        </div>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Angka rata kanan; 0 diredupkan supaya nilai yang berarti menonjol. */
export function Num({
  value,
  format = fmt.format,
}: {
  value: number;
  format?: (n: number) => string;
}) {
  return (
    <span className={cn("tabular-nums", value === 0 && "text-muted-foreground/60")}>
      {format(value)}
    </span>
  );
}

const BAR_TONE: Record<Tone, string> = {
  default: "bg-foreground/30",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

/** Bilah data di dalam sel: panjang sebanding nilai terbesar di kolom. */
export function BarCell({
  value,
  max,
  tone = "brand",
  label,
}: {
  value: number;
  max: number;
  tone?: Tone;
  label?: ReactNode;
}) {
  const width = max > 0 ? Math.max(value > 0 ? 4 : 0, (value / max) * 100) : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="bg-muted hidden h-1.5 w-20 overflow-hidden rounded-full sm:block" aria-hidden>
        <div className={cn("h-full rounded-full", BAR_TONE[tone])} style={{ width: `${width}%` }} />
      </div>
      <span className="min-w-8 text-right">{label ?? <Num value={value} />}</span>
    </div>
  );
}

export function PercentBar({
  percent,
  label = "Persen lengkap",
  showValue = true,
  className,
}: {
  percent: number;
  label?: string;
  /** false = bilah saja (angka sudah tampil di dekatnya). */
  showValue?: boolean;
  className?: string;
}) {
  const tone = percentTone(percent);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="bg-muted h-2 flex-1 overflow-hidden rounded-full"
      >
        <div
          className={cn("h-full rounded-full", BAR_TONE[tone])}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      {showValue ? (
        <span className={cn("w-14 text-right text-sm font-medium tabular-nums", TONE_VALUE[tone])}>
          {pct(percent)}
        </span>
      ) : null}
    </div>
  );
}

/** Saringan aktif yang bisa dihapus (klik ×). */
export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="bg-brand-soft text-brand-soft-foreground inline-flex h-7 items-center gap-1 rounded-full pr-1 pl-3 text-xs font-medium">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Hapus saringan ${label}`}
        className="hover:bg-brand/15 inline-flex size-5 items-center justify-center rounded-full"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

/** Pilihan tampilan kecil (mis. Per PT | Per unit | Per status). */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="bg-muted inline-flex rounded-lg p-0.5">
      {options.map((o) => (
        // biome-ignore lint/a11y/useSemanticElements: tombol bergaya segmented, peran radio untuk pembaca layar
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
            value === o.value
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Catatan & batasan data yang bisa dilipat (ARS-D18). */
export function Notes({ children }: { children: ReactNode }) {
  return (
    <details className="group bg-muted/40 rounded-xl border px-4 py-3 text-xs">
      <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-1.5 font-medium select-none">
        <Info className="size-3.5" aria-hidden />
        Catatan & batasan data
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div className="text-muted-foreground mt-2 space-y-1.5 leading-relaxed">{children}</div>
    </details>
  );
}

/** Judul bagian di atas daftar per orang (kartunya = ListPanel bersama). */
export function ListSection({
  title,
  description,
  aside,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-1">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
          ) : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// --- Tabel ---

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  /** Kolom bisa diurutkan dengan klik header. */
  sortValue?: (row: T) => string | number;
  cell: (row: T) => ReactNode;
  className?: string;
}

type Sort = { key: string; dir: "asc" | "desc" };

export function DataTable<T>({
  label,
  rows,
  columns,
  rowKey,
  onRowClick,
  rowClassName,
  initialSort,
  pageSize,
  limit,
  search,
  searchPlaceholder = "Cari nama atau NIP…",
  toolbar,
  footer,
  empty = "Tidak ada data.",
}: {
  label: string;
  rows: readonly T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  initialSort?: Sort;
  /** Paginasi (daftar per orang). */
  pageSize?: number;
  /** Pratinjau N baris + "Lihat semua (N)" (tabel rincian). */
  limit?: number;
  /** Teks yang dicari (mengaktifkan kotak cari). */
  search?: (row: T) => string;
  searchPlaceholder?: string;
  /** Chip saringan dsb. di kiri kotak cari. */
  toolbar?: ReactNode;
  /** Baris total di bawah (selalu tampil). */
  footer?: ReactNode[];
  empty?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort | undefined>(initialSort);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q && search ? rows.filter((r) => search(r).toLowerCase().includes(q)) : [...rows];
    const column = sort && columns.find((c) => c.key === sort.key);
    if (sort && column?.sortValue) {
      const value = column.sortValue;
      const dir = sort.dir === "asc" ? 1 : -1;
      list = list.sort((a, b) => {
        const x = value(a);
        const y = value(b);
        return (
          (typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x).localeCompare(String(y), "id")) * dir
        );
      });
    }
    return list;
  }, [rows, query, search, sort, columns]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(visible.length / pageSize)) : 1;
  const current = Math.min(page, pageCount - 1);
  const shown = pageSize
    ? visible.slice(current * pageSize, (current + 1) * pageSize)
    : limit && !expanded
      ? visible.slice(0, limit)
      : visible;

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
  };
  const alignClass = (align: Column<T>["align"]) =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <div className="space-y-3">
      {search || toolbar ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 empty:hidden sm:min-h-7">
            {toolbar}
          </div>
          {search ? (
            <div className="relative sm:w-64">
              <Search
                className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                type="search"
                aria-label={`Cari di ${label}`}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                className="h-9 pl-8"
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {visible.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          {query ? `Tidak ada yang cocok dengan "${query}".` : empty}
        </p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full text-sm" aria-label={label}>
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      sort?.key === c.key
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={cn(
                      "py-2 pr-3 font-medium whitespace-nowrap last:pr-0",
                      alignClass(c.align),
                      c.className,
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "hover:text-foreground inline-flex items-center gap-1",
                          c.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {c.header}
                        {sort?.key === c.key ? (
                          sort.dir === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b last:border-0",
                    onRowClick && "hover:bg-muted/50 cursor-pointer",
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "py-2.5 pr-3 align-top last:pr-0",
                        alignClass(c.align),
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {footer ? (
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  {footer.map((cell, i) => (
                    <td
                      // biome-ignore lint/suspicious/noArrayIndexKey: kolom tetap
                      key={i}
                      className={cn(
                        "py-2.5 pr-3 last:pr-0",
                        alignClass(columns[i]?.align),
                        columns[i]?.className,
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
      {pageSize && visible.length > pageSize ? (
        <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          <span className="tabular-nums">
            {fmt.format(current * pageSize + 1)}–
            {fmt.format(Math.min(visible.length, (current + 1) * pageSize))} dari{" "}
            {fmt.format(visible.length)}
          </span>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              aria-label="Halaman sebelumnya"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              aria-label="Halaman berikutnya"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
      {!pageSize && limit && visible.length > limit ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-brand w-full"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Tampilkan lebih sedikit" : `Lihat semua (${fmt.format(visible.length)})`}
        </Button>
      ) : null}
    </div>
  );
}
