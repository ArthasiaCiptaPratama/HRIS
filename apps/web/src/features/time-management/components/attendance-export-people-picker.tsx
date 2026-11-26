import { ATTENDANCE_EXPORT_MAX_EMPLOYEES } from "@hris/shared";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchField } from "@/components/search-field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttendancePeople } from "../api";
import { LoadMoreSentinel } from "./load-more-sentinel";

// TM-D34: pemilih "Pilih karyawan tertentu" pada dialog export Detail. Daftar dari `GET /attendance/people`
// (TM-D33, berhalaman); pilihan disimpan di pemanggil (id + nama) sehingga bertahan saat pencarian berganti.

export interface PickedEmployee {
  id: string;
  name: string;
}

export function AttendanceExportPeoplePicker({
  companyId,
  selected,
  onChange,
}: {
  companyId: string | undefined;
  selected: PickedEmployee[];
  onChange: (next: PickedEmployee[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const people = useAttendancePeople({ companyId, ...(q ? { q } : {}) });
  const items = useMemo(() => people.data?.pages.flatMap((p) => p.data) ?? [], [people.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = people;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const ids = new Set(selected.map((s) => s.id));
  const full = selected.length >= ATTENDANCE_EXPORT_MAX_EMPLOYEES;

  const toggle = (person: PickedEmployee) =>
    onChange(
      ids.has(person.id)
        ? selected.filter((s) => s.id !== person.id)
        : full
          ? selected
          : [...selected, person],
    );

  return (
    <div className="space-y-2">
      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Cari nama atau NIP…"
        aria-label="Cari karyawan untuk diekspor"
      />
      <fieldset className="max-h-56 min-w-0 overflow-y-auto rounded-md border p-2">
        <legend className="sr-only">Daftar karyawan</legend>
        {people.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : people.isError ? (
          <p className="text-destructive text-xs" role="alert">
            Daftar karyawan gagal dimuat.
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-xs">Tidak ada karyawan yang cocok.</p>
        ) : (
          <div className="space-y-1">
            {items.map((person) => {
              const checked = ids.has(person.id);
              return (
                <label key={person.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-brand mt-0.5 size-4"
                    checked={checked}
                    disabled={!checked && full}
                    onChange={() => toggle({ id: person.id, name: person.fullName })}
                  />
                  <span className="min-w-0">
                    {person.fullName}
                    <span className="text-muted-foreground block text-xs">
                      {[person.employeeNumber, person.position].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                </label>
              );
            })}
            <LoadMoreSentinel
              hasMore={Boolean(hasNextPage)}
              loading={isFetchingNextPage}
              onLoad={loadMore}
            />
          </div>
        )}
      </fieldset>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {selected.length} karyawan dipilih (maksimal{" "}
          {ATTENDANCE_EXPORT_MAX_EMPLOYEES.toLocaleString("id-ID")}).
        </p>
        {selected.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            Kosongkan
          </Button>
        ) : null}
      </div>
      {selected.length > 0 ? (
        <ul className="flex max-h-24 flex-wrap gap-1 overflow-y-auto" aria-label="Karyawan dipilih">
          {selected.map((s) => (
            <li
              key={s.id}
              className="bg-muted flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs"
            >
              {s.name}
              <button
                type="button"
                className="hover:bg-background rounded-full p-0.5"
                aria-label={`Hapus ${s.name}`}
                onClick={() => onChange(selected.filter((x) => x.id !== s.id))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
