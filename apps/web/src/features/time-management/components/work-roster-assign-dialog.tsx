import {
  RESIDENCIES,
  RESIDENCY_LABELS,
  type Residency,
  type WorkRosterAssignInput,
} from "@hris/shared";
import { Repeat } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
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
import { useMasterData } from "@/features/employee/api";
import { errorMessage } from "@/lib/errors";
import { useShifts, useTimezone } from "../api";
import type { RosterGrid } from "../schemas";
import {
  useWorkRosterAssign,
  useWorkRosterAssignPreview,
  useWorkRosters,
  type WorkRosterAssignPreview,
} from "../work-roster-api";
import { hhmm, todayIn, workDateLabel } from "./display";
import { AssignPlanDetails, EmployeePicker } from "./template-assign-dialog";

// TM-D28: Jadwal Bulanan › Isi dengan pola kerja — karyawan dikelompokkan otomatis (override HR → lokasi
// kantor = office → Homebase vs Homebase lokal = lapangan lokal / non-lokal), tiap kelompok memakai pola
// kerja pilihannya + shift hari kerja, lalu dipasang lewat mesin "isi dengan template" (TM-D23/TM-D24).

const NO_PICKS: Record<Residency, string | null> = { OFFICE: null, LOCAL: null, NON_LOCAL: null };

