import {
  OFF_CODE,
  RESIDENCIES,
  RESIDENCY_LABELS,
  type Residency,
  TIME_OFF_CODE,
  type WorkRosterInput,
  workRosterInputSchema,
  workRosterSummary,
} from "@hris/shared";
import {
  AlertTriangle,
  Archive,
  Building2,
  Home,
  MapPin,
  Pencil,
  Plus,
  RefreshCcw,
  Sparkles,
  Users,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useSearchParams } from "react-router";
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
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { TIME_OFF_TITLE } from "../components/display";
import { PatternChips } from "../components/pattern-chips";
import {
  type EmployeeResidency,
  type LocalHomebasesView,
  useEmployeeResidencies,
  useLocalHomebases,
  useSetEmployeeResidency,
  useSetLocalHomebases,
  useWorkRosterMutations,
  useWorkRosters,
  type WorkRoster,
} from "../work-roster-api";
import { useRosterCompany } from "./roster-page";

// TM-D28 — Pola Kerja = siklus kerja–libur (office mis. 5/2; lapangan non-lokal 13/1 × N + time off; lapangan
// lokal 6/1 tanpa time off). Kelompok otomatis: lokasi kantor → office; selain itu Homebase karyawan vs
// Homebase lokal lokasi kerja; HR bisa mengubah. Dipakai dari Jadwal Bulanan › Isi dengan pola kerja
// (dirakit menjadi template jadwal). Nama kode tetap "work roster".

const TABS = ["rosters", "homebase", "residency"] as const;
type Tab = (typeof TABS)[number];

