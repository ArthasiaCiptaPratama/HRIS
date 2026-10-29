import {
  DEFAULT_TIME_SETTINGS,
  OFF_CODE,
  ROSTER_TEMPLATE_MAX_CREWS,
  rosterTemplatePreview,
  weeklyWorkSteps,
} from "@hris/shared";
import { Archive, LayoutTemplate, MapPin, Pencil, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useMasterData } from "@/features/employee/api";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  useCustomTemplateMutations,
  useCustomTemplates,
  usePatterns,
  useShifts,
  useTimeSettings,
} from "../api";
import type { CustomTemplate, Shift } from "../schemas";
import { hhmm, todayIn, workDateLabel } from "./display";
import { PatternChips } from "./pattern-chips";

// TM-D23: template roster buatan HR — pola + jumlah crew + jarak geser, pratinjau langsung (jeda/bentrok,
// cakupan per hari), lalu dipasang ke lokasi kerja (membuat pola + crew A/B/C…).

const PREVIEW_DAYS = 14;

export function TemplateTab({ companyId }: { companyId: string }) {
  const templates = useCustomTemplates(companyId);
  const { archive } = useCustomTemplateMutations();
  const [editing, setEditing] = useState<CustomTemplate | "new" | null>(null);
  const [installing, setInstalling] = useState<CustomTemplate | null>(null);
  const rows = templates.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="text-muted-foreground flex-1 text-sm">
          Susun pola kerja sekali (mis. <span className="font-mono">D D N N OFF OFF</span>, 3 crew
          bergeser 2 hari), lalu pasang ke lokasi kerja. Pola & crew A/B/C dibuat otomatis.
        </p>
        <Button variant="brand" onClick={() => setEditing("new")}>
          <Plus /> Buat template
        </Button>
      </div>
      {templates.isPending ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="Belum ada template buatan sendiri"
          description="Template bawaan (JT, 13+1, 5+2, 3 shift) ada di tab Shift › Pasang template."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((t) => (
            <div key={t.id} className="bg-card space-y-3 rounded-xl border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.name}</p>
                  {t.description ? (
                    <p className="text-muted-foreground text-sm">{t.description}</p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    Siklus {t.cycleLength} hari · {t.workDays} kerja · {t.crewCount} crew
                    {t.crewCount > 1 ? ` bergeser ${t.crewOffsetDays} hari` : ""}
                    {t.startOnMonday ? " · mulai Senin" : ""}
                  </p>
                  <PatternChips steps={t.steps} className="mt-2" />
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="brand" onClick={() => setInstalling(t)}>
                    <MapPin /> Pasang ke lokasi
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                    <Pencil /> Ubah
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      archive.mutate(t.id, {
                        onSuccess: () =>
                          toast.success(
                            "Template diarsipkan; pola & crew yang terpasang tetap berjalan.",
                          ),
                        onError: (e) => toast.error(errorMessage(e)),
                      })
                    }
                  >
                    <Archive /> Arsipkan
                  </Button>
                </div>
              </div>
              {t.installations.length > 0 ? (
                <ul className="space-y-1 border-t pt-2 text-sm">
                  {t.installations.map((inst) => (
                    <li key={inst.patternId} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{inst.workLocationName ?? "Tanpa lokasi"}</span>
                      <span className="text-muted-foreground text-xs">
                        {inst.crews
                          .map((c) => `${c.name.split(" · ")[1] ?? c.name}: ${c.memberCount} orang`)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground border-t pt-2 text-xs">Belum dipasang.</p>
              )}
            </div>
          ))}
        </div>
      )}
      {editing ? (
        <TemplateBuilderDialog
          companyId={companyId}
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {installing ? (
        <InstallDialog template={installing} onClose={() => setInstalling(null)} />
      ) : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

const shiftTime = (s: Shift) =>
  `${hhmm(s.startMinute)}–${hhmm(s.endMinute)}${s.startsNextDay ? " (malam setelah tanggal roster)" : ""}`;

function TemplateBuilderDialog({
  companyId,
  template,
  onClose,
}: {
  companyId: string;
  template: CustomTemplate | null;
  onClose: () => void;
}) {
  const { save } = useCustomTemplateMutations();
  const shifts = useShifts(companyId);
  const patterns = usePatterns(companyId);
  const tz = useTimeSettings().data?.timezone ?? DEFAULT_TIME_SETTINGS.timezone;
  const minRestHours = useTimeSettings().data?.minRestHours ?? DEFAULT_TIME_SETTINGS.minRestHours;
  const locked = (template?.installations.length ?? 0) > 0;
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [steps, setSteps] = useState<string[]>(template?.steps ?? []);
  const [crewCount, setCrewCount] = useState(template?.crewCount ?? 1);
  const [offset, setOffset] = useState(template?.crewOffsetDays ?? 0);
  const [startOnMonday, setStartOnMonday] = useState(template?.startOnMonday ?? false);
  const [quickCode, setQuickCode] = useState("");
  const active = (shifts.data ?? []).filter((s) => !s.archived);
  const unknown = [
    ...new Set(steps.filter((s) => s !== OFF_CODE && !active.some((a) => a.code === s))),
  ];
  const preview =
    steps.length > 0
      ? rosterTemplatePreview(
          { steps, crewCount, crewOffsetDays: offset, startOnMonday },
          active,
          todayIn(tz),
          PREVIEW_DAYS,
          minRestHours,
        )
      : null;
  const submit = async () => {
    try {
      await save.mutateAsync({
        id: template?.id,
        body: {
          companyId,
          name,
          description: description.trim() || null,
          steps,
          crewCount,
          crewOffsetDays: crewCount > 1 ? offset : 0,
          startOnMonday,
        },
      });
      toast.success(
        template
          ? "Template diperbarui."
          : "Template dibuat. Pasang ke lokasi kerja untuk dipakai.",
      );
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template ? "Ubah template roster" : "Buat template roster"}</DialogTitle>
          <DialogDescription>
            Klik kode shift untuk menyusun pola satu siklus. Pratinjau menunjukkan jadwal tiap crew
            dan jeda antarshift.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama template">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rotasi 2-2-2"
              />
            </Field>
            <Field label="Keterangan (opsional)">
              <Textarea
                rows={1}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="2 siang, 2 malam, 2 libur"
              />
            </Field>
          </div>
          {locked ? (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              Template sudah dipasang di {template?.installations.length} lokasi; pola, jumlah crew,
              dan jarak geser tidak bisa diubah. Buat template baru untuk pola lain.
            </p>
          ) : null}
          <fieldset disabled={locked} className="space-y-3">
            <legend className="sr-only">Pola template</legend>
            <div className="bg-muted/50 flex flex-wrap items-end gap-2 rounded-lg p-3">
              <Field label="Template cepat · shift kerja">
                <FormSelect
                  aria-label="Shift template cepat"
                  className="h-9 w-44"
                  value={quickCode}
                  onChange={setQuickCode}
                  placeholder="Pilih shift"
                  options={active.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))}
                />
              </Field>
              {([5, 6] as const).map((days) => (
                <Button
                  key={days}
                  variant="outline"
                  disabled={!quickCode}
                  onClick={() => {
                    setSteps(weeklyWorkSteps(days, quickCode));
                    setStartOnMonday(true);
                    setCrewCount(1);
                    setOffset(0);
                    if (!name.trim()) setName(`${days} hari kerja ${quickCode}`);
                  }}
                >
                  {days} hari kerja ({days === 5 ? "Sen–Jum" : "Sen–Sab"})
                </Button>
              ))}
              <p className="text-muted-foreground w-full text-xs">
                Pola diulang otomatis setiap minggu ke depan (roster dibangkitkan sampai horizon
                pengaturan dan diperpanjang setiap hari).
              </p>
            </div>
            <Field label="Pola satu siklus" hint={`${steps.length} hari per siklus`}>
              <div className="flex flex-wrap gap-1">
                {active.map((s) => (
                  <Button
                    key={s.id}
                    size="sm"
                    variant="outline"
                    title={`${s.name} ${shiftTime(s)}`}
                    onClick={() => setSteps((prev) => [...prev, s.code])}
                  >
                    <span className="font-mono" style={s.color ? { color: s.color } : undefined}>
                      {s.code}
                    </span>
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSteps((prev) => [...prev, OFF_CODE])}
                >
                  <span className="font-mono">{OFF_CODE}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={steps.length === 0}
                  onClick={() => setSteps((prev) => prev.slice(0, -1))}
                >
                  <Undo2 /> Hapus terakhir
                </Button>
                {(patterns.data ?? []).length > 0 ? (
                  <FormSelect
                    aria-label="Mulai dari pola yang ada"
                    className="h-8 w-56"
                    value=""
                    onChange={(id) => {
                      const p = (patterns.data ?? []).find((x) => x.id === id);
                      if (p) setSteps(p.steps);
                    }}
                    placeholder="Mulai dari pola yang ada…"
                    options={(patterns.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                  />
                ) : null}
              </div>
            </Field>
            <Input
              aria-label="Langkah pola"
              value={steps.join(" ")}
              onChange={(e) =>
                setSteps(
                  e.target.value
                    .toUpperCase()
                    .split(/[\s,;]+/)
                    .filter(Boolean),
                )
              }
              placeholder="D D N N OFF OFF"
              className="font-mono"
            />
            {unknown.length > 0 ? (
              <p className="text-destructive text-xs">
                Kode belum ada di master shift: {unknown.join(", ")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Jumlah crew">
                <Input
                  type="number"
                  min={1}
                  max={ROSTER_TEMPLATE_MAX_CREWS}
                  className="w-24"
                  value={crewCount}
                  onChange={(e) =>
                    setCrewCount(
                      Math.min(ROSTER_TEMPLATE_MAX_CREWS, Math.max(1, Number(e.target.value) || 1)),
                    )
                  }
                />
              </Field>
              <Field label="Crew berikutnya bergeser (hari)">
                <Input
                  type="number"
                  min={0}
                  className="w-24"
                  disabled={crewCount < 2}
                  value={offset}
                  onChange={(e) => setOffset(Math.max(0, Number(e.target.value) || 0))}
                />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-brand size-4"
                  checked={startOnMonday}
                  onChange={(e) => setStartOnMonday(e.target.checked)}
                />
                Siklus mulai hari Senin
              </label>
            </div>
          </fieldset>
          {preview ? (
            <TemplatePreview preview={preview} shifts={active} minRestHours={minRestHours} />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={save.isPending || !name.trim() || steps.length === 0 || unknown.length > 0}
            onClick={() => void submit()}
          >
            Simpan template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePreview({
  preview,
  shifts,
  minRestHours,
}: {
  preview: ReturnType<typeof rosterTemplatePreview>;
  shifts: Shift[];
  minRestHours: number;
}) {
  const color = (code: string) => shifts.find((s) => s.code === code)?.color ?? undefined;
  const overlaps = preview.warnings.filter((w) => w.overlap);
  const short = preview.warnings.filter((w) => !w.overlap);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Pratinjau {PREVIEW_DAYS} hari (mulai hari ini)</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-center text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Crew</th>
              {preview.dates.map((d) => (
                <th key={d} className="px-1 py-1 font-normal whitespace-nowrap">
                  {workDateLabel(d).replace(",", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.crews.map((crew) => (
              <tr key={crew.name} className="border-t">
                <td className="px-2 py-1 text-left font-medium whitespace-nowrap">{crew.name}</td>
                {crew.codes.map((code, i) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: kolom = tanggal pratinjau
                    key={i}
                    className={cn(
                      "px-1 py-1 font-mono font-semibold",
                      code === OFF_CODE && "text-muted-foreground bg-muted/40",
                    )}
                    style={code !== OFF_CODE && color(code) ? { color: color(code) } : undefined}
                  >
                    {code}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-muted/30 border-t">
              <td className="px-2 py-1 text-left whitespace-nowrap">Terisi</td>
              {preview.coverage.map((c) => (
                <td
                  key={c.date}
                  className={cn(
                    "px-1 py-1 font-mono",
                    c.codes.length === 0 && "text-destructive font-semibold",
                  )}
                >
                  {c.codes.length === 0 ? "—" : c.codes.join(" ")}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {preview.coverage.some((c) => c.codes.length === 0) ? (
        <p className="text-destructive text-xs">Ada hari tanpa crew yang bekerja (—).</p>
      ) : null}
      {overlaps.length > 0 ? (
        <div className="bg-destructive/10 text-destructive rounded-lg p-2 text-xs">
          <p className="font-medium">Jam kerja bertabrakan:</p>
          <ul className="mt-1 list-disc pl-4">
            {overlaps.map((w) => (
              <li key={w.index}>
                Hari {w.index + 1} → {w.index + 2}: {w.from} belum selesai saat {w.to} mulai (
                {Math.abs(w.restHours)} jam). Periksa centang "mulai setelah tengah malam" pada{" "}
                {w.to}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {short.length > 0 ? (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Jeda antarshift kurang dari {minRestHours} jam:</p>
          <ul className="mt-1 list-disc pl-4">
            {short.map((w) => (
              <li key={w.index}>
                Hari {w.index + 1} → {w.index + 2}: {w.from} lalu {w.to} ({w.restHours} jam)
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function InstallDialog({ template, onClose }: { template: CustomTemplate; onClose: () => void }) {
  const { install } = useCustomTemplateMutations();
  const master = useMasterData();
  const tz = useTimeSettings().data?.timezone ?? DEFAULT_TIME_SETTINGS.timezone;
  const [locationId, setLocationId] = useState("");
  const [start, setStart] = useState(todayIn(tz));
  const installed = new Set(template.installations.map((i) => i.workLocationId));
  const submit = async () => {
    try {
      const result = await install.mutateAsync({
        id: template.id,
        workLocationId: locationId,
        cycleStartDate: start,
      });
      toast.success(
        `${template.name} terpasang: ${result.crews.length} crew dibuat. Atur anggota di tab Crew.`,
      );
      for (const w of result.restWarnings) toast.warning(w);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pasang "{template.name}"</DialogTitle>
          <DialogDescription>
            Membuat pola dan {template.crewCount} crew di lokasi terpilih. Crew A mulai di tanggal
            mulai siklus
            {template.crewCount > 1
              ? `, crew berikutnya ${template.crewOffsetDays} hari lebih awal`
              : ""}
            .
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Lokasi kerja">
            <FormSelect
              aria-label="Lokasi kerja"
              className="h-9"
              value={locationId}
              onChange={setLocationId}
              placeholder="Pilih lokasi"
              options={(master.data?.workLocations ?? []).map((l) => ({
                value: l.id,
                label: installed.has(l.id) ? `${l.name} (sudah terpasang)` : l.name,
              }))}
            />
          </Field>
          <Field
            label="Tanggal mulai siklus"
            hint={
              template.startOnMonday ? "Ditarik ke hari Senin pada/sebelum tanggal ini." : undefined
            }
          >
            <Input
              type="date"
              value={start}
              onChange={(e) => e.target.value && setStart(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={install.isPending || !locationId || installed.has(locationId)}
            onClick={() => void submit()}
          >
            Pasang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
