import "@xyflow/react/dist/style.css";
import { POSITION_LEVEL_LABELS, POSITION_LEVELS } from "@hris/shared";
import {
  Background,
  BackgroundVariant,
  type BuiltInEdge,
  type ColorMode,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  Info,
  LoaderCircle,
  Maximize,
  Minimize,
  Scan,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { OrgChart } from "../schemas";
import {
  ancestorsOf,
  type ChartLayout,
  collapseBelowDepth,
  descendantsOf,
  indexChart,
  layoutChart,
  type SearchHit,
  searchChart,
} from "./layout";
import {
  CorporateGroup,
  type CorporateGroupType,
  levelColor,
  PostNode,
  type PostNodeType,
} from "./post-node";

// D-051: kanvas bagan organisasi interaktif. Geser & zoom hanya di dalam kanvas; data selalu dari API
// (berubah otomatis saat jabatan/pos/karyawan berubah). Dimuat lazy hanya di halaman Struktur Organisasi.

const NODE_TYPES = { post: PostNode, corporate: CorporateGroup };
const INITIAL_DEPTH = 3;

type ChartNode = PostNodeType | CorporateGroupType;

const readColorMode = (): ColorMode =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";

function useColorMode(): ColorMode {
  const read = readColorMode;
  const [mode, setMode] = useState<ColorMode>(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setMode(readColorMode()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return mode;
}

export interface OrgChartCanvasProps {
  chart: OrgChart;
  onOpenPerson: (personId: string) => void;
}

export function OrgChartCanvas(props: OrgChartCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ chart, onOpenPerson }: OrgChartCanvasProps) {
  const flow = useReactFlow<ChartNode>();
  const colorMode = useColorMode();
  const wrapper = useRef<HTMLDivElement>(null);
  const index = useMemo(() => indexChart(chart), [chart]);
  // Tampilan awal ringkas sampai tingkat ke-3 (seperti halaman Direksi di dokumen kantor; cabang site
  // terbuka dengan klik). "Buka semua" menampilkan bagan utuh.
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    collapseBelowDepth(chart, index, INITIAL_DEPTH),
  );
  // Tata letak sinkron & ringan (pohon ~100 pos) → dihitung langsung dari data.
  const layout = useMemo<ChartLayout>(
    () => layoutChart(chart, index, collapsed),
    [chart, index, collapsed],
  );
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Fit pertama ditangani prop `fitView` React Flow (setelah node siap); berikutnya lewat efek di bawah.
  const fitted = useRef(true);

  // Ganti PT → kembali ke tampilan ringkas awal & pas ke layar.
  const companyId = chart.company.id;
  const initialCollapsed = useRef(companyId);
  useEffect(() => {
    if (initialCollapsed.current === companyId) return;
    initialCollapsed.current = companyId;
    setCollapsed(collapseBelowDepth(chart, index, INITIAL_DEPTH));
    setHighlight(null);
    fitted.current = false;
  }, [companyId, chart, index]);

  const toggle = useCallback((postId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }, []);

  const descendantCounts = useMemo(
    () => new Map(chart.posts.map((post) => [post.id, descendantsOf(index, post.id).length])),
    [chart, index],
  );

  const nodes = useMemo<ChartNode[]>(() => {
    const result: ChartNode[] = [];
    if (layout.corporate) {
      result.push({
        id: "corporate-group",
        type: "corporate",
        position: { x: layout.corporate.x, y: layout.corporate.y },
        data: { title: "Corporate Function · fungsi korporat grup" },
        style: { width: layout.corporate.width, height: layout.corporate.height },
        width: layout.corporate.width,
        height: layout.corporate.height,
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      });
    }
    for (const item of layout.nodes) {
      const holders = item.post.holders.map((h) => h.fullName).join(", ");
      const vacant = Math.max(item.post.headcount - item.post.holders.length, 0);
      result.push({
        id: item.post.id,
        type: "post",
        position: { x: item.x, y: item.y },
        width: item.width,
        height: item.height,
        draggable: false,
        // React Flow memberi pointer-events: none pada node yang tidak bisa dipilih/digeser/diklik;
        // tombol orang & lipat di dalam kartu harus tetap bisa diklik.
        style: { pointerEvents: "all" },
        ariaLabel: `${item.post.positionName}: ${holders || "tanpa pemegang"}${
          vacant > 0 ? `, ${vacant} slot kosong` : ""
        }`,
        data: {
          post: item.post,
          unitName: index.unitName.get(item.post.departmentId) ?? "",
          descendantCount: descendantCounts.get(item.post.id) ?? 0,
          collapsed: collapsed.has(item.post.id),
          highlighted: highlight === item.post.id,
          dimmed: false,
          onToggle: toggle,
          onOpenPerson,
        },
      });
    }
    return result;
  }, [layout, index, descendantCounts, collapsed, highlight, toggle, onOpenPerson]);

  const edges = useMemo<BuiltInEdge[]>(() => {
    const visible = new Set(layout.nodes.map((node) => node.post.id));
    const result: BuiltInEdge[] = [];
    for (const { post } of layout.nodes) {
      if (post.reportsToId && visible.has(post.reportsToId)) {
        result.push({
          id: `s-${post.id}`,
          source: post.reportsToId,
          target: post.id,
          type: "smoothstep",
          pathOptions: { borderRadius: 10 },
          style: { stroke: "var(--muted-foreground)", strokeOpacity: 0.55, strokeWidth: 1.4 },
          focusable: false,
        });
      }
      if (post.functionalReportsToId && visible.has(post.functionalReportsToId)) {
        result.push({
          id: `f-${post.id}`,
          source: post.functionalReportsToId,
          sourceHandle: "fn-out",
          target: post.id,
          targetHandle: "fn-in",
          type: "default",
          style: {
            stroke: "var(--org-functional)",
            strokeWidth: 1.4,
            strokeDasharray: "6 5",
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--org-functional)" },
          focusable: false,
        });
      }
    }
    return result;
  }, [layout]);

  // Pas ke layar setelah tata letak baru dirender (muat pertama, ganti PT, "Ringkas", "Buka semua").
  // Ukuran node sudah diberikan eksplisit (width/height), jadi tidak perlu menunggu pengukuran DOM.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `layout` sengaja jadi pemicu (tata letak baru)
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    const timer = setTimeout(
      () => void flow.fitView({ padding: 0.1, duration: 300, maxZoom: 1 }),
      50,
    );
    return () => clearTimeout(timer);
  }, [layout, flow]);

  // Fokus hasil pencarian setelah tata letak (cabang yang dibuka) selesai.
  useEffect(() => {
    if (!pendingFocus) return;
    const node = layout.nodes.find((item) => item.post.id === pendingFocus);
    if (!node) return;
    setPendingFocus(null);
    setHighlight(node.post.id);
    void flow.setCenter(node.x + node.width / 2, node.y + node.height / 2, {
      zoom: Math.max(flow.getZoom(), 1.05),
      duration: 600,
    });
  }, [pendingFocus, layout, flow]);

  const focusPost = useCallback(
    (postId: string) => {
      const ancestors = ancestorsOf(index, postId);
      setCollapsed((current) => {
        if (!ancestors.some((id) => current.has(id))) return current;
        const next = new Set(current);
        for (const id of ancestors) next.delete(id);
        return next;
      });
      setPendingFocus(postId);
    },
    [index],
  );

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapper.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapper.current?.requestFullscreen().catch(() => undefined);
  };

  const exportPng = async () => {
    const viewport = wrapper.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewport) return;
    setExporting(true);
    try {
      const bounds = getNodesBounds(flow.getNodes());
      const width = Math.min(Math.ceil(bounds.width + 160), 8000);
      const height = Math.min(Math.ceil(bounds.height + 160), 8000);
      const view = getViewportForBounds(bounds, width, height, 0.1, 2, 0.04);
      const background = getComputedStyle(document.documentElement)
        .getPropertyValue("--org-canvas")
        .trim();
      const url = await toPng(viewport, {
        backgroundColor: background || "#ffffff",
        width,
        height,
        pixelRatio: 2,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        },
      });
      const link = document.createElement("a");
      link.download = `bagan-organisasi-${chart.company.code}.png`;
      link.href = url;
      link.click();
    } catch {
      toast.error("Ekspor gambar gagal. Coba lagi.");
    } finally {
      setExporting(false);
    }
  };

  const allCollapsible = useMemo(
    () => chart.posts.filter((post) => (descendantCounts.get(post.id) ?? 0) > 0).length,
    [chart, descendantCounts],
  );

  return (
    <div
      ref={wrapper}
      className={cn(
        "relative overflow-hidden rounded-xl border",
        fullscreen
          ? "h-screen w-screen rounded-none border-0"
          : "h-[calc(100dvh-21rem)] min-h-[480px]",
      )}
      style={{ background: "var(--org-canvas)" }}
    >
      <ReactFlow<ChartNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        colorMode={colorMode}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.08}
        maxZoom={2}
        zoomOnDoubleClick={false}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
        aria-label={`Bagan organisasi ${chart.company.name}`}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          className="!hidden md:!block"
          pannable
          zoomable
          position="bottom-right"
          nodeColor={(node) =>
            node.type === "corporate"
              ? "transparent"
              : levelColor((node as PostNodeType).data.post.level)
          }
          maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
          ariaLabel="Peta kecil bagan"
        />
        <Panel position="top-left" className="!m-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
          <ChartSearch chart={chart} index={index} onPick={focusPost} />
          <div className="bg-card flex items-center gap-0.5 rounded-lg border p-0.5 shadow-xs">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Buka semua cabang"
              title="Buka semua cabang"
              onClick={() => {
                setCollapsed(new Set());
                fitted.current = false;
              }}
              disabled={collapsed.size === 0}
            >
              <ChevronsUpDown />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Ringkas: lipat cabang di bawah tingkat ke-3"
              title="Ringkas (lipat di bawah tingkat ke-3)"
              onClick={() => {
                setCollapsed(collapseBelowDepth(chart, index, INITIAL_DEPTH));
                fitted.current = false;
              }}
              disabled={allCollapsible === 0}
            >
              <ChevronsDownUp />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Pas ke layar"
              title="Pas ke layar"
              onClick={() => void flow.fitView({ padding: 0.12, duration: 400 })}
            >
              <Scan />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={fullscreen ? "Keluar layar penuh" : "Layar penuh"}
              title={fullscreen ? "Keluar layar penuh" : "Layar penuh"}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize /> : <Maximize />}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Unduh gambar PNG"
              title="Unduh gambar PNG"
              onClick={() => void exportPng()}
              disabled={exporting}
            >
              {exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
            </Button>
            <Legend />
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

function ChartSearch({
  chart,
  index,
  onPick,
}: {
  chart: OrgChart;
  index: ReturnType<typeof indexChart>;
  onPick: (postId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => searchChart(chart, index, query), [chart, index, query]);
  const pick = (hit: SearchHit) => {
    onPick(hit.postId);
    setOpen(false);
  };
  return (
    <div className="relative w-64 max-w-full">
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, hits.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter" && hits[active]) {
            event.preventDefault();
            pick(hits[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Cari nama atau jabatan…"
        aria-label="Cari di bagan"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="org-chart-search-results"
        aria-autocomplete="list"
        className="bg-card h-9 pr-8 pl-8 shadow-xs"
      />
      {query ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
          aria-label="Hapus pencarian"
          onClick={() => setQuery("")}
        >
          <X className="size-4" />
        </button>
      ) : null}
      {open && query.trim().length >= 2 ? (
        <div
          id="org-chart-search-results"
          role="listbox"
          aria-label="Hasil pencarian bagan"
          className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-10 mt-1 max-h-80 overflow-y-auto rounded-lg border p-1 shadow-lg"
        >
          {hits.length === 0 ? (
            <p className="text-muted-foreground px-2 py-2 text-sm">Tidak ada yang cocok.</p>
          ) : (
            hits.map((hit, i) => (
              <div
                key={`${hit.postId}-${hit.personId ?? "post"}`}
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1.5",
                  i === active ? "bg-accent" : "hover:bg-accent",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(hit);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <p className="truncate text-sm font-medium">{hit.label}</p>
                <p className="text-muted-foreground truncate text-xs">{hit.detail}</p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function Legend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="Keterangan bagan" title="Keterangan">
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-sm">
        <p className="mb-2 font-semibold">Keterangan</p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {POSITION_LEVELS.map((level) => (
            <li key={level} className="flex items-center gap-2 text-xs">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ background: levelColor(level) }}
              />
              {POSITION_LEVEL_LABELS[level]}
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1.5 border-t pt-3 text-xs">
          <p className="flex items-center gap-2">
            <svg width="28" height="8" aria-hidden>
              <title>Garis tegas</title>
              <line
                x1="0"
                y1="4"
                x2="28"
                y2="4"
                stroke="var(--muted-foreground)"
                strokeWidth="1.6"
              />
            </svg>
            Atasan langsung
          </p>
          <p className="flex items-center gap-2">
            <svg width="28" height="8" aria-hidden>
              <title>Garis putus-putus</title>
              <line
                x1="0"
                y1="4"
                x2="28"
                y2="4"
                stroke="var(--org-functional)"
                strokeWidth="1.6"
                strokeDasharray="5 4"
              />
            </svg>
            Atasan fungsional
          </p>
          <p className="flex items-center gap-2">
            <span
              className="h-3 w-7 rounded-sm border border-dashed"
              style={{ borderColor: "var(--org-vacant)" }}
            />
            Slot kosong (vacant)
          </p>
          <p className="text-muted-foreground pt-1">
            Gulir/cubit untuk zoom, seret untuk menggeser. Klik nama untuk membuka profil.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
