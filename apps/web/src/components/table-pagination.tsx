import { ChevronLeft, ChevronRight } from "lucide-react";
import { FormSelect } from "@/components/form-select";
import { Button } from "@/components/ui/button";

const PAGE_SIZES = [10, 20, 50, 100];

/** Nomor halaman ringkas: 1 … 4 5 6 … 12. */
function pageWindow(page: number, pages: number): (number | "gap")[] {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > 1) out.push("gap");
    out.push(value);
  }
  return out;
}

// Paginasi server-side (PROMPT §5: ?page=&pageSize=, maks 100).
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="text-muted-foreground flex flex-col gap-3 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          {from}–{to} dari {total}
        </span>
        {onPageSizeChange ? (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Baris</span>
            <FormSelect
              aria-label="Baris per halaman"
              className="h-8 w-[72px] text-xs"
              value={String(pageSize)}
              onChange={(value) => onPageSizeChange(Number(value))}
              placeholder="20"
              options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
            />
          </div>
        ) : null}
      </div>
      <nav aria-label="Paginasi" className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Halaman sebelumnya"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        {pageWindow(page, pages).map((entry, index) =>
          entry === "gap" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: pemisah statis
            <span key={`gap-${index}`} className="px-1">
              …
            </span>
          ) : (
            <Button
              key={entry}
              variant={entry === page ? "outline" : "ghost"}
              size="icon-sm"
              aria-current={entry === page ? "page" : undefined}
              className="tabular-nums"
              onClick={() => onPageChange(entry)}
            >
              {entry}
            </Button>
          ),
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Halaman berikutnya"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </nav>
    </div>
  );
}