export function WorkRosterAssignDialog({
  companyId,
  grid,
  onClose,
}: {
  companyId: string;
  grid: RosterGrid;
  onClose: () => void;
}) {
  const rosters = useWorkRosters(companyId);
  const shifts = useShifts(companyId);
  const master = useMasterData();
  const today = todayIn(useTimezone());
  const [locationId, setLocationId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [shiftCode, setShiftCode] = useState("");
  // null = belum dipilih → pola kerja pertama kelompok itu; "" = tidak dipakai.
  const [picks, setPicks] = useState<Record<Residency, string | null>>(NO_PICKS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const preview = useWorkRosterAssignPreview();
  const assign = useWorkRosterAssign();
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);

  const list = rosters.data ?? [];
  const ofGroup = (residency: Residency) => list.filter((r) => r.residency === residency);
  const chosen = Object.fromEntries(
    RESIDENCIES.map((r) => [r, (picks[r] ?? ofGroup(r)[0]?.id ?? "") || null]),
  ) as Record<Residency, string | null>;
  const activeShifts = (shifts.data ?? []).filter((s) => !s.archived);

  const body: WorkRosterAssignInput = {
    companyId,
    workLocationId: locationId,
    employeeIds: [...selected].sort(),
    effectiveDate,
    shiftCode,
    officeRosterId: chosen.OFFICE,
    localRosterId: chosen.LOCAL,
    nonLocalRosterId: chosen.NON_LOCAL,
  };
  const bodyKey = JSON.stringify(body);
  const ready = Boolean(
    locationId &&
      effectiveDate &&
      shiftCode &&
      selected.size > 0 &&
      RESIDENCIES.some((r) => chosen[r]),
  );
  // Pratinjau hanya berlaku untuk isian yang sama persis; isian berubah → pratinjau ulang.
  const result = previewedKey === bodyKey ? preview.data : undefined;
  const nothingToApply =
    !result ||
    result.groups.length === 0 ||
    result.groups.every((g) => g.plan.assignments.every((a) => a.stays && !a.needsApproval));

  const runPreview = () => {
    setPreviewedKey(bodyKey);
    preview.mutate(body, { onError: (e) => toast.error(errorMessage(e)) });
  };

  const submit = async () => {
    try {
      const done = await assign.mutateAsync(body);
      toast.success(applySummary(done, effectiveDate));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Isi jadwal dengan pola kerja</DialogTitle>
          <DialogDescription>
            Karyawan dikelompokkan otomatis: lokasi kantor → office, selain itu lapangan lokal /
            non-lokal dari Homebase-nya. Tiap kelompok memakai pola kerja pilihannya dengan shift
            hari kerja, lalu dibagi rata ke crew mulai tanggal berlaku. Jadwal lama ditimpa; hari
            yang sudah ada absennya atau periodenya ditutup tidak berubah.
          </DialogDescription>
        </DialogHeader>
        {rosters.isPending ? (
          <Skeleton className="h-40" />
        ) : list.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Belum ada pola kerja"
            description="Buat dulu pola kerja office / lapangan (mis. 5/2, 6/1, dan 13/1 + time off)."
            action={
              <Button variant="outline" asChild>
                <Link to="/time/pola-kerja">Buka Pola Kerja</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Lokasi kerja</Label>
                <FormSelect
                  aria-label="Lokasi kerja"
                  className="h-9"
                  value={locationId}
                  onChange={setLocationId}
                  placeholder="Pilih lokasi"
                  options={(master.data?.workLocations ?? []).map((l) => ({
                    value: l.id,
                    label: l.name,
                  }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="work-roster-date">Tanggal berlaku</Label>
                <Input
                  id="work-roster-date"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => e.target.value && setEffectiveDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Shift hari kerja</Label>
                <FormSelect
                  aria-label="Shift hari kerja"
                  className="h-9"
                  value={shiftCode}
                  onChange={setShiftCode}
                  placeholder="Pilih shift"
                  options={activeShifts.map((s) => ({
                    value: s.code,
                    label: `${s.code} · ${s.name} ${hhmm(s.startMinute)}–${hhmm(s.endMinute)}`,
                  }))}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {RESIDENCIES.map((r) => (
                <div key={r} className="space-y-1.5">
                  <Label>Pola kerja {RESIDENCY_LABELS[r].toLowerCase()}</Label>
                  <FormSelect
                    aria-label={`Pola kerja ${RESIDENCY_LABELS[r].toLowerCase()}`}
                    className="h-9"
                    value={chosen[r] ?? ""}
                    onChange={(value) => setPicks((prev) => ({ ...prev, [r]: value }))}
                    placeholder="Tidak dipakai"
                    noneLabel="Tidak dipakai"
                    options={ofGroup(r).map((x) => ({
                      value: x.id,
                      label: `${x.name} · ${x.summary}`,
                    }))}
                  />
                </div>
              ))}
            </div>
            <EmployeePicker employees={grid.employees} selected={selected} onChange={setSelected} />
            {preview.isPending && previewedKey === bodyKey ? <Skeleton className="h-24" /> : null}
            {result ? <PreviewView result={result} /> : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="outline"
            disabled={!ready || preview.isPending}
            onClick={runPreview}
            title={ready ? undefined : "Lengkapi lokasi, shift, pola kerja, dan karyawan"}
          >
            Pratinjau
          </Button>
          <Button
            variant="brand"
            disabled={assign.isPending || nothingToApply}
            title={result ? undefined : "Pratinjau dulu sebelum menyimpan"}
            onClick={() => void submit()}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function applySummary(done: WorkRosterAssignPreview, effectiveDate: string): string {
  const parts = done.groups.map((g) => {
    const direct = g.plan.assignments.filter((a) => !a.stays && !a.needsApproval).length;
    return [
      `${RESIDENCY_LABELS[g.residency]}: ${direct} karyawan diisi "${g.roster.name}" mulai ${workDateLabel(effectiveDate)}.`,
      g.plan.approvalCount > 0
        ? `${g.plan.approvalCount} perubahan diajukan ke atasan + HR (Perubahan Jadwal › Diajukan saya).`
        : null,
    ]
      .filter(Boolean)
      .join(" ");
  });
  if (done.unresolved.length > 0) parts.push(`${done.unresolved.length} karyawan tidak dipasang.`);
  return parts.join(" ");
}

function PreviewView({ result }: { result: WorkRosterAssignPreview }) {
  return (
    <div className="space-y-4">
      {result.groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Tidak ada karyawan yang bisa dipasangi pola kerja.
        </p>
      ) : null}
      {result.groups.map((g) => (
        <section
          key={g.residency}
          aria-label={`Kelompok ${RESIDENCY_LABELS[g.residency]}`}
          className="space-y-2 rounded-lg border p-3"
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-sm font-semibold">
              {RESIDENCY_LABELS[g.residency]} · {g.roster.summary}
            </h3>
            <span className="text-muted-foreground text-xs">
              {g.roster.name} · template {g.templateName}
            </span>
          </div>
          <AssignPlanDetails plan={g.plan} />
        </section>
      ))}
      {result.unresolved.length > 0 ? (
        <section
          aria-label="Tidak dipasang"
          className="border-destructive/40 space-y-2 rounded-lg border p-3"
        >
          <h3 className="text-destructive text-sm font-semibold">
            Tidak dipasang ({result.unresolved.length})
          </h3>
          <ul className="space-y-1 text-sm">
            {result.unresolved.map((u) => (
              <li key={u.employeeId} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{u.fullName}</span>
                <span className="text-muted-foreground text-xs">{u.reason}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Lengkapi Homebase karyawan atau tetapkan kelompoknya di{" "}
            <Link to="/time/pola-kerja?tab=residency" className="text-brand hover:underline">
              Pola Kerja › Kelompok karyawan
            </Link>
            , lalu pratinjau ulang.
          </p>
        </section>
      ) : null}
    </div>
  );
}
