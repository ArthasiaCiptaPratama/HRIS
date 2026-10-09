import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DASHBOARD_LAYOUT_VERSION,
  type DashboardWidget,
  DEFAULT_DASHBOARD_LAYOUT,
  type PivotWidget,
  type ShortcutsWidget,
  STAT_METRIC_LABELS,
  type WidgetSize,
} from "@hris/shared";
import { Check, LayoutGrid, Loader2, Lock, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import type { Me } from "@/features/auth/schemas";
import { cn } from "@/lib/utils";
import { useDashboardLayout, useSaveDashboardLayout } from "./api";
import { CHART_ICONS, describePivot, PivotWidgetCard } from "./pivot-widget";
import { ShortcutsWidgetCard, StatWidgetCard } from "./simple-widgets";
import {
  BLANK_PIVOT,
  PIVOT_TEMPLATES,
  SHORTCUTS_TEMPLATE,
  STAT_TEMPLATES,
  usesPersonalData,
  withNewId,
} from "./templates";
import { canUsePersonalDimensions, WidgetEditorDialog } from "./widget-editor";
import { type BoardActions, BoardContext, type DragHandleProps } from "./widget-shell";

// D-062: Dashboard SA/HR yang bisa diatur — susun ulang (drag), ubah ukuran, tambah/hapus widget,
// grafik pivot bebas. Susunan disimpan per akun di DB (PUT /me/dashboard-layout, debounce).

const SPAN: Record<WidgetSize, string> = {
  sm: "col-span-1",
  md: "col-span-2",
  lg: "col-span-2 lg:col-span-4",
};
const SAVE_DELAY_MS = 600;

function WidgetView({
  widget,
  me,
  dragHandle,
}: {
  widget: DashboardWidget;
  me: Me;
  dragHandle?: DragHandleProps | undefined;
}) {
  if (widget.kind === "stat") return <StatWidgetCard widget={widget} dragHandle={dragHandle} />;
  if (widget.kind === "shortcuts")
    return <ShortcutsWidgetCard widget={widget} me={me} dragHandle={dragHandle} />;
  return <PivotWidgetCard widget={widget} dragHandle={dragHandle} />;
}

function SortableWidget({
  widget,
  me,
  editing,
}: {
  widget: DashboardWidget;
  me: Me;
  editing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !editing,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(SPAN[widget.size], "min-w-0", isDragging && "z-10 opacity-80")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <WidgetView widget={widget} me={me} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  );
}

function CatalogDialog({
  me,
  onPick,
  onCreate,
  onClose,
}: {
  me: Me;
  onPick: (widget: DashboardWidget) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const personal = canUsePersonalDimensions(me);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tambah widget</DialogTitle>
          <DialogDescription>
            Pilih template siap pakai atau buat grafik sendiri dari data karyawan.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={onCreate}
          className="border-brand/40 bg-brand-soft/40 hover:bg-brand-soft flex items-center gap-3 rounded-xl border border-dashed p-4 text-left transition-colors"
        >
          <span className="bg-brand text-brand-foreground flex size-10 items-center justify-center rounded-lg">
            <Sparkles className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Buat grafik sendiri</span>
            <span className="text-muted-foreground block text-xs">
              Pilih baris, kolom, filter, dan bentuk grafik seperti pivot table.
            </span>
          </span>
        </button>

        <section className="space-y-2">
          <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Template grafik
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {PIVOT_TEMPLATES.map((template) => {
              const locked = usesPersonalData(template) && !personal;
              const Icon = CHART_ICONS[template.chart];
              return (
                <button
                  key={template.id}
                  type="button"
                  disabled={locked}
                  onClick={() => onPick(template)}
                  className="hover:bg-accent flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon className="text-brand mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {template.title}
                      {locked && <Lock className="size-3" />}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {locked ? "Butuh grant baca data pribadi" : describePivot(template)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Statistik & pintasan
          </h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {STAT_TEMPLATES.map((stat) => (
              <button
                key={stat.id}
                type="button"
                onClick={() => onPick(stat)}
                className="hover:bg-accent rounded-lg border p-3 text-left text-sm transition-colors"
              >
                {STAT_METRIC_LABELS[stat.metric]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onPick(SHORTCUTS_TEMPLATE)}
              className="hover:bg-accent rounded-lg border p-3 text-left text-sm transition-colors"
            >
              Menu Cepat
            </button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <RotateCcw /> Reset
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3 p-4">
        <p className="text-sm">
          Kembalikan dashboard ke susunan bawaan? Widget buatan Anda akan hilang.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setOpen(false);
              onReset();
            }}
          >
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DashboardBoard({ me }: { me: Me }) {
  const layoutQuery = useDashboardLayout();
  const save = useSaveDashboardLayout();
  const [widgets, setWidgets] = useState<DashboardWidget[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [catalog, setCatalog] = useState(false);
  const [editor, setEditor] = useState<{
    widget: PivotWidget | ShortcutsWidget;
    isNew: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Susunan dari server dipakai sekali saat dimuat; setelahnya state lokal yang jadi sumber.
  useEffect(() => {
    if (widgets === null && layoutQuery.isSuccess) {
      setWidgets((layoutQuery.data.layout ?? DEFAULT_DASHBOARD_LAYOUT).widgets);
    }
    if (widgets === null && layoutQuery.isError) setWidgets(DEFAULT_DASHBOARD_LAYOUT.widgets);
  }, [widgets, layoutQuery.isSuccess, layoutQuery.isError, layoutQuery.data]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const persist = useCallback(
    (next: DashboardWidget[]) => {
      setWidgets(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        save.mutate(
          { version: DASHBOARD_LAYOUT_VERSION, widgets: next },
          { onError: () => toast.error("Gagal menyimpan susunan dashboard.") },
        );
      }, SAVE_DELAY_MS);
    },
    [save.mutate],
  );

  const actions = useMemo<BoardActions>(() => {
    const list = widgets ?? [];
    const ids = list.map((w) => w.id);
    return {
      editing,
      update: (widget) => persist(list.map((w) => (w.id === widget.id ? widget : w))),
      remove: (id) => {
        const removed = list.find((w) => w.id === id);
        persist(list.filter((w) => w.id !== id));
        if (removed) {
          toast("Widget dihapus", {
            action: { label: "Urungkan", onClick: () => persist(list) },
          });
        }
      },
      duplicate: (id) => {
        const index = list.findIndex((w) => w.id === id);
        const source = list[index];
        if (!source) return;
        const copy = withNewId(
          source.kind === "stat"
            ? source
            : { ...source, title: `${source.title} (salinan)`.slice(0, 80) },
          ids,
        );
        persist([...list.slice(0, index + 1), copy, ...list.slice(index + 1)]);
      },
      edit: (id) => {
        const widget = list.find((w) => w.id === id);
        if (widget && widget.kind !== "stat") setEditor({ widget, isNew: false });
      },
    };
  }, [widgets, editing, persist]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (widgets === null) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {["a", "b", "c", "d"].map((k) => (
          <Skeleton key={k} className="h-[104px] rounded-xl" />
        ))}
        <Skeleton className="col-span-2 h-[320px] rounded-xl" />
        <Skeleton className="col-span-2 h-[320px] rounded-xl" />
      </div>
    );
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = widgets.findIndex((w) => w.id === active.id);
    const to = widgets.findIndex((w) => w.id === over.id);
    persist(arrayMove(widgets, from, to));
  };

  const add = (widget: DashboardWidget) => {
    const placed = withNewId(
      widget,
      widgets.map((w) => w.id),
    );
    persist([...widgets, placed]);
    toast.success("Widget ditambahkan di bagian bawah dashboard.");
  };

  return (
    <BoardContext value={actions}>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <span
          className="text-muted-foreground mr-auto flex items-center gap-1.5 text-xs"
          aria-live="polite"
        >
          {save.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Menyimpan susunan…
            </>
          ) : editing ? (
            "Geser ⠿ untuk memindahkan, ⋯ untuk ukuran & hapus. Perubahan tersimpan otomatis."
          ) : null}
        </span>
        {editing && (
          <ResetButton
            onReset={() => {
              clearTimeout(timer.current);
              setWidgets(DEFAULT_DASHBOARD_LAYOUT.widgets);
              save.mutate(null, {
                onSuccess: () => toast.success("Dashboard dikembalikan ke susunan bawaan."),
                onError: () => toast.error("Gagal mereset dashboard."),
              });
            }}
          />
        )}
        <Button variant="outline" size="sm" onClick={() => setCatalog(true)}>
          <Plus /> Tambah widget
        </Button>
        <Button
          variant={editing ? "brand" : "outline"}
          size="sm"
          aria-pressed={editing}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? <Check /> : <LayoutGrid />}
          {editing ? "Selesai" : "Atur dashboard"}
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-flow-row-dense grid-cols-2 gap-4 lg:grid-cols-4">
            {widgets.map((widget) => (
              <SortableWidget key={widget.id} widget={widget} me={me} editing={editing} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {widgets.length === 0 && (
        <div className="text-muted-foreground rounded-2xl border border-dashed py-16 text-center text-sm">
          Dashboard kosong. Klik <b>Tambah widget</b> untuk mulai.
        </div>
      )}

      {catalog && (
        <CatalogDialog
          me={me}
          onClose={() => setCatalog(false)}
          onCreate={() => {
            setCatalog(false);
            setEditor({ widget: BLANK_PIVOT, isNew: true });
          }}
          onPick={(widget) => {
            setCatalog(false);
            // Menu Cepat dibuka di editor dulu (pilih menu); template grafik langsung ditambahkan.
            if (widget.kind === "shortcuts") setEditor({ widget, isNew: true });
            else add(widget);
          }}
        />
      )}

      {editor && (
        <WidgetEditorDialog
          initial={editor.widget}
          me={me}
          isNew={editor.isNew}
          onClose={() => setEditor(null)}
          onSave={(widget) => {
            if (editor.isNew) add(widget);
            else actions.update(widget);
            setEditor(null);
          }}
        />
      )}
    </BoardContext>
  );
}
