import {
  ATTENDANCE_LOCATION_MODE_LABELS,
  ATTENDANCE_LOCATION_SOURCE_LABELS,
  type AttendanceLocationMode,
  type AttendanceLocationSource,
} from "@hris/shared";
import { AlertTriangle, MapPin, MapPinned, Settings2 } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  type EmployeeLocationRow,
  type LocationSettings,
  useLocationSettings,
  useSetLocationSettings,
} from "../location-api";
import { BreakLocationsCard } from "./overtime-pages";
import { useRosterCompany } from "./roster-page";

// TM-D1 — lokasi absen per karyawan (SA, HR PT). Prioritas site absen: bebas lokasi → lokasi khusus →
// lokasi crew → lokasi kerja karyawan. API tetap sumber kebenaran (cakupan PT).

const SOURCE_TONE: Record<AttendanceLocationSource, string> = {
  ANYWHERE: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  CUSTOM: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  CREW: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  EMPLOYEE: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  NONE: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

export function LocationSettingsPage() {
  const { companies, companyId, setCompanyId } = useRosterCompany();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<EmployeeLocationRow[] | null>(null);
  const query = useLocationSettings(companyId || undefined, q.length >= 2 ? q : "");

  const rows = useMemo(
    () => (query.data?.employees ?? []).filter((r) => !source || r.effective.source === source),
    [query.data, source],
  );
  const visibleIds = rows.map((r) => r.employeeId);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () =>
    setSelected((s) =>
      allChecked ? s.filter((id) => !visibleIds.includes(id)) : [...new Set([...s, ...visibleIds])],
    );
  const chosen = (query.data?.employees ?? []).filter((r) => selected.includes(r.employeeId));

  return (
    <div>
      <PageHeader
        title="Lokasi Absen"
        description="Tentukan di lokasi mana setiap karyawan harus absen. Tanpa pengaturan, karyawan absen di lokasi crew-nya, lalu lokasi kerja di data karyawan."
        actions={
          companies.length > 1 ? (
            <FormSelect
              aria-label="Perusahaan"
              className="h-9 w-56"
              value={companyId}
              onChange={(v) => {
                setCompanyId(v);
                setSelected([]);
              }}
              placeholder="Pilih perusahaan"
              options={companies.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
            />
          ) : null
        }
      />
      <BreakLocationsCard />
      {!companyId ? (
        <EmptyState icon={MapPinned} title="Belum ada perusahaan dalam cakupan akun ini" />
      ) : (
        <div className="space-y-4">
          <PriorityNote />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Cari nama atau NIP (min. 2 huruf)…"
              aria-label="Cari karyawan"
            />
            <FormSelect
              aria-label="Filter asal lokasi"
              className="h-9 sm:w-56"
              value={source}
              onChange={setSource}
              placeholder="Semua asal lokasi"
              noneLabel="Semua asal lokasi"
              options={Object.entries(ATTENDANCE_LOCATION_SOURCE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            {/* Atur = banyak karyawan yang dicentang; satu karyawan cukup klik namanya. */}
            <Button
              variant="brand"
              className="h-9"
              disabled={selected.length === 0}
              title={
                selected.length === 0 ? "Centang karyawan dulu, atau klik nama karyawan" : undefined
              }
              onClick={() => setEditing(chosen)}
            >
              <Settings2 /> Atur{selected.length > 0 ? ` (${selected.length})` : ""}
            </Button>
          </div>

          {selected.length > 0 ? (
            <div className="bg-brand-soft text-brand-soft-foreground flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm">
              <span className="font-medium">{selected.length} karyawan dipilih</span>
              <span className="text-xs opacity-80">— tekan Atur untuk mengatur sekaligus</span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected([])}>
                Batal pilih
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Klik nama karyawan untuk mengatur satu orang, atau centang beberapa karyawan lalu
              tekan Atur.
            </p>
          )}

          {query.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : query.isError ? (
            <EmptyState icon={AlertTriangle} title={errorMessage(query.error)} />
          ) : rows.length === 0 ? (
            <EmptyState icon={MapPin} title="Tidak ada karyawan aktif yang cocok" />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        className="accent-brand size-4"
                        aria-label="Pilih semua karyawan yang tampil"
                        checked={allChecked}
                        onChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Pengaturan</TableHead>
                    <TableHead>Site absen hari ini</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    // Klik di mana saja pada baris = atur karyawan ini. Keyboard: tombol nama (Tab + Enter).
                    <TableRow
                      key={row.employeeId}
                      className="hover:bg-muted/60 cursor-pointer"
                      onClick={() => setEditing([row])}
                    >
                      {/* Sel centang: hanya memilih (tidak membuka dialog); area klik diperbesar. */}
                      <TableCell className="p-0" onClick={(e) => e.stopPropagation()}>
                        <label className="flex h-full cursor-pointer items-center justify-center p-3">
                          <input
                            type="checkbox"
                            className="accent-brand size-4"
                            aria-label={`Pilih ${row.fullName}`}
                            checked={selected.includes(row.employeeId)}
                            onChange={() => toggle(row.employeeId)}
                          />
                        </label>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                          title="Atur lokasi absen karyawan ini"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing([row]);
                          }}
                        >
                          {row.fullName}
                        </button>
                        <p className="text-muted-foreground font-mono text-xs">
                          {row.employeeNumber ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.mode === "DEFAULT" ? "outline" : "secondary"}>
                          {row.mode === "DEFAULT"
                            ? "Bawaan"
                            : ATTENDANCE_LOCATION_MODE_LABELS[row.mode]}
                        </Badge>
                        {row.customLocation ? (
                          <p className="mt-1 text-xs">{row.customLocation.name}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <EffectiveCell row={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {query.data && query.data.employees.length >= 500 ? (
            <p className="text-muted-foreground text-xs">
              Menampilkan 500 karyawan pertama — gunakan pencarian untuk karyawan lain.
            </p>
          ) : null}
        </div>
      )}
      {editing && query.data ? (
        <LocationDialog
          rows={editing}
          locations={query.data.locations}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setSelected([]);
          }}
        />
      ) : null}
    </div>
  );
}

function PriorityNote() {
  return (
    <div className="text-muted-foreground rounded-lg border p-3 text-xs leading-relaxed">
      <span className="text-foreground font-medium">Urutan penentuan site absen: </span>
      1. <span className="text-foreground">Bebas lokasi</span> (tidak dicek radius, koordinat tetap
      dicatat) → 2. <span className="text-foreground">Lokasi absen khusus</span> → 3. Lokasi crew
      pada hari itu → 4. Lokasi kerja di data karyawan. Absen di luar radius tetap tercatat dengan
      label dan alasan.
    </div>
  );
}

function EffectiveCell({ row }: { row: EmployeeLocationRow }) {
  const { source, location, crewName } = row.effective;
  return (
    <div className="space-y-1">
      <span
        className={cn(
          "inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium",
          SOURCE_TONE[source],
        )}
      >
        {ATTENDANCE_LOCATION_SOURCE_LABELS[source]}
        {crewName ? ` · ${crewName}` : ""}
      </span>
      {location ? (
        <p className="flex items-center gap-1 text-sm">
          <MapPin className="text-muted-foreground size-3.5" /> {location.name}
        </p>
      ) : null}
      {location && !location.hasGeofence ? (
        <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-3.5" /> Lokasi belum punya titik & radius — absen selalu di
          luar radius.
        </p>
      ) : null}
      {source === "NONE" ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Absen akan selalu berlabel di luar radius sampai lokasi diatur.
        </p>
      ) : null}
    </div>
  );
}

function LocationDialog({
  rows,
  locations,
  onClose,
  onSaved,
}: {
  rows: EmployeeLocationRow[];
  locations: LocationSettings["locations"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const single = rows.length === 1 ? rows[0] : undefined;
  const [mode, setMode] = useState<AttendanceLocationMode>(single?.mode ?? "LOCATION");
  const [locationId, setLocationId] = useState(single?.customLocation?.id ?? "");
  const save = useSetLocationSettings();
  const invalid = mode === "LOCATION" && !locationId;

  const submit = async () => {
    try {
      const { updated } = await save.mutateAsync({
        employeeIds: rows.map((r) => r.employeeId),
        mode,
        ...(mode === "LOCATION" ? { workLocationId: locationId } : {}),
      });
      toast.success(
        updated === 0 ? "Tidak ada perubahan." : `Lokasi absen ${updated} karyawan diperbarui.`,
      );
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const options: { value: AttendanceLocationMode; hint: string }[] = [
    { value: "LOCATION", hint: "Absen sah hanya di dalam radius lokasi yang dipilih." },
    {
      value: "ANYWHERE",
      hint: "Tidak dicek radius (mis. sales, driver). Koordinat & foto tetap dicatat.",
    },
    { value: "DEFAULT", hint: "Ikuti lokasi crew, lalu lokasi kerja di data karyawan." },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atur lokasi absen</DialogTitle>
          <DialogDescription>
            {single
              ? `${single.fullName}${single.employeeNumber ? ` · ${single.employeeNumber}` : ""}`
              : `${rows.length} karyawan dipilih — pengaturan diterapkan ke semuanya.`}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2" aria-label="Mode lokasi absen">
          {options.map((o) => (
            <label
              key={o.value}
              className={cn(
                "hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                mode === o.value && "border-brand bg-brand-soft/40",
              )}
            >
              <input
                type="radio"
                name="mode"
                className="accent-brand mt-0.5 size-4"
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
              />
              <span>
                <span className="font-medium">{ATTENDANCE_LOCATION_MODE_LABELS[o.value]}</span>
                <span className="text-muted-foreground block text-xs">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {mode === "LOCATION" ? (
          <div className="space-y-1.5">
            <Label htmlFor="attendance-location">Lokasi absen</Label>
            <FormSelect
              id="attendance-location"
              value={locationId}
              onChange={setLocationId}
              placeholder="Pilih lokasi"
              invalid={invalid}
              options={locations.map((l) => ({
                value: l.id,
                label: `${l.name}${l.city ? ` · ${l.city}` : ""}${l.radiusM ? ` (${l.radiusM} m)` : ""}`,
              }))}
            />
            <p className="text-muted-foreground text-xs">
              Hanya lokasi yang sudah punya titik & radius (Master Data › Lokasi Kerja).
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={invalid || save.isPending}
            onClick={() => void submit()}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
