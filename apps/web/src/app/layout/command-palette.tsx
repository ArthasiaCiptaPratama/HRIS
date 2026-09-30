import { ArrowRight, CornerDownLeft, Search, SearchX } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { flattenNav, type NavGroup } from "@/app/navigation";
import { preloadRoute } from "@/app/route-preload";
import { useEmployees } from "@/features/employee/api";
import { EmployeeAvatar } from "@/features/employee/components/employee-avatar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

interface Result {
  key: string;
  label: string;
  hint: string;
  to: string;
  kind: "nav" | "employee";
  name?: string;
  photoUrl?: string | null;
}

const norm = (text: string) => text.toLocaleLowerCase("id-ID");

/** Pencarian cepat (Ctrl/Cmd + K): semua menu yang boleh diakses + karyawan (bila berhak). */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  canSearchEmployees,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroup[];
  canSearchEmployees: boolean;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const debounced = useDebouncedValue(query.trim(), 200);
  const searchEmployees = canSearchEmployees && open && debounced.length >= 2;

  const employees = useEmployees(
    { page: 1, pageSize: 5, active: true, q: debounced, sort: "fullName:asc" },
    searchEmployees,
  );

  const navResults = useMemo<Result[]>(() => {
    const q = norm(query.trim());
    return flattenNav(groups)
      .filter(({ group, section, item, parent }) =>
        !q
          ? true
          : norm(
              [
                item.label,
                parent?.label,
                section.label,
                group.label,
                item.keywords,
                parent?.keywords,
              ]
                .filter(Boolean)
                .join(" "),
            ).includes(q),
      )
      .slice(0, q ? 8 : 12)
      .map(({ group, section, item, parent }) => ({
        key: `nav-${group.id}-${item.id}`,
        label: parent ? `${parent.label} · ${item.label}` : item.label,
        hint: `${group.label} / ${section.label}${item.maintenance ? " · segera" : ""}`,
        to: item.to,
        kind: "nav" as const,
      }));
  }, [groups, query]);

  const employeeResults: Result[] =
    searchEmployees && employees.data
      ? employees.data.data.map((e) => ({
          key: `emp-${e.id}`,
          label: e.fullName,
          name: e.fullName,
          photoUrl: e.photoUrl,
          hint: `${e.employeeNumber} · ${e.position.name}`,
          to: `/personal/pegawai-aktif/semua?pegawai=${e.id}`,
          kind: "employee" as const,
        }))
      : [];
  const results = [...navResults, ...employeeResults];

  // biome-ignore lint/correctness/useExhaustiveDependencies: kursor kembali ke atas setiap query berubah
  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const go = (result: Result | undefined) => {
    if (!result) return;
    onOpenChange(false);
    navigate(result.to);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-zinc-950/25 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="bg-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] fixed top-[12dvh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border shadow-[0_32px_64px_-24px_rgb(24_24_27/0.35)]"
        >
          <DialogPrimitive.Title className="sr-only">Pencarian cepat</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <input
              // biome-ignore lint/a11y/noAutofocus: dialog pencarian: fokus langsung ke kotak cari
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setCursor((c) => Math.min(results.length - 1, c + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setCursor((c) => Math.max(0, c - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  go(results[cursor]);
                }
              }}
              placeholder={canSearchEmployees ? "Cari menu atau nama karyawan…" : "Cari menu…"}
              aria-label="Cari menu atau karyawan"
              role="combobox"
              aria-expanded
              aria-controls="command-results"
              aria-activedescendant={results[cursor] ? `cmd-${results[cursor].key}` : undefined}
              className="placeholder:text-muted-foreground h-12 flex-1 bg-transparent text-sm outline-none"
            />
            <kbd className="text-muted-foreground bg-muted rounded border px-1.5 font-mono text-[10px]">
              Esc
            </kbd>
          </div>
          <div
            id="command-results"
            ref={listRef}
            role="listbox"
            className="max-h-[min(60dvh,420px)] overflow-y-auto p-2"
          >
            {results.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
                <SearchX className="size-5" aria-hidden />
                {employees.isFetching ? "Mencari…" : "Tidak ada hasil"}
              </div>
            ) : (
              results.map((result, index) => {
                const firstEmployee =
                  result.kind === "employee" && results[index - 1]?.kind !== "employee";
                return (
                  <div key={result.key} role="presentation">
                    {index === 0 || firstEmployee ? (
                      <p className="text-muted-foreground px-2 pt-2 pb-1 text-[11px] font-medium tracking-wider uppercase">
                        {result.kind === "employee" ? "Karyawan" : "Menu"}
                      </p>
                    ) : null}
                    <div
                      id={`cmd-${result.key}`}
                      role="option"
                      tabIndex={-1}
                      aria-selected={index === cursor}
                      data-index={index}
                      onMouseMove={() => {
                        setCursor(index);
                        if (result.kind === "nav") preloadRoute(result.to);
                      }}
                      onClick={() => go(result)}
                      onKeyDown={() => undefined}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm",
                        index === cursor ? "bg-accent" : "",
                      )}
                    >
                      {result.kind === "employee" && result.name ? (
                        <EmployeeAvatar name={result.name} photoUrl={result.photoUrl} size="sm" />
                      ) : (
                        <span className="bg-muted text-muted-foreground grid size-7 place-items-center rounded-lg">
                          <ArrowRight className="size-3.5" aria-hidden />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{result.label}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {result.hint}
                        </span>
                      </span>
                      {index === cursor ? (
                        <CornerDownLeft className="text-muted-foreground size-3.5" aria-hidden />
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="text-muted-foreground bg-muted/40 flex items-center gap-4 border-t px-4 py-2 text-[11px]">
            <span>
              <kbd className="font-mono">↑↓</kbd> pilih
            </span>
            <span>
              <kbd className="font-mono">Enter</kbd> buka
            </span>
            {canSearchEmployees ? (
              <span className="ml-auto">Ketik 2+ huruf untuk mencari karyawan</span>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
