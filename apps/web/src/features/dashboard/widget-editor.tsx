import {
  type DashboardWidget,
  isSensitivePivotDimension,
  PIVOT_CHART_TYPE_LABELS,
  PIVOT_CHART_TYPES,
  PIVOT_DIMENSION_LABELS,
  PIVOT_SORT_LABELS,
  PIVOT_SORTS,
  PIVOT_STATUS_LABELS,
  PIVOT_STATUSES,
  type PivotDimension,
  type PivotFilters,
  type PivotWidget,
  type ShortcutsWidget,
  WIDGET_SIZE_LABELS,
  WIDGET_SIZES,
} from "@hris/shared";
import { Check, ChevronLeft, Filter, Lock, Plus, X } from "lucide-react";
import { type ReactNode, useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Me } from "@/features/auth/schemas";
import { cn } from "@/lib/utils";
import { usePivot, usePivotLabels } from "./api";
import { CHART_ICONS, NEEDS_COLUMNS, PivotBody } from "./pivot-widget";
import { shortcutCandidates } from "./simple-widgets";

// D-065: pembuat/pengubah widget — pivot (baris × kolom, filter, bentuk grafik) & Menu Cepat.

/** SA, atau pemegang grant baca data pribadi (sama dengan employee.policy canPivotPersonal). */
export const canUsePersonalDimensions = (me: Me) =>
  me.role === "SUPER_ADMIN" || me.grants.some((g) => g.permission === "employee.personal.read");

const DIMENSION_GROUPS: { label: string; dims: PivotDimension[] }[] = [
  { label: "Kepegawaian", dims: ["category", "status", "education", "gender", "grade"] },
  {
    label: "Organisasi",
    dims: ["company", "directorate", "division", "department", "position", "positionLevel"],
  },
  { label: "Lokasi", dims: ["location", "city"] },
  { label: "Waktu", dims: ["joinYear", "tenure"] },
  { label: "Data pribadi (butuh grant)", dims: ["religion", "maritalStatus", "age"] },
];

const LIMITS = [5, 8, 10, 12, 15, 20, 30, 50];
const NO_COLUMN = "__none";

