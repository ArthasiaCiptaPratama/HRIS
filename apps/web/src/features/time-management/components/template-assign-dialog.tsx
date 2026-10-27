import { DEFAULT_TIME_SETTINGS } from "@hris/shared";
import { LayoutTemplate } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
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
import { useMasterData } from "@/features/employee/api";
import { errorMessage } from "@/lib/errors";
import {
  useCustomTemplateMutations,
  useCustomTemplates,
  useTemplateAssignPreview,
  useTimeSettings,
} from "../api";
import type { RosterGrid } from "../schemas";
import { todayIn, workDateLabel } from "./display";
import { PatternChips } from "./pattern-chips";

// TM-D23 Fase 2 (permintaan Mat: "tidak dengan kuas saja"): isi roster karyawan dengan template — pilih
// karyawan, template, lokasi, tanggal efektif → dibagi rata ke crew A/B/C, roster terbentuk dari pola.

export function TemplateAssignDialog({
  companyId,
  grid,
  onClose,
}: {
  companyId: string;
  grid: RosterGrid;
  onClose: () => void;
}) {
  const templates = useCustomTemplates(companyId);
  const master = useMasterData();
  const tz = useTimeSettings().data?.timezone ?? DEFAULT_TIME_SETTINGS.timezone;
  const today = todayIn(tz);
  const monthStart = grid.dates[0] ?? today;
  const [templateId, setTemplateId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(monthStart > today ? monthStart : today);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim().toLowerCase());
  const { assign } = useCustomTemplateMutations();

  const template = (templates.data ?? []).find((t) => t.id === templateId);
  const body = {
    workLocationId: locationId,
    employeeIds: [...selected].sort(),
    effectiveDate,
  };
  const preview = useTemplateAssignPreview(
    templateId,
    body,
    Boolean(templateId && locationId && selected.size > 0 && effectiveDate >= today),
  );
  const people = grid.employees.filter(
    (e) =>
      !q ||
      e.fullName.toLowerCase().includes(q) ||
      (e.employeeNumber ?? "").toLowerCase().includes(q),
  );
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pickTemplate = (id: string) => {
    setTemplateId(id);
    // Lokasi bawaan: lokasi tempat template sudah terpasang (bila hanya satu).
    const t = (templates.data ?? []).find((x) => x.id === id);
    const located = t?.installations.filter((i) => i.workLocationId) ?? [];
    if (located.length === 1 && located[0]?.workLocationId)
      setLocationId(located[0].workLocationId);
  };
  const submit = async () => {
    try {
      const plan = await assign.mutateAsync({ id: templateId, body });
      const moved = plan.assignments.filter((a) => !a.stays).length;
      toast.success(
        `${moved} karyawan diisi dengan "${template?.name}" mulai ${workDateLabel(effectiveDate)}.`,
      );
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const plan = preview.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Isi roster dengan template</DialogTitle>
          <DialogDescription>
            Karyawan terpilih dibagi rata ke crew template mulai tanggal berlaku, dan roster lamanya
            ditimpa penuh. Pola berulang otomatis ke minggu-minggu berikutnya. Hari yang absennya
            sudah disetujui atau periodenya ditutup tidak berubah.
          </DialogDescription>
        </DialogHeader>
        {templates.isPending ? (
          <Skeleton className="h-40" />
        ) : (templates.data ?? []).length === 0 ? (
          <EmptyState
            icon={LayoutTemplate}
            title="Belum ada template roster"
            description="Buat dulu di Shift, pola & crew › Template."
            action={
              <Button variant="outline" asChild>
                <Link to="/time/roster/pengaturan">Buka Template</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Template</Label>
                <FormSelect
                  aria-label="Template"
                  className="h-9"
                  value={templateId}
                  onChange={pickTemplate}
                  placeholder="Pilih template"
                  options={(templates.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
                />
              </div>
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
                <Label htmlFor="assign-date">Mulai berlaku</Label>
                <Input
                  id="assign-date"
                  type="date"
                  min={today}
                  value={effectiveDate}
                  onChange={(e) => e.target.value && setEffectiveDate(e.target.value)}
                />
              </div>
            </div>
            {template ? (
              <div className="bg-muted/40 rounded-lg p-2 text-xs">
                <PatternChips steps={template.steps} />
                <p className="text-muted-foreground mt-1">
                  {template.crewCount} crew
                  {template.crewCount > 1 ? ` bergeser ${template.crewOffsetDays} hari` : ""} ·
                  siklus {template.cycleLength} hari
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="flex-1">Karyawan ({selected.size} dipilih)</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setSelected(
                      people.every((p) => selected.has(p.id))
                        ? new Set([...selected].filter((id) => !people.some((p) => p.id === id)))
                        : new Set([...selected, ...people.map((p) => p.id)]),
                    )
                  }
                >
                  {people.length > 0 && people.every((p) => selected.has(p.id))
                    ? "Batalkan semua"
                    : "Pilih semua"}
                </Button>
              </div>
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Cari nama atau NIK…"
                aria-label="Cari karyawan roster"
              />
              <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
                {people.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-brand size-4"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">{p.fullName}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {p.employeeNumber ?? "—"}
                      </span>
                      {p.crew ? <Badge variant="secondary">{p.crew}</Badge> : null}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            {plan && (plan.replacedDays > 0 || plan.lockedDays > 0) ? (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                {plan.replacedDays > 0
                  ? `${plan.replacedDays} sel roster lama (kuas / import / tukar shift) mulai tanggal ini akan ditimpa template.`
                  : ""}
                {plan.lockedDays > 0
                  ? ` ${plan.lockedDays} hari terkunci (absen disetujui / periode tertutup) tidak diubah.`
                  : ""}
              </p>
            ) : null}
            {plan ? <PlanView plan={plan} /> : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={
              assign.isPending ||
              !plan ||
              preview.isFetching ||
              (plan.assignments.every((a) => a.stays) && plan.replacedDays === 0)
            }
            onClick={() => void submit()}
          >
            Terapkan template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanView({
  plan,
}: {
  plan: NonNullable<ReturnType<typeof useTemplateAssignPreview>["data"]>;
}) {
  return (
    <div className="space-y-2">
      {!plan.installed ? (
        <p className="text-muted-foreground text-xs">
          Template belum terpasang di lokasi ini — pola & {plan.crews.length} crew akan dibuat
          otomatis (siklus mulai {workDateLabel(plan.cycleStartDate)}).
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {plan.crews.map((c) => (
          <Badge key={c.name} variant="outline">
            {c.name.split(" · ")[1] ?? c.name}: {c.existing + c.added} orang
            {c.added > 0 ? ` (+${c.added})` : ""}
          </Badge>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Karyawan</th>
              <th className="px-3 py-1.5 text-left font-medium">Masuk crew</th>
              <th className="px-3 py-1.5 text-left font-medium">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {plan.assignments.map((a) => (
              <tr key={a.employeeId} className="border-t">
                <td className="px-3 py-1.5">{a.fullName}</td>
                <td className="px-3 py-1.5">{a.crewName.split(" · ")[1] ?? a.crewName}</td>
                <td className="text-muted-foreground px-3 py-1.5 text-xs">
                  {a.stays
                    ? "Sudah di crew ini"
                    : a.fromCrew
                      ? `Pindah dari ${a.fromCrew}`
                      : "Belum punya crew"}
                </td>
              </tr>
            ))}
            {plan.skipped.map((s) => (
              <tr key={s.employeeId} className="text-destructive border-t">
                <td className="px-3 py-1.5">{s.fullName ?? "—"}</td>
                <td className="px-3 py-1.5">—</td>
                <td className="px-3 py-1.5 text-xs">Dilewati: {s.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {plan.restWarnings.length > 0 ? (
        <ul className="list-disc rounded-lg bg-amber-50 p-2 pl-6 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {plan.restWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
