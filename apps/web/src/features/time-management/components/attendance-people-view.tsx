import { SearchX, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchField } from "@/components/search-field";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { type AttendancePerson, useAttendancePeople } from "../api";
import { AttendancePersonDialog } from "./attendance-person-dialog";
import { DayStatusBadge, timeIn, workDateLabel } from "./display";
import { LoadMoreSentinel } from "./load-more-sentinel";

// TM-D33: Data Absen Harian › "Per karyawan". Satu kartu per karyawan yang pernah absen (dalam
// cakupan PT), diurutkan dari absen terbaru; data pokok dari Personnel Management lewat API.

export type AbsenView = "day" | "people";

const VIEW_OPTIONS: { value: AbsenView; label: string }[] = [
  { value: "day", label: "Per hari (lama)" },
  { value: "people", label: "Per karyawan (baru)" },
];

const viewKey = (userId: string) => `tm.absenHarian.view.${userId}`;

function readView(userId: string): AbsenView {
  try {
    return localStorage.getItem(viewKey(userId)) === "people" ? "people" : "day";
  } catch {
    return "day";
  }
}

/** Pilihan tampilan diingat per pengguna di browser ini (bawaan "Per hari"). */
export function useAbsenView(userId: string) {
  const [view, setView] = useState<AbsenView>(() => readView(userId));
  const choose = useCallback(
    (next: AbsenView) => {
      setView(next);
      try {
        localStorage.setItem(viewKey(userId), next);
      } catch {
        // penyimpanan diblokir: pilihan tetap berlaku selama halaman terbuka
      }
    },
    [userId],
  );
  return [view, choose] as const;
}

export function AbsenViewSwitch({
  value,
  onChange,
}: {
  value: AbsenView;
  onChange: (value: AbsenView) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tampilan data absen"
      className="bg-muted inline-flex rounded-lg p-0.5"
    >
      {VIEW_OPTIONS.map((o) => (
        // biome-ignore lint/a11y/useSemanticElements: tombol segmen bergaya, semantik radio lewat role
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "focus-visible:ring-ring/50 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-[3px]",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Foto profil Personnel Management bila API memberinya; selain itu (atau gagal dimuat) inisial. */
function PersonAvatar({ person }: { person: AttendancePerson }) {
  const [broken, setBroken] = useState(false);
  if (person.photoUrl && !broken) {
    return (
      <img
        src={person.photoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className="size-12 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="bg-brand/10 text-brand grid size-12 shrink-0 place-items-center rounded-full text-sm font-semibold"
    >
      {initialsOf(person.fullName)}
    </span>
  );
}

function PersonCard({
  person,
  tz,
  onOpen,
}: {
  person: AttendancePerson;
  tz: string;
  onOpen: () => void;
}) {
  const meta = [person.position, person.division].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Buka riwayat absen ${person.fullName}`}
      className={cn(
        "bg-card text-card-foreground flex h-full w-full flex-col gap-3 rounded-xl border p-4 text-left shadow-xs outline-none",
        // Kartu "naik" saat disorot kursor atau fokus keyboard; tanpa gerak bila pengguna memilih reduced motion.
        "transition-[transform,box-shadow] duration-200 motion-reduce:transition-none",
        "motion-safe:hover:-translate-y-1 motion-safe:focus-visible:-translate-y-1",
        "hover:shadow-lg focus-visible:shadow-lg focus-visible:ring-ring/50 focus-visible:ring-[3px]",
      )}
    >
      <div className="flex items-start gap-3">
        <PersonAvatar person={person} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold break-words" title={person.fullName}>
            {person.fullName}
          </p>
          <p className="text-muted-foreground font-mono text-xs">{person.employeeNumber ?? "—"}</p>
          {meta ? (
            <p className="text-muted-foreground line-clamp-2 text-xs break-words" title={meta}>
              {meta}
            </p>
          ) : null}
        </div>
        {!person.isActive ? <Badge variant="muted">Nonaktif</Badge> : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">PT</dt>
        <dd className="line-clamp-2 break-words" title={person.company?.name ?? undefined}>
          {person.company?.name ?? "—"}
        </dd>
        <dt className="text-muted-foreground">Crew</dt>
        <dd className="truncate">{person.crew?.name ?? "Tanpa crew"}</dd>
        <dt className="text-muted-foreground">Absen terakhir</dt>
        <dd className="tabular-nums">
          {workDateLabel(person.lastWorkDate)}
          {person.lastPunchAt ? ` · ${timeIn(person.lastPunchAt, tz)}` : ""}
        </dd>
      </dl>
      <div className="mt-auto flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Hari ini</span>
        {person.todayStatus ? (
          <DayStatusBadge status={person.todayStatus} />
        ) : (
          <span className="text-muted-foreground">Belum ada absen</span>
        )}
      </div>
    </button>
  );
}

export function AttendancePeopleView({
  companyId,
  tz,
  canManual,
}: {
  companyId: string | undefined;
  tz: string;
  canManual: boolean;
}) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [open, setOpen] = useState<AttendancePerson | null>(null);
  const people = useAttendancePeople({ companyId, ...(q ? { q } : {}) });
  const items = useMemo(() => people.data?.pages.flatMap((p) => p.data) ?? [], [people.data]);
  const total = people.data?.pages[0]?.meta.total ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = people;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Cari nama atau NIP…"
          aria-label="Cari karyawan"
        />
        {!people.isPending && !people.isError ? (
          <p className="text-muted-foreground text-sm whitespace-nowrap" aria-live="polite">
            {total} karyawan
          </p>
        ) : null}
      </div>
      {people.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : people.isError ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center">
          <SearchX className="size-8" aria-hidden />
          <p className="text-foreground font-medium">Gagal memuat karyawan</p>
          <p className="text-sm">{errorMessage(people.error)}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center">
          {q ? (
            <SearchX className="size-8" aria-hidden />
          ) : (
            <Users className="size-8" aria-hidden />
          )}
          <p className="text-foreground font-medium">
            {q ? `Tidak ada karyawan untuk "${q}"` : "Belum ada karyawan yang pernah absen"}
          </p>
          <p className="text-sm">
            {q
              ? "Periksa ejaan nama / NIP."
              : "Kartu muncul otomatis setelah karyawan absen pertama kali."}
          </p>
        </div>
      ) : (
        <>
          <ul
            className={cn(
              "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
              people.isFetching && !isFetchingNextPage && "opacity-70",
            )}
          >
            {items.map((person) => (
              <li key={person.id}>
                <PersonCard person={person} tz={tz} onOpen={() => setOpen(person)} />
              </li>
            ))}
          </ul>
          <LoadMoreSentinel
            hasMore={Boolean(hasNextPage)}
            loading={isFetchingNextPage}
            onLoad={loadMore}
          />
        </>
      )}
      <AttendancePersonDialog
        person={open}
        tz={tz}
        canManual={canManual}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
