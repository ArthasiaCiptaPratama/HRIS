import { POSITION_LEVEL_LABELS, type PositionLevel } from "@hris/shared";
import { Handle, type Node, type NodeProps, NodeToolbar, Position } from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  GitBranchPlus,
  Network,
  Pencil,
  Plus,
  Spline,
  Trash2,
  UserRoundX,
} from "lucide-react";
import { type DragEvent, memo, useState } from "react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "../components/employee-avatar";
import type { OrgChartPost } from "../schemas";
import { MAX_VISIBLE_SLOTS, NODE_WIDTH, nodeHeight } from "./layout";

// D-051: kartu pos di kanvas. Aksen warna per level jabatan; slot kosong ditandai jelas ("Kosong").
// Tombol orang & tombol lipat diberi kelas `nodrag nopan` supaya klik tidak dianggap menggeser kanvas.
// ORG-D2 (mode edit): titik biru di 4 sisi saat hover (bawah = tambah bawahan, samping = pos setingkat,
// atas = seret ke kartu lain untuk ganti atasan), klik kartu = toolbar (jalur keyboard), avatar bisa
// diseret ke pos lain.

/** Jenis data seret avatar antarpos (HTML5 drag & drop, di luar mekanisme seret node React Flow). */
export const PERSON_DRAG_TYPE = "application/x-hris-employee";

export type PostEditAction = "add" | "parent" | "functional" | "edit" | "delete";

export interface PostEditProps {
  /** false = pos korporat untuk HR (hanya SA) — tampil tanpa kontrol edit. */
  canEdit: boolean;
  selected: boolean;
  /** Pos baru/berubah di draf. */
  touched: boolean;
  onAddChild: (postId: string) => void;
  onAddSibling: (postId: string, side: "left" | "right") => void;
  onAction: (postId: string, action: PostEditAction) => void;
  onDropPerson: (employeeId: string, postId: string) => void;
}

// ORG-D1: token warna per level (legenda bagan site ACP, index.css).
export const LEVEL_TOKEN: Record<PositionLevel, string> = {
  L7: "--org-l7",
  L6: "--org-l6",
  L5: "--org-l5",
  L4: "--org-l4",
  L3: "--org-l3",
  L2: "--org-l2",
  L1A: "--org-l1a",
  L1B: "--org-l1b",
  L0: "--org-l0",
};

export const levelColor = (level: PositionLevel | null) =>
  `var(${level ? LEVEL_TOKEN[level] : "--org-none"})`;

export interface PostNodeData extends Record<string, unknown> {
  post: OrgChartPost;
  unitName: string;
  /** Jumlah bawahan (garis tegas, semua tingkat); 0 = tanpa tombol lipat. */
  descendantCount: number;
  collapsed: boolean;
  highlighted: boolean;
  dimmed: boolean;
  onToggle: (postId: string) => void;
  onOpenPerson: (personId: string) => void;
  /** ORG-D4: zona pos (null = fungsi korporat grup). */
  zone?: "HO" | "SITE" | null;
  /** Ada hanya saat mode edit. */
  edit?: PostEditProps;
}

export type PostNodeType = Node<PostNodeData, "post">;