export function WorkRosterPage() {
  const { companies, companyId, setCompanyId } = useRosterCompany();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "rosters";
  const setTab = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === "rosters") next.delete("tab");
        else next.set("tab", value);
        return next;
      },
      { replace: true },
    );
  return (
    <div>
      <PageHeader
        title="Pola Kerja"
        description="Siklus kerja–libur yang wajib dijalani karyawan: office mis. 5 kerja / 2 libur, lapangan non-lokal 13 kerja / 1 libur lalu time off pulang ke Homebase, lapangan lokal 6 kerja / 1 libur. Pasang ke jadwal dari Jadwal Bulanan › Isi dengan pola kerja."
        actions={
          companies.length > 1 ? (
            <FormSelect
              aria-label="Perusahaan"
              className="h-9 w-56"
              value={companyId}
              onChange={setCompanyId}
              placeholder="Pilih perusahaan"
              options={companies.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
            />
          ) : null
        }
      />
      {!companyId ? (
        <EmptyState icon={RefreshCcw} title="Belum ada perusahaan dalam cakupan akun ini" />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="rosters">Pola kerja</TabsTrigger>
            <TabsTrigger value="homebase">Lokasi kerja</TabsTrigger>
            <TabsTrigger value="residency">Kelompok karyawan</TabsTrigger>
          </TabsList>
          <TabsContent value="rosters" className="mt-4">
            <RosterTab companyId={companyId} />
          </TabsContent>
          <TabsContent value="homebase" className="mt-4">
            <HomebaseTab />
          </TabsContent>
          <TabsContent value="residency" className="mt-4">
            <ResidencyTab key={companyId} companyId={companyId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ResidencyBadge({ residency }: { residency: Residency | null }) {
  if (!residency) return <Badge variant="warning">Belum diketahui</Badge>;
  const variant =
    residency === "OFFICE" ? "secondary" : residency === "LOCAL" ? "success" : "brand";
  return <Badge variant={variant}>{RESIDENCY_LABELS[residency]}</Badge>;
}

/** Satu siklus kerja–libur (K = hari kerja) + blok time off, ringkas. */
function RosterStrip({
  shape,
}: {
  shape: Pick<WorkRosterInput, "workDays" | "offDays" | "cyclesBeforeTimeOff" | "timeOffDays">;
}) {
  const cycle = [
    ...Array<string>(Math.min(Math.max(shape.workDays, 0), 60)).fill("K"),
    ...Array<string>(Math.min(Math.max(shape.offDays, 0), 30)).fill(OFF_CODE),
  ];
  const timeOff = Array<string>(Math.min(Math.max(shape.timeOffDays, 0), 60)).fill(TIME_OFF_CODE);
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      <PatternChips steps={cycle} />
      {shape.cyclesBeforeTimeOff > 0 ? (
        <>
          <span className="text-muted-foreground font-medium">× {shape.cyclesBeforeTimeOff}</span>
          <span className="text-muted-foreground">→</span>
          <PatternChips steps={timeOff} />
        </>
      ) : (
        <span className="text-muted-foreground">berulang</span>
      )}
    </div>
  );
}

// ── Tab Pola kerja ───────────────────────────────────────────────────────────────

function RosterTab({ companyId }: { companyId: string }) {
  const rosters = useWorkRosters(companyId);
  const { archive, createDefaults } = useWorkRosterMutations();
  const [editing, setEditing] = useState<WorkRoster | "new" | null>(null);
  const rows = rosters.data ?? [];

  const makeDefaults = () =>
    createDefaults.mutate(companyId, {
      onSuccess: (list) =>
        toast.success(`Pola kerja bawaan siap (${list.length} pola kerja di PT ini).`),
      onError: (e) => toast.error(errorMessage(e)),
    });
  const archiveRoster = (r: WorkRoster) => {
    if (
      !window.confirm(
        `Arsipkan pola kerja "${r.name}"? Jadwal yang sudah diisi dengan pola kerja ini tetap berjalan.`,
      )
    )
      return;
    archive.mutate(r.id, {
      onSuccess: () => toast.success("Pola kerja diarsipkan."),
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="text-muted-foreground flex-1 text-sm">
          Hari kerja memakai shift yang dipilih saat mengisi jadwal; hari libur = OFF; blok time off
          = <span className="font-mono">TO</span> (time off pulang ke Homebase, bukan cuti).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={createDefaults.isPending} onClick={makeDefaults}>
            <Sparkles /> Buat pola kerja bawaan
          </Button>
          <Button variant="brand" onClick={() => setEditing("new")}>
            <Plus /> Tambah pola kerja
          </Button>
        </div>
      </div>
      {rosters.isPending ? (
        <Skeleton className="h-40" />
      ) : rosters.isError ? (
        <EmptyState icon={AlertTriangle} title={errorMessage(rosters.error)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={RefreshCcw}
          title="Belum ada pola kerja"
          description="Tekan Buat pola kerja bawaan untuk office 5/2, lapangan non-lokal 13/1 + time off 14 hari, dan lapangan lokal 6/1, atau tambah sendiri."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{r.name}</p>
                  <ResidencyBadge residency={r.residency} />
                  {r.inUse ? <Badge variant="muted">Dipakai</Badge> : null}
                </div>
                <p className="text-muted-foreground text-sm">
                  {r.summary} · {r.crewCount} crew
                </p>
                <RosterStrip shape={r} />
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(r)}
                  aria-label={`Ubah ${r.name}`}
                >
                  <Pencil /> Ubah
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={archive.isPending}
                  onClick={() => archiveRoster(r)}
                  aria-label={`Arsipkan ${r.name}`}
                >
                  <Archive /> Arsipkan
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing ? (
        <RosterDialog
          companyId={companyId}
          roster={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function RosterDialog({
  companyId,
  roster,
  onClose,
}: {
  companyId: string;
  roster: WorkRoster | null;
  onClose: () => void;
}) {
  const { save } = useWorkRosterMutations();
  const locked = roster?.inUse ?? false;
  const [name, setName] = useState(roster?.name ?? "");
  const [residency, setResidency] = useState<Residency>(roster?.residency ?? "NON_LOCAL");
  const [workDays, setWorkDays] = useState(roster?.workDays ?? 13);
  const [offDays, setOffDays] = useState(roster?.offDays ?? 1);
  const [cycles, setCycles] = useState(roster?.cyclesBeforeTimeOff ?? 4);
  const [timeOffDays, setTimeOffDays] = useState(roster?.timeOffDays ?? 14);
  const [crewCount, setCrewCount] = useState(roster?.crewCount ?? 1);

  const input = {
    companyId,
    name: name.trim(),
    residency,
    workDays,
    offDays,
    cyclesBeforeTimeOff: cycles,
    // Tanpa time off → lama time off 0 (roster terkunci dikirim apa adanya supaya siklus tidak berubah).
    timeOffDays: cycles === 0 && !locked ? 0 : timeOffDays,
    crewCount,
  };
  const parsed = workRosterInputSchema.safeParse(input);
  const problem = parsed.success
    ? null
    : (parsed.error.issues.find((i) => i.path[0] !== "name")?.message ?? null);

  const submit = async () => {
    if (!parsed.success) return;
    try {
      await save.mutateAsync({ id: roster?.id, body: parsed.data });
      toast.success(roster ? "Pola kerja diperbarui." : "Pola kerja ditambahkan.");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{roster ? "Ubah pola kerja" : "Tambah pola kerja"}</DialogTitle>
          <DialogDescription>
            Satu siklus = hari kerja lalu hari libur. Setelah sejumlah siklus, karyawan mendapat
            time off (mis. pulang ke Homebase). Isi 0 siklus untuk pola kerja tanpa time off.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="roster-name">Nama</Label>
              <Input
                id="roster-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="Non-lokal 13/1 + time off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Untuk</Label>
              <FormSelect
                aria-label="Untuk"
                className="h-9"
                value={residency}
                onChange={(v) => setResidency(v as Residency)}
                placeholder="Pilih"
                options={RESIDENCIES.map((r) => ({
                  value: r,
                  label: RESIDENCY_LABELS[r],
                }))}
              />
            </div>
          </div>
          {locked ? (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              Pola kerja sudah dipakai; buat pola kerja baru untuk siklus lain.
            </p>
          ) : null}
          <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-3">
            <legend className="sr-only">Siklus pola kerja</legend>
            <NumberField
              id="roster-work"
              label="Hari kerja"
              value={workDays}
              onChange={setWorkDays}
              min={1}
              max={60}
            />
            <NumberField
              id="roster-off"
              label="Hari libur"
              value={offDays}
              onChange={setOffDays}
              min={0}
              max={30}
            />
            <NumberField
              id="roster-crews"
              label="Jumlah crew"
              hint="Crew bergiliran supaya site tidak kosong."
              value={crewCount}
              onChange={setCrewCount}
              min={1}
              max={8}
            />
            <NumberField
              id="roster-cycles"
              label="Siklus sebelum time off"
              hint="0 = tanpa time off"
              value={cycles}
              onChange={setCycles}
              min={0}
              max={20}
            />
            <NumberField
              id="roster-timeoff"
              label="Lama time off (hari)"
              value={cycles === 0 ? 0 : timeOffDays}
              onChange={setTimeOffDays}
              min={0}
              max={60}
            />
          </fieldset>
          <div className="bg-muted/40 space-y-2 rounded-lg p-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Ringkasan: </span>
              <span className="font-medium" data-testid="roster-summary">
                {workRosterSummary(input)}
              </span>
            </p>
            <RosterStrip shape={input} />
            <p className="text-muted-foreground text-[11px]">
              K = hari kerja (shift dipilih saat mengisi jadwal) · OFF = libur ·{" "}
              <span title={TIME_OFF_TITLE}>TO = time off</span>
            </p>
          </div>
          {problem ? <p className="text-destructive text-xs">{problem}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={save.isPending || !parsed.success}
            onClick={() => void submit()}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab Lokasi kerja (lokasi kantor & Homebase lokal) ────────────────────────────

function HomebaseTab() {
  const view = useLocalHomebases();
  const [editing, setEditing] = useState<LocalHomebasesView["locations"][number] | null>(null);
  const data = view.data;
  const homebaseName = new Map((data?.homebases ?? []).map((h) => [h.id, h.name]));
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground rounded-lg border p-3 text-sm">
        Lokasi kantor → karyawannya memakai pola kerja <b>office</b>. Lokasi lain: karyawan dengan
        Homebase di daftar Homebase lokal dihitung <b>lapangan lokal</b>, lainnya{" "}
        <b>lapangan non-lokal</b>. Lokasi lapangan tanpa daftar Homebase lokal → kelompok
        karyawannya belum diketahui dan perlu dipilih HR di tab Kelompok karyawan.
      </p>
      {view.isPending ? (
        <Skeleton className="h-40" />
      ) : view.isError ? (
        <EmptyState icon={AlertTriangle} title={errorMessage(view.error)} />
      ) : (data?.locations ?? []).length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Belum ada lokasi kerja"
          description="Tambah lokasi kerja di Master Data › Lokasi Kerja."
        />
      ) : (
        <ul className="space-y-2">
          {data?.locations.map((l) => (
            <li
              key={l.id}
              className="bg-card flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {l.name}
                    {l.city ? (
                      <span className="text-muted-foreground text-sm"> · {l.city}</span>
                    ) : null}
                  </p>
                  {l.office ? (
                    <Badge variant="secondary">
                      <Building2 /> Kantor (office)
                    </Badge>
                  ) : (
                    <Badge variant="outline">Lapangan</Badge>
                  )}
                </div>
                {l.office ? (
                  <p className="text-muted-foreground text-xs">
                    Semua karyawan di lokasi ini memakai pola kerja office.
                  </p>
                ) : l.homebaseIds.length === 0 ? (
                  <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5" /> Homebase lokal belum diatur — kelompok
                    karyawan di lokasi ini belum bisa ditentukan otomatis.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {l.homebaseIds.map((id) => (
                      <Badge key={id} variant="secondary">
                        <Home /> {homebaseName.get(id) ?? "Homebase diarsipkan"}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(l)}
                aria-label={`Atur lokasi kerja ${l.name}`}
              >
                <Pencil /> Atur
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && data ? (
        <HomebaseDialog
          location={editing}
          homebases={data.homebases}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function HomebaseDialog({
  location,
  homebases,
  onClose,
}: {
  location: LocalHomebasesView["locations"][number];
  homebases: LocalHomebasesView["homebases"];
  onClose: () => void;
}) {
  const save = useSetLocalHomebases();
  const [office, setOffice] = useState(location.office);
  const [selected, setSelected] = useState<Set<string>>(new Set(location.homebaseIds));
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim().toLowerCase());
  const shown = homebases.filter(
    (h) => !q || [h.name, h.city ?? "", h.province ?? ""].some((v) => v.toLowerCase().includes(q)),
  );
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const submit = async () => {
    try {
      // Daftar Homebase lokal tetap disimpan apa adanya (dipakai lagi bila lokasi bukan kantor lagi).
      await save.mutateAsync({
        workLocationId: location.id,
        office,
        homebaseIds: [...selected].sort(),
      });
      toast.success(
        office
          ? `${location.name} ditandai lokasi kantor (office).`
          : `Lokasi kerja ${location.name} disimpan (${selected.size} Homebase lokal).`,
      );
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lokasi kerja · {location.name}</DialogTitle>
          <DialogDescription>
            Lokasi kantor → karyawannya office. Lokasi lapangan: karyawan dengan Homebase di daftar
            ini dihitung lapangan lokal; lainnya lapangan non-lokal.
          </DialogDescription>
        </DialogHeader>
        <label
          className={cn(
            "hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
            office && "border-brand bg-brand-soft/40",
          )}
        >
          <input
            type="checkbox"
            className="accent-brand mt-0.5 size-4"
            checked={office}
            onChange={(e) => setOffice(e.target.checked)}
          />
          <span>Lokasi kantor — karyawan di sini memakai pola kerja office</span>
        </label>
        {office ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
            Homebase lokal tidak dipakai untuk lokasi kantor.
          </p>
        ) : (
          <HomebasePicker
            homebases={homebases}
            selected={selected}
            search={search}
            onSearch={setSearch}
            shown={shown}
            onToggle={toggle}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button variant="brand" disabled={save.isPending} onClick={() => void submit()}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HomebasePicker({
  homebases,
  selected,
  search,
  onSearch,
  shown,
  onToggle,
}: {
  homebases: LocalHomebasesView["homebases"];
  selected: Set<string>;
  search: string;
  onSearch: (value: string) => void;
  shown: LocalHomebasesView["homebases"];
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <SearchField
        value={search}
        onChange={onSearch}
        placeholder="Cari Homebase, kota, provinsi…"
        aria-label="Cari Homebase"
      />
      <p className="text-muted-foreground text-xs">{selected.size} Homebase dipilih</p>
      {homebases.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Belum ada master Homebase (Master Data › Homebase).
        </p>
      ) : (
        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {shown.map((h) => (
            <li key={h.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-brand size-4"
                  checked={selected.has(h.id)}
                  onChange={() => onToggle(h.id)}
                />
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {[h.city, h.province].filter(Boolean).join(", ")}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ── Tab Kelompok karyawan (office / lapangan lokal / lapangan non-lokal) ───────────

const STATUS_FILTERS = [
  ...RESIDENCIES.map((r) => ({ value: r, label: RESIDENCY_LABELS[r] })),
  { value: "UNKNOWN", label: "Belum diketahui" },
];

const SOURCE_LABELS: Record<EmployeeResidency["source"], string> = {
  OVERRIDE: "Diatur HR",
  LOCATION: "Lokasi kantor",
  HOMEBASE: "Otomatis (Homebase)",
  UNKNOWN: "",
};

function ResidencyTab({ companyId }: { companyId: string }) {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const query = useEmployeeResidencies(companyId, q.length >= 2 ? q : "");
  const setResidency = useSetEmployeeResidency();

  const rows = (query.data ?? []).filter(
    (r) => !status || (status === "UNKNOWN" ? r.residency === null : r.residency === status),
  );
  const visibleIds = rows.map((r) => r.employeeId);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () =>
    setSelected((s) =>
      allChecked ? s.filter((id) => !visibleIds.includes(id)) : [...new Set([...s, ...visibleIds])],
    );
  const unknownCount = (query.data ?? []).filter((r) => r.residency === null).length;

  const apply = (residency: Residency | null) =>
    setResidency.mutate(
      { companyId, employeeIds: selected, residency },
      {
        onSuccess: ({ updated }) => {
          toast.success(
            residency
              ? `${updated} karyawan ditetapkan ${RESIDENCY_LABELS[residency].toLowerCase()}.`
              : `${updated} karyawan dikembalikan ke otomatis (lokasi kantor / Homebase).`,
          );
          setSelected([]);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Otomatis: lokasi kerja kantor → office; selain itu Homebase karyawan ada di daftar Homebase
        lokal lokasi kerjanya → lapangan lokal, lainnya lapangan non-lokal. HR bisa menetapkan
        sendiri bila perlu.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Cari nama atau NIK (min. 2 huruf)…"
          aria-label="Cari karyawan"
        />
        <FormSelect
          aria-label="Filter status"
          className="h-9 sm:w-52"
          value={status}
          onChange={setStatus}
          placeholder="Semua status"
          noneLabel="Semua status"
          options={STATUS_FILTERS}
        />
      </div>
      {unknownCount > 0 ? (
        <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-3.5" /> {unknownCount} karyawan belum diketahui kelompoknya
          — tidak akan dipasangi pola kerja sampai ditetapkan.
        </p>
      ) : null}
      {selected.length > 0 ? (
        <div className="bg-brand-soft text-brand-soft-foreground flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm">
          <span className="font-medium">{selected.length} karyawan dipilih</span>
          <div className="ml-auto flex flex-wrap gap-1">
            {RESIDENCIES.map((r) => (
              <Button
                key={r}
                size="sm"
                variant="outline"
                disabled={setResidency.isPending}
                onClick={() => apply(r)}
              >
                Jadikan {RESIDENCY_LABELS[r].toLowerCase()}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              disabled={setResidency.isPending}
              onClick={() => apply(null)}
            >
              Kembalikan otomatis
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Batal pilih
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Centang karyawan lalu pilih Jadikan office, Jadikan lapangan lokal, Jadikan lapangan
          non-lokal, atau Kembalikan otomatis.
        </p>
      )}
      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <EmptyState icon={AlertTriangle} title={errorMessage(query.error)} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title="Tidak ada karyawan aktif yang cocok" />
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
                <TableHead>Homebase</TableHead>
                <TableHead>Lokasi kerja</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <ResidencyRow
                  key={row.employeeId}
                  row={row}
                  checked={selected.includes(row.employeeId)}
                  onToggle={() => toggle(row.employeeId)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ResidencyRow({
  row,
  checked,
  onToggle,
}: {
  row: EmployeeResidency;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TableRow className={cn(checked && "bg-brand-soft/30")}>
      <TableCell className="p-0">
        <label className="flex h-full cursor-pointer items-center justify-center p-3">
          <input
            type="checkbox"
            className="accent-brand size-4"
            aria-label={`Pilih ${row.fullName}`}
            checked={checked}
            onChange={onToggle}
          />
        </label>
      </TableCell>
      <TableCell>
        <p className="font-medium">{row.fullName}</p>
        <p className="text-muted-foreground font-mono text-xs">{row.employeeNumber ?? "—"}</p>
      </TableCell>
      <TableCell>
        {row.homebase ? (
          row.homebase.name
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-3.5" /> Belum diisi
          </span>
        )}
      </TableCell>
      <TableCell>{row.workLocation?.name ?? "—"}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <ResidencyBadge residency={row.residency} />
          <span className="text-muted-foreground text-xs">{SOURCE_LABELS[row.source]}</span>
        </div>
        {row.note ? <p className="text-muted-foreground mt-1 text-xs">{row.note}</p> : null}
      </TableCell>
    </TableRow>
  );
}