function DimensionSelect({
  value,
  onChange,
  me,
  allowNone = false,
  exclude,
  id,
}: {
  value: PivotDimension | null;
  onChange: (dimension: PivotDimension | null) => void;
  me: Me;
  allowNone?: boolean;
  exclude?: PivotDimension | null;
  id: string;
}) {
  const personal = canUsePersonalDimensions(me);
  return (
    <Select
      value={value ?? NO_COLUMN}
      onValueChange={(v) => onChange(v === NO_COLUMN ? null : (v as PivotDimension))}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-80">
        {allowNone && <SelectItem value={NO_COLUMN}>Tanpa (satu seri)</SelectItem>}
        {DIMENSION_GROUPS.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.dims.map((dim) => {
              const locked = isSensitivePivotDimension(dim) && !personal;
              return (
                <SelectItem key={dim} value={dim} disabled={locked || dim === exclude}>
                  {locked && <Lock className="size-3" />}
                  {PIVOT_DIMENSION_LABELS[dim]}
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Pilih nilai filter untuk satu dimensi (nilai diambil dari pivot dimensi itu sendiri). */
function FilterValues({
  dimension,
  selected,
  status,
  onChange,
}: {
  dimension: PivotDimension;
  selected: string[];
  status: PivotWidget["status"];
  onChange: (values: string[]) => void;
}) {
  const query = usePivot({ rows: dimension, cols: null, status, filters: {} });
  const [q, setQ] = useState("");
  const options = (query.data?.rowKeys ?? []).filter((k) =>
    k.label.toLowerCase().includes(q.toLowerCase()),
  );
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((v) => v !== key) : [...selected, key]);
  return (
    <div className="space-y-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Cari ${PIVOT_DIMENSION_LABELS[dimension].toLowerCase()}…`}
        className="h-8 text-xs"
      />
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {query.isPending && <p className="text-muted-foreground p-2 text-xs">Memuat…</p>}
        {options.map((option) => {
          const on = selected.includes(option.key);
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => toggle(option.key)}
              className={cn(
                "hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                on && "bg-accent",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border",
                  on && "bg-brand border-brand text-brand-foreground",
                )}
              >
                {on && <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="text-muted-foreground tabular-nums">{option.total}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FiltersEditor({
  draft,
  me,
  onChange,
}: {
  draft: PivotWidget;
  me: Me;
  onChange: (filters: PivotFilters) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState<PivotDimension | null>(null);
  const [open, setOpen] = useState<PivotDimension | null>(null);
  const entries = Object.entries(draft.filters) as [PivotDimension, string[]][];
  const labels = usePivotLabels(
    entries.map(([dim]) => dim),
    draft.status,
  );
  const personal = canUsePersonalDimensions(me);
  const set = (dimension: PivotDimension, values: string[]) => {
    const next = { ...draft.filters };
    if (values.length === 0) delete next[dimension];
    else next[dimension] = values;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([dimension, values]) => (
          <Popover
            key={dimension}
            open={open === dimension}
            onOpenChange={(v) => setOpen(v ? dimension : null)}
          >
            <PopoverTrigger asChild>
              <Badge variant="secondary" className="cursor-pointer gap-1 py-1 pr-1 font-normal">
                <span className="font-medium">{PIVOT_DIMENSION_LABELS[dimension]}:</span>
                <span className="max-w-[160px] truncate">
                  {values.map((v) => labels.get(`${dimension}:${v}`) ?? v).join(", ")}
                </span>
                <button
                  type="button"
                  aria-label={`Hapus filter ${PIVOT_DIMENSION_LABELS[dimension]}`}
                  className="hover:bg-background/60 rounded p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    set(dimension, []);
                  }}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3">
              <FilterValues
                dimension={dimension}
                selected={values}
                status={draft.status}
                onChange={(next) => set(dimension, next)}
              />
            </PopoverContent>
          </Popover>
        ))}
      </div>
      <Popover
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) setAdding(null);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <Plus /> Tambah filter
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          {adding ? (
            <>
              <button
                type="button"
                onClick={() => setAdding(null)}
                className="text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1 text-xs"
              >
                <ChevronLeft className="size-3.5" /> Tampilkan hanya{" "}
                {PIVOT_DIMENSION_LABELS[adding].toLowerCase()}:
              </button>
              <FilterValues
                dimension={adding}
                selected={draft.filters[adding] ?? []}
                status={draft.status}
                onChange={(next) => set(adding, next)}
              />
            </>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {DIMENSION_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-muted-foreground px-1 pb-1 text-[11px] font-medium">
                    {group.label}
                  </p>
                  {group.dims.map((dim) => {
                    const locked = isSensitivePivotDimension(dim) && !personal;
                    return (
                      <button
                        key={dim}
                        type="button"
                        disabled={locked}
                        onClick={() => setAdding(dim)}
                        className="hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {locked && <Lock className="size-3" />}
                        <span className="flex-1">{PIVOT_DIMENSION_LABELS[dim]}</span>
                        {draft.filters[dim] && (
                          <span className="text-muted-foreground">
                            {draft.filters[dim]?.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

function PivotForm({
  draft,
  me,
  onChange,
}: {
  draft: PivotWidget;
  me: Me;
  onChange: (next: PivotWidget) => void;
}) {
  const set = <K extends keyof PivotWidget>(key: K, value: PivotWidget[K]) =>
    onChange({ ...draft, [key]: value });
  const isBar = ["bar", "stacked", "percent", "grouped"].includes(draft.chart);
  return (
    <div className="space-y-4">
      <Field label="Judul" htmlFor="widget-title">
        <Input
          id="widget-title"
          value={draft.title}
          maxLength={80}
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Baris (sumbu utama)" htmlFor="widget-rows">
          <DimensionSelect
            id="widget-rows"
            value={draft.rows}
            me={me}
            exclude={draft.cols}
            onChange={(dim) => dim && set("rows", dim)}
          />
        </Field>
        <Field label="Kolom (pecah per)" htmlFor="widget-cols">
          <DimensionSelect
            id="widget-cols"
            value={draft.cols}
            me={me}
            allowNone
            exclude={draft.rows}
            onChange={(dim) =>
              onChange({
                ...draft,
                cols: dim,
                // Tanpa kolom, bentuk bertumpuk/berdampingan tidak bermakna → bar biasa.
                chart: !dim && NEEDS_COLUMNS.includes(draft.chart) ? "bar" : draft.chart,
              })
            }
          />
        </Field>
      </div>

      <Field label="Jenis grafik">
        <div className="grid grid-cols-4 gap-1.5">
          {PIVOT_CHART_TYPES.map((type) => {
            const Icon = CHART_ICONS[type];
            const disabled = !draft.cols && NEEDS_COLUMNS.includes(type);
            return (
              <button
                key={type}
                type="button"
                disabled={disabled}
                aria-pressed={draft.chart === type}
                onClick={() => set("chart", type)}
                className={cn(
                  "hover:bg-accent flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  draft.chart === type && "border-brand bg-brand-soft text-brand-soft-foreground",
                )}
              >
                <Icon className="size-4" />
                <span className="leading-tight">{PIVOT_CHART_TYPE_LABELS[type]}</span>
              </button>
            );
          })}
        </div>
        {!draft.cols && (
          <p className="text-muted-foreground text-[11px]">
            Pilih Kolom untuk bar bertumpuk, 100%, atau berdampingan.
          </p>
        )}
      </Field>

      <Field label="Filter">
        <FiltersEditor draft={draft} me={me} onChange={(filters) => set("filters", filters)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Karyawan" htmlFor="widget-status">
          <Select
            value={draft.status}
            onValueChange={(v) => set("status", v as PivotWidget["status"])}
          >
            <SelectTrigger id="widget-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIVOT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {PIVOT_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Urutan baris" htmlFor="widget-sort">
          <Select value={draft.sort} onValueChange={(v) => set("sort", v as PivotWidget["sort"])}>
            <SelectTrigger id="widget-sort" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIVOT_SORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {PIVOT_SORT_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Baris maksimal" htmlFor="widget-limit">
          <Select value={String(draft.limit)} onValueChange={(v) => set("limit", Number(v))}>
            <SelectTrigger id="widget-limit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMITS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} (sisanya "Lainnya")
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ukuran widget" htmlFor="widget-size">
          <Select value={draft.size} onValueChange={(v) => set("size", v as PivotWidget["size"])}>
            <SelectTrigger id="widget-size" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WIDGET_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {WIDGET_SIZE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {isBar && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="accent-[var(--brand)] size-4"
            checked={draft.horizontal}
            onChange={(e) => set("horizontal", e.target.checked)}
          />
          Bar mendatar (label panjang lebih mudah dibaca)
        </label>
      )}
    </div>
  );
}

function ShortcutsForm({
  draft,
  me,
  onChange,
}: {
  draft: ShortcutsWidget;
  me: Me;
  onChange: (next: ShortcutsWidget) => void;
}) {
  const candidates = shortcutCandidates(me);
  const groups = [...new Set(candidates.map((c) => c.group))];
  const toggle = (id: string) =>
    onChange({
      ...draft,
      items: draft.items.includes(id)
        ? draft.items.filter((v) => v !== id)
        : [...draft.items, id].slice(0, 16),
    });
  return (
    <div className="space-y-4">
      <Field label="Judul" htmlFor="shortcut-title">
        <Input
          id="shortcut-title"
          value={draft.title}
          maxLength={80}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
      </Field>
      <p className="text-muted-foreground text-xs">
        Pilih hingga 16 menu. Urutan tampil mengikuti urutan Anda memilih ({draft.items.length}/16).
      </p>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group}>
            <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
              {group}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {candidates
                .filter((c) => c.group === group)
                .map(({ item }) => {
                  const order = draft.items.indexOf(item.id);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={order >= 0}
                      onClick={() => toggle(item.id)}
                      className={cn(
                        "hover:bg-accent flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                        order >= 0 && "border-brand bg-brand-soft text-brand-soft-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {order >= 0 && (
                        <span className="bg-brand text-brand-foreground flex size-5 items-center justify-center rounded-full text-[10px] font-semibold">
                          {order + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WidgetEditorDialog({
  initial,
  me,
  isNew,
  onSave,
  onClose,
}: {
  initial: PivotWidget | ShortcutsWidget;
  me: Me;
  isNew: boolean;
  onSave: (widget: DashboardWidget) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const valid = draft.title.trim().length > 0;
  const pivot = draft.kind === "pivot";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn("max-h-[92vh] overflow-y-auto", pivot ? "sm:max-w-6xl" : "sm:max-w-2xl")}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? pivot
                ? "Buat grafik"
                : "Tambah Menu Cepat"
              : pivot
                ? "Ubah grafik"
                : "Ubah Menu Cepat"}
          </DialogTitle>
          <DialogDescription>
            {pivot
              ? "Atur baris, kolom, dan filter seperti pivot table. Pratinjau memakai data asli dalam cakupan Anda."
              : "Pilih menu yang paling sering Anda buka supaya bisa dicapai satu klik dari Dashboard."}
          </DialogDescription>
        </DialogHeader>

        {draft.kind === "pivot" ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr]">
            <PivotForm draft={draft} me={me} onChange={setDraft} />
            <div className="bg-muted/30 min-w-0 rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2">
                <Filter className="text-muted-foreground size-3.5" />
                <p className="text-muted-foreground text-xs font-medium">Pratinjau</p>
              </div>
              <p className="mb-2 truncate text-sm font-semibold">{draft.title || "Tanpa judul"}</p>
              <PivotBody widget={draft} />
            </div>
          </div>
        ) : (
          <ShortcutsForm draft={draft} me={me} onChange={setDraft} />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="brand"
            disabled={!valid}
            onClick={() => onSave({ ...draft, title: draft.title.trim() })}
          >
            {isNew ? <Plus /> : <Check />}
            {isNew ? "Tambahkan ke dashboard" : "Simpan perubahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