function PostNodeView({ data }: NodeProps<PostNodeType>) {
  const { post, unitName, descendantCount, collapsed, highlighted, dimmed } = data;
  const vacant = Math.max(post.headcount - post.holders.length, 0);
  const slots = Math.max(post.headcount, post.holders.length);
  const visibleHolders = post.holders.slice(0, MAX_VISIBLE_SLOTS);
  const visibleVacant = Math.min(vacant, Math.max(MAX_VISIBLE_SLOTS - visibleHolders.length, 0));
  const hiddenCount = slots - visibleHolders.length - visibleVacant;
  const color = levelColor(post.level);
  const edit = data.edit?.canEdit ? data.edit : undefined;
  const [dropping, setDropping] = useState(false);
  const acceptsPerson = (event: DragEvent) =>
    edit !== undefined && event.dataTransfer.types.includes(PERSON_DRAG_TYPE);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: kartu = target lepas avatar (seret mouse); jalur keyboard lewat toolbar Edit › pemegang
    <div
      className={cn(
        "group/post bg-card text-card-foreground relative flex flex-col rounded-xl border shadow-xs transition-[box-shadow,opacity]",
        highlighted && "ring-brand ring-offset-background shadow-md ring-2 ring-offset-2",
        dimmed && "opacity-35",
        edit?.selected && "ring-2 ring-sky-500",
        edit?.touched &&
          !edit.selected &&
          "outline-2 outline-offset-2 outline-sky-500/60 outline-dashed",
        dropping && "bg-sky-50 ring-2 ring-sky-500 dark:bg-sky-950",
        data.edit && !edit && "opacity-60",
      )}
      style={{ width: NODE_WIDTH, height: nodeHeight(post), borderTopColor: color }}
      onDragOver={(event) => {
        if (!acceptsPerson(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        setDropping(false);
        if (!edit || !acceptsPerson(event)) return;
        event.preventDefault();
        const employeeId = event.dataTransfer.getData(PERSON_DRAG_TYPE);
        if (employeeId) edit.onDropPerson(employeeId, post.id);
      }}
    >
      {edit ? <EditControls postId={post.id} edit={edit} label={post.positionName} /> : null}
      <Handle type="target" position={Position.Top} className="!border-0 !bg-transparent" />
      <Handle
        id="fn-in"
        type="target"
        position={Position.Left}
        className="!border-0 !bg-transparent"
      />
      <span
        aria-hidden
        className="h-1.5 w-full shrink-0 rounded-t-xl"
        style={{ background: color }}
      />
      <div
        className="flex min-h-0 items-start gap-2 px-3 pt-2 pb-1"
        style={{ background: `color-mix(in oklch, ${color} 10%, transparent)` }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-tight font-semibold" title={post.positionName}>
            {post.positionName}
          </p>
          <p className="text-muted-foreground mt-0.5 truncate text-[11px]" title={unitName}>
            {post.level ? `${POSITION_LEVEL_LABELS[post.level]} · ` : ""}
            {unitName}
          </p>
        </div>
        {data.zone ? (
          <span
            className={cn(
              "shrink-0 rounded-sm px-1 py-0.5 text-[10px] leading-none font-semibold",
              data.zone === "SITE"
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                : "bg-slate-500/15 text-slate-700 dark:text-slate-300",
            )}
            title={data.zone === "SITE" ? "Site" : "Head Office"}
          >
            {data.zone === "SITE" ? "Site" : "HO"}
          </span>
        ) : null}
        {post.headcount > 1 ? (
          <span
            className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
            title={`${post.holders.length} dari ${post.headcount} slot terisi`}
          >
            {post.holders.length}/{post.headcount}
          </span>
        ) : null}
      </div>
      <ul className="mt-1 flex flex-col gap-0.5 px-1.5">
        {visibleHolders.map((holder) => (
          <li
            key={holder.id}
            draggable={edit !== undefined}
            onDragStart={(event) => {
              event.dataTransfer.setData(PERSON_DRAG_TYPE, holder.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            className={cn(edit && "nodrag cursor-grab")}
          >
            <button
              type="button"
              className="nodrag nopan hover:bg-accent focus-visible:ring-ring flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left outline-none focus-visible:ring-2"
              onClick={(event) => {
                event.stopPropagation();
                data.onOpenPerson(holder.id);
              }}
              aria-label={`Buka profil ${holder.fullName} (${post.positionName})`}
            >
              <EmployeeAvatar name={holder.fullName} photoUrl={holder.photoUrl} size="sm" />
              <span className="truncate text-[12.5px]">{holder.fullName}</span>
            </button>
          </li>
        ))}
        {Array.from({ length: visibleVacant }, (_, slot) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: slot kosong tidak punya identitas lain
            key={`vacant-${slot}`}
            className="flex h-8 items-center gap-2 rounded-md border border-dashed px-1.5"
            style={{ borderColor: "color-mix(in oklch, var(--org-vacant) 45%, transparent)" }}
          >
            <span
              className="grid size-6 place-items-center rounded-full"
              style={{
                background: "color-mix(in oklch, var(--org-vacant) 12%, transparent)",
                color: "var(--org-vacant)",
              }}
            >
              <UserRoundX className="size-3.5" aria-hidden />
            </span>
            <span className="text-[12px] font-medium" style={{ color: "var(--org-vacant)" }}>
              Kosong
            </span>
          </li>
        ))}
        {hiddenCount > 0 ? (
          <li className="text-muted-foreground flex h-8 items-center px-2 text-[11.5px]">
            +{hiddenCount} lainnya
            {vacant > visibleVacant ? ` (${vacant - visibleVacant} kosong)` : ""}
          </li>
        ) : null}
      </ul>
      {descendantCount > 0 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onToggle(post.id);
          }}
          className="nodrag nopan bg-card hover:bg-accent focus-visible:ring-ring text-muted-foreground absolute -bottom-0 left-1/2 flex h-5 -translate-x-1/2 items-center gap-0.5 rounded-t-md border border-b-0 px-1.5 text-[10px] font-medium outline-none focus-visible:ring-2"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Buka" : "Lipat"} ${descendantCount} pos di bawah ${post.positionName}`}
        >
          {collapsed ? (
            <ChevronRight className="size-3" aria-hidden />
          ) : (
            <ChevronDown className="size-3" aria-hidden />
          )}
          {descendantCount}
        </button>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!border-0 !bg-transparent" />
      <Handle
        id="fn-out"
        type="source"
        position={Position.Right}
        className="!border-0 !bg-transparent"
      />
    </div>
  );
}

export const PostNode = memo(PostNodeView);

const DOT =
  "nodrag nopan absolute z-10 grid place-items-center rounded-full bg-sky-500 text-white opacity-0 shadow ring-2 ring-white transition-opacity group-hover/post:opacity-100 focus-visible:opacity-100 dark:ring-neutral-900";

function EditControls({
  postId,
  edit,
  label,
}: {
  postId: string;
  edit: PostEditProps;
  label: string;
}) {
  return (
    <>
      {/* Atas: seret titik ke kartu lain = ganti atasan (garis koneksi React Flow). */}
      <Handle
        id="reparent"
        type="source"
        position={Position.Top}
        isConnectable
        title="Seret ke kartu lain untuk mengganti atasan"
        className={cn(
          "!size-3.5 !-translate-y-1/2 !border-2 !border-white !bg-sky-500 !opacity-0 transition-opacity group-hover/post:!opacity-100 dark:!border-neutral-900",
          edit.selected && "!opacity-100",
        )}
      />
      <button
        type="button"
        className={cn(DOT, "-bottom-9 left-1/2 size-6 -translate-x-1/2")}
        aria-label={`Tambah bawahan ${label}`}
        title="Tambah bawahan"
        onClick={(event) => {
          event.stopPropagation();
          edit.onAddChild(postId);
        }}
      >
        <Plus className="size-3.5" />
      </button>
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          className={cn(
            DOT,
            "top-1/2 size-5 -translate-y-1/2",
            side === "left" ? "-left-2.5" : "-right-2.5",
          )}
          aria-label={`Tambah pos setingkat di ${side === "left" ? "kiri" : "kanan"} ${label}`}
          title="Tambah pos setingkat (atasan sama)"
          onClick={(event) => {
            event.stopPropagation();
            edit.onAddSibling(postId, side);
          }}
        >
          <Plus className="size-3" />
        </button>
      ))}
      <NodeToolbar isVisible={edit.selected} position={Position.Top} offset={14}>
        <div
          role="toolbar"
          aria-label={`Aksi pos ${label}`}
          className="bg-popover text-popover-foreground flex items-center gap-0.5 rounded-lg border p-1 shadow-md"
        >
          {(
            [
              ["add", "Tambah bawahan", GitBranchPlus],
              ["parent", "Ubah atasan", Network],
              ["functional", "Atasan fungsional", Spline],
              ["edit", "Edit", Pencil],
              ["delete", "Hapus", Trash2],
            ] as const
          ).map(([action, text, Icon]) => (
            <button
              key={action}
              type="button"
              className={cn(
                "hover:bg-accent focus-visible:ring-ring flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none focus-visible:ring-2",
                action === "delete" && "text-destructive",
              )}
              onClick={() => edit.onAction(postId, action)}
            >
              <Icon className="size-3.5" aria-hidden />
              {text}
            </button>
          ))}
        </div>
      </NodeToolbar>
    </>
  );
}

export interface CorporateGroupData extends Record<string, unknown> {
  title: string;
}
export type CorporateGroupType = Node<CorporateGroupData, "corporate">;

function CorporateGroupView({ data }: NodeProps<CorporateGroupType>) {
  return (
    <div className="bg-muted/50 border-border h-full w-full rounded-2xl border-2 border-dashed">
      <p className="text-muted-foreground px-5 pt-4 text-xs font-semibold tracking-wide uppercase">
        {data.title}
      </p>
    </div>
  );
}

export const CorporateGroup = memo(CorporateGroupView);
