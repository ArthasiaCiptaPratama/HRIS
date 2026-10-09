import {
  type DashboardWidget,
  WIDGET_SIZE_LABELS,
  WIDGET_SIZES,
  type WidgetSize,
} from "@hris/shared";
import { Copy, GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { createContext, type ReactNode, use } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// D-062: bingkai bersama semua widget (judul, pegangan drag, menu ubah/duplikat/ukuran/hapus).

export interface BoardActions {
  editing: boolean;
  update: (widget: DashboardWidget) => void;
  edit: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
}

export const BoardContext = createContext<BoardActions | null>(null);

export function useBoard(): BoardActions {
  const board = use(BoardContext);
  if (!board) throw new Error("useBoard di luar BoardContext");
  return board;
}

/** Atribut & listener pegangan drag dari dnd-kit (diteruskan dari item sortable). */
export type DragHandleProps = Record<string, unknown>;

export function WidgetShell({
  widget,
  title,
  subtitle,
  toolbar,
  dragHandle,
  children,
  className,
}: {
  widget: DashboardWidget;
  title: ReactNode;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  dragHandle?: DragHandleProps | undefined;
  children: ReactNode;
  className?: string;
}) {
  const board = useBoard();
  return (
    <Card
      className={cn(
        "group/widget relative h-full gap-0 overflow-hidden py-0 transition-shadow",
        board.editing && "outline-2 outline-offset-2 outline-dashed outline-brand/40",
        className,
      )}
    >
      <div className="flex items-start gap-2 px-4 pt-4 pb-2">
        {board.editing && dragHandle && (
          <button
            type="button"
            aria-label="Geser widget"
            className="text-muted-foreground hover:text-foreground -ml-1 mt-0.5 cursor-grab touch-none rounded p-0.5 active:cursor-grabbing"
            {...dragHandle}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-muted-foreground truncate text-xs">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {toolbar}
          <WidgetMenu widget={widget} />
        </div>
      </div>
      <div className="min-w-0 flex-1 px-4 pb-4">{children}</div>
    </Card>
  );
}

function WidgetMenu({ widget }: { widget: DashboardWidget }) {
  const board = useBoard();
  const label = widget.kind === "stat" ? "statistik" : widget.title;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Menu widget ${label}`}
          className="text-muted-foreground size-7 opacity-70 group-hover/widget:opacity-100"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {widget.kind !== "stat" && (
          <DropdownMenuItem onSelect={() => board.edit(widget.id)}>
            <Pencil /> Ubah widget
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => board.duplicate(widget.id)}>
          <Copy /> Duplikat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Ukuran
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={widget.size}
          onValueChange={(size) => board.update({ ...widget, size: size as WidgetSize })}
        >
          {WIDGET_SIZES.map((size) => (
            <DropdownMenuRadioItem key={size} value={size}>
              {WIDGET_SIZE_LABELS[size]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => board.remove(widget.id)}>
          <Trash2 /> Hapus dari dashboard
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
