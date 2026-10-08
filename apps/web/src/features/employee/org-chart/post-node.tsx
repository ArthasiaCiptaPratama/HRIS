import { POSITION_LEVEL_LABELS, type PositionLevel } from "@hris/shared";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { ChevronDown, ChevronRight, UserRoundX } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "../components/employee-avatar";
import type { OrgChartPost } from "../schemas";
import { MAX_VISIBLE_SLOTS, NODE_WIDTH, nodeHeight } from "./layout";

// D-051: kartu pos di kanvas. Aksen warna per level jabatan; slot kosong ditandai jelas ("Kosong").
// Tombol orang & tombol lipat diberi kelas `nodrag nopan` supaya klik tidak dianggap menggeser kanvas.

export const LEVEL_TOKEN: Record<PositionLevel, string> = {
  DIRECTOR: "--org-director",
  GENERAL_MANAGER: "--org-gm",
  MANAGER: "--org-manager",
  SUPERINTENDENT: "--org-superintendent",
  SUPERVISOR: "--org-supervisor",
  FOREMAN: "--org-foreman",
  STAFF: "--org-staff",
  NON_STAFF: "--org-crew",
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

  return (
    <div
      className={cn(
        "bg-card text-card-foreground relative flex flex-col overflow-hidden rounded-xl border shadow-xs transition-[box-shadow,opacity]",
        highlighted && "ring-brand ring-offset-background shadow-md ring-2 ring-offset-2",
        dimmed && "opacity-35",
      )}
      style={{ width: NODE_WIDTH, height: nodeHeight(post), borderTopColor: color }}
    >
      <Handle type="target" position={Position.Top} className="!border-0 !bg-transparent" />
      <Handle
        id="fn-in"
        type="target"
        position={Position.Left}
        className="!border-0 !bg-transparent"
      />
      <span aria-hidden className="h-1.5 w-full shrink-0" style={{ background: color }} />
      <div className="flex min-h-0 items-start gap-2 px-3 pt-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-tight font-semibold" title={post.positionName}>
            {post.positionName}
          </p>
          <p className="text-muted-foreground mt-0.5 truncate text-[11px]" title={unitName}>
            {post.level ? `${POSITION_LEVEL_LABELS[post.level]} · ` : ""}
            {unitName}
          </p>
        </div>
        {post.headcount > 1 ? (
          <span
            className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
            title={`${post.holders.length} dari ${post.headcount} slot terisi`}
          >
            {post.holders.length}/{post.headcount}
          </span>
        ) : null}
      </div>
      <ul className="mt-1.5 flex flex-col gap-0.5 px-1.5">
        {visibleHolders.map((holder) => (
          <li key={holder.id}>
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
