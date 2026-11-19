import { observeElementRect, useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Lock } from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { parseClipboardGrid } from "./clipboard";

// Paket B (IMP-D6): grid spreadsheet untuk Pratinjau import. Headless & tanpa data sendiri — induk memberi
// baris/sel siap tampil dan menerima perubahan lewat onChange. Virtualisasi baris + kolom (TanStack
// Virtual), kolom pertama beku, header menempel. Keyboard: panah/Tab pindah, Enter/F2/ketik huruf ubah,
// Esc batal, Delete kosongkan, Ctrl+Z batal (50 langkah), Ctrl+C salin sel, Ctrl+V tempel blok TSV.
// Spike B0: QA/2026-11-19-import-ux/spike-b0/HASIL-SPIKE-B0.md.

export type SheetOption = { value: string; label: string; hint?: string };

export type SheetColumn = {
  key: string;
  label: string;
  width: number;
  /** text = ketik bebas · select = pilih dari daftar · readonly = hanya tampil. */
  kind: "text" | "select" | "readonly";
  /** 🔒 kolom yang tidak tersimpan untuk akun ini (abu-abu, tidak bisa diubah/ditempel). */
  locked?: boolean;
  /** Keterangan judul kolom (tooltip). */
  hint?: string;
  /** Pilihan per baris (kind select). */
  options?: (row: number) => SheetOption[];
  /** select: teks yang tidak ada di daftar tetap boleh (mis. Jenis kelamin "L"). */
  allowFree?: boolean;
};

export type SheetCell = {
  text: string;
  /** Nilai untuk editor (bawaan = text); select = value pilihan. */
  value?: string;
  /** Pesan kesalahan → sel merah, aria-invalid, tooltip. */
  error?: string;
  /** Diubah di layar (titik biru). */
  edited?: boolean;
  /** Nilai turunan/bawaan (bukan dari file) → abu-abu. */
  muted?: boolean;
  /** Sel ini tidak bisa diubah di baris ini. */
  disabled?: boolean;
  /** Kolom Hasil: warna lencana. */
  tone?: "success" | "neutral" | "muted" | "danger";
};

export type SheetRowData = { key: string; label: string; cells: Record<string, SheetCell> };
export type SheetChange = { row: number; column: string; value: string };

const ROW_H = 34;
const HEAD_H = 36;
// jsdom / elemen tersembunyi tidak punya ukuran → anggap layar sedang supaya baris tetap dirender.
const FALLBACK_RECT = { width: 1200, height: 560 };
const observeRect = <T extends Element>(
  instance: Virtualizer<T, Element>,
  cb: (rect: { width: number; height: number }) => void,
) => observeElementRect(instance, (rect) => cb(rect.width && rect.height ? rect : FALLBACK_RECT));

type Pos = { r: number; c: number };
type Edit = Pos & { value: string; query: string };

const TONE: Record<NonNullable<SheetCell["tone"]>, string> = {
  success: "bg-success-soft text-success-soft-foreground",
  neutral: "bg-secondary text-secondary-foreground",
  muted: "bg-muted text-muted-foreground",
  danger: "bg-destructive/10 text-destructive",
};

const Cell = memo(function Cell({
  id,
  cell,
  column,
  colIndex,
  left,
  active,
  frozen,
}: {
  id: string;
  cell: SheetCell | undefined;
  column: SheetColumn;
  colIndex: number;
  left: number;
  active: boolean;
  frozen: boolean;
}) {
  const text = cell?.text ?? "";
  const readOnly = column.locked || column.kind === "readonly" || cell?.disabled;
  return (
    // biome-ignore lint/a11y/useSemanticElements: grid tervirtualisasi (posisi absolut) tidak bisa memakai <table>
    <div
      id={id}
      role="gridcell"
      tabIndex={-1}
      aria-colindex={colIndex + 1}
      aria-selected={active}
      aria-invalid={cell?.error ? true : undefined}
      aria-readonly={readOnly || undefined}
      data-col={colIndex}
      title={cell?.error}
      className={cn(
        "absolute top-0 flex items-center gap-1 overflow-hidden border-r border-b px-2 whitespace-nowrap",
        frozen ? "bg-card sticky left-0 z-10 font-medium" : "bg-card",
        column.locked && "bg-muted text-muted-foreground",
        cell?.muted && "text-muted-foreground",
        cell?.error && "bg-destructive/10 text-destructive",
        active && "ring-brand z-20 ring-2 ring-inset",
      )}
      style={{ width: column.width, height: ROW_H, left: frozen ? undefined : left }}
    >
      {cell?.tone ? (
        <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", TONE[cell.tone])}>
          {text}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{text}</span>
      )}
      {cell?.edited ? (
        <span className="bg-brand size-1.5 shrink-0 rounded-full" role="img" aria-label="diubah" />
      ) : null}
      {column.kind === "select" && !readOnly ? (
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      ) : null}
    </div>
  );
});

function Editor({
  column,
  rowIndex,
  rowLabel,
  edit,
  left,
  frozen,
  onChange,
  onCommit,
  onCancel,
}: {
  column: SheetColumn;
  rowIndex: number;
  rowLabel: string;
  edit: Edit;
  left: number;
  frozen: boolean;
  onChange: (patch: Partial<Edit>) => void;
  onCommit: (value: string, move: "down" | "right" | "left" | "none") => void;
  onCancel: () => void;
}) {
  const isSelect = column.kind === "select";
  const options = useMemo(
    () => (isSelect ? (column.options?.(rowIndex) ?? []) : []),
    [isSelect, column, rowIndex],
  );
  const q = edit.query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const [hi, setHi] = useState(() =>
    Math.max(
      0,
      shown.findIndex((o) => o.value === edit.value),
    ),
  );
  const listId = useId();
  const pick = (move: "down" | "right" | "left" | "none") => {
    if (!isSelect) return onCommit(edit.query, move);
    const option = shown[hi];
    if (option) return onCommit(option.value, move);
    if (column.allowFree) return onCommit(edit.query, move);
    onCancel();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      pick("down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      pick(e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (isSelect && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setHi((h) => Math.max(0, Math.min(shown.length - 1, h + (e.key === "ArrowDown" ? 1 : -1))));
    }
  };
  return (
    <div
      className={cn("absolute top-0 z-30", frozen && "sticky left-0")}
      style={{ width: Math.max(column.width, isSelect ? 240 : 0), left: frozen ? undefined : left }}
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: editor sel spreadsheet dibuka atas perintah pengguna
        autoFocus
        aria-label={`${column.label} baris ${rowLabel}`}
        {...(isSelect
          ? {
              role: "combobox",
              "aria-expanded": true,
              "aria-controls": listId,
              "aria-autocomplete": "list" as const,
            }
          : {})}
        value={edit.query}
        onChange={(e) => {
          onChange({ query: e.target.value });
          setHi(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => (isSelect ? onCancel() : onCommit(edit.query, "none"))}
        placeholder={isSelect ? "Ketik untuk mencari…" : undefined}
        className="bg-background ring-brand h-[34px] w-full px-2 text-sm ring-2 outline-none"
        style={{ width: column.width }}
      />
      {isSelect ? (
        <div
          id={listId}
          role="listbox"
          aria-label={`Pilihan ${column.label}`}
          className="bg-popover text-popover-foreground mt-1 max-h-64 overflow-auto rounded-md border p-1 shadow-md"
        >
          {shown.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1.5 text-sm">
              {column.allowFree ? "Tekan Enter untuk memakai teks ini" : "Tidak ada pilihan"}
            </p>
          ) : (
            shown.map((o, i) => (
              <div
                key={o.value}
                role="option"
                aria-selected={i === hi}
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onCommit(o.value, "none");
                }}
                onMouseEnter={() => setHi(i)}
                className={cn(
                  "flex cursor-pointer items-baseline justify-between gap-3 rounded-sm px-2 py-1.5 text-sm",
                  i === hi && "bg-accent text-accent-foreground",
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.hint ? (
                  <span className="text-muted-foreground shrink-0 truncate text-xs">{o.hint}</span>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

const RowView = memo(function RowView({
  gridId,
  row,
  rowIndex,
  top,
  columns,
  virtualCols,
  frozenWidth,
  activeCol,
  edit,
  onEditChange,
  onEditCommit,
  onEditCancel,
}: {
  gridId: string;
  row: SheetRowData;
  rowIndex: number;
  top: number;
  columns: SheetColumn[];
  virtualCols: { index: number; start: number }[];
  frozenWidth: number;
  activeCol: number;
  edit: Edit | null;
  onEditChange: (patch: Partial<Edit>) => void;
  onEditCommit: (value: string, move: "down" | "right" | "left" | "none") => void;
  onEditCancel: () => void;
}) {
  const render = (c: number, left: number) => {
    const column = columns[c] as SheetColumn;
    const frozen = c === 0;
    if (edit && edit.c === c)
      return (
        <Editor
          key={`e${c}`}
          column={column}
          rowIndex={rowIndex}
          rowLabel={row.label}
          edit={edit}
          left={left}
          frozen={frozen}
          onChange={onEditChange}
          onCommit={onEditCommit}
          onCancel={onEditCancel}
        />
      );
    return (
      <Cell
        key={c}
        id={`${gridId}-${rowIndex}-${c}`}
        cell={row.cells[column.key]}
        column={column}
        colIndex={c}
        left={left}
        active={activeCol === c}
        frozen={frozen}
      />
    );
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: grid tervirtualisasi (posisi absolut) tidak bisa memakai <table>
    <div
      role="row"
      tabIndex={-1}
      aria-rowindex={rowIndex + 2}
      data-row={rowIndex}
      className="absolute left-0 w-full"
      style={{ top, height: ROW_H }}
    >
      {render(0, 0)}
      {virtualCols.map((vc) => render(vc.index + 1, frozenWidth + vc.start))}
    </div>
  );
});

export function SheetGrid({
  label,
  columns,
  rows,
  onChange,
  onActiveChange,
  jumpTo,
  className,
}: {
  label: string;
  columns: SheetColumn[];
  rows: SheetRowData[];
  onChange: (changes: SheetChange[], source: "edit" | "paste" | "clear" | "undo") => void;
  onActiveChange?: (row: number, column: string) => void;
  /** Lompat ke sel (nonce berubah setiap permintaan). */
  jumpTo?: { row: number; column: string; nonce: number } | null;
  className?: string;
}) {
  const gridId = useId().replace(/:/g, "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Pos>({ r: 0, c: 0 });
  const [edit, setEdit] = useState<Edit | null>(null);
  const [notice, setNotice] = useState("");
  const undo = useRef<SheetChange[][]>([]);
  const frozenWidth = columns[0]?.width ?? 200;

  const rowV = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 6,
    initialRect: FALLBACK_RECT,
    observeElementRect: observeRect,
    scrollPaddingStart: HEAD_H,
  });
  const colV = useVirtualizer({
    horizontal: true,
    count: Math.max(0, columns.length - 1),
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => columns[i + 1]?.width ?? 120,
    overscan: 2,
    initialRect: FALLBACK_RECT,
    observeElementRect: observeRect,
    // Sel aktif tidak boleh tertutup kolom beku saat digulir ke dalam pandangan.
    scrollPaddingStart: frozenWidth,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: lebar kolom berubah → ukur ulang
  useEffect(() => colV.measure(), [columns]);

  const colItems = colV.getVirtualItems();
  const colKey = colItems.map((v) => `${v.index}:${v.start}`).join(",");
  // Identitas stabil selama kolom terlihat sama → baris (memo) tidak dirender ulang saat mengetik.
  // biome-ignore lint/correctness/useExhaustiveDependencies: colKey mewakili colItems
  const virtualCols = useMemo(
    () => colItems.map((v) => ({ index: v.index, start: v.start })),
    [colKey],
  );

  const clampRow = (r: number) => Math.max(0, Math.min(rows.length - 1, r));
  const clampCol = (c: number) => Math.max(0, Math.min(columns.length - 1, c));
  const focusGrid = () => scrollRef.current?.focus({ preventScroll: true });
  const activate = (r: number, c: number, scroll = true) => {
    const nr = clampRow(r);
    const nc = clampCol(c);
    setActive({ r: nr, c: nc });
    if (scroll) {
      rowV.scrollToIndex(nr);
      if (nc > 0) colV.scrollToIndex(nc - 1);
    }
    const key = columns[nc]?.key;
    if (key && rows.length > 0) onActiveChange?.(nr, key);
  };

  // Daftar baris berubah (filter) → sel aktif tetap di dalam tabel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya saat jumlah baris/kolom berubah
  useEffect(() => {
    if (active.r >= rows.length || active.c >= columns.length)
      activate(Math.min(active.r, rows.length - 1), Math.min(active.c, columns.length - 1), false);
    else if (rows.length > 0) onActiveChange?.(active.r, columns[active.c]?.key ?? "");
  }, [rows.length, columns.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dipicu nonce
  useEffect(() => {
    if (!jumpTo) return;
    const c = columns.findIndex((col) => col.key === jumpTo.column);
    activate(jumpTo.row, c < 0 ? 0 : c);
    focusGrid();
  }, [jumpTo?.nonce]);

  const editable = (r: number, c: number) => {
    const column = columns[c];
    const cell = column ? rows[r]?.cells[column.key] : undefined;
    return Boolean(column && column.kind !== "readonly" && !column.locked && !cell?.disabled);
  };
  const cellValue = (r: number, c: number) => {
    const column = columns[c];
    const cell = column ? rows[r]?.cells[column.key] : undefined;
    return cell?.value ?? cell?.text ?? "";
  };

  const emit = (changes: SheetChange[], source: "edit" | "paste" | "clear") => {
    const real = changes.filter((ch) => {
      const c = columns.findIndex((col) => col.key === ch.column);
      return cellValue(ch.row, c) !== ch.value;
    });
    if (real.length === 0) return;
    undo.current.push(
      real.map((ch) => ({
        ...ch,
        value: cellValue(
          ch.row,
          columns.findIndex((col) => col.key === ch.column),
        ),
      })),
    );
    if (undo.current.length > 50) undo.current.shift();
    onChange(real, source);
  };

  const startEdit = (r: number, c: number, typed?: string) => {
    if (!editable(r, c)) {
      const column = columns[c];
      if (column?.locked) setNotice(`${column.label} tidak tersimpan untuk akun Anda.`);
      return;
    }
    const value = cellValue(r, c);
    const select = columns[c]?.kind === "select";
    const text = rows[r]?.cells[columns[c]?.key ?? ""]?.text ?? "";
    setEdit({ r, c, value, query: typed ?? (select ? "" : text) });
  };

  // Editor yang sedang terbuka (ref supaya commit lewat Enter lalu blur tidak tercatat dua kali).
  const editRef = useRef<Edit | null>(null);
  editRef.current = edit;
  const commitEdit = (value: string, move: "down" | "right" | "left" | "none") => {
    const current = editRef.current;
    if (!current) return;
    editRef.current = null;
    const column = columns[current.c];
    if (column) emit([{ row: current.r, column: column.key, value }], "edit");
    setEdit(null);
    focusGrid();
    if (move === "down") activate(current.r + 1, current.c);
    else if (move === "right") activate(current.r, current.c + 1);
    else if (move === "left") activate(current.r, current.c - 1);
  };
  const cancelEdit = () => {
    if (!editRef.current) return;
    editRef.current = null;
    setEdit(null);
    focusGrid();
  };
  // Callback stabil untuk baris (memo): memanggil versi terbaru lewat ref.
  const handlers = useRef({ commitEdit, cancelEdit });
  handlers.current = { commitEdit, cancelEdit };
  const stable = useMemo(
    () => ({
      commit: (value: string, move: "down" | "right" | "left" | "none") =>
        handlers.current.commitEdit(value, move),
      cancel: () => handlers.current.cancelEdit(),
      change: (patch: Partial<Edit>) => setEdit((cur) => (cur ? { ...cur, ...patch } : cur)),
    }),
    [],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (edit || rows.length === 0) return;
    const { r, c } = active;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "z") {
      e.preventDefault();
      const last = undo.current.pop();
      if (last) onChange(last, "undo");
      return;
    }
    if (ctrl || e.altKey) return; // Ctrl+C / Ctrl+V lewat event clipboard
    const nav: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Home: [0, -c],
      End: [0, columns.length],
      PageDown: [15, 0],
      PageUp: [-15, 0],
    };
    const d = nav[e.key];
    if (d) {
      e.preventDefault();
      activate(r + d[0], c + d[1]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      activate(r, c + (e.shiftKey ? -1 : 1));
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startEdit(r, c);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const column = columns[c];
      if (column && editable(r, c)) emit([{ row: r, column: column.key, value: "" }], "clear");
    } else if (e.key.length === 1) {
      e.preventDefault();
      startEdit(r, c, e.key);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (edit) return;
    e.preventDefault();
    const block = parseClipboardGrid(e.clipboardData.getData("text/plain"));
    const changes: SheetChange[] = [];
    let skipped = 0;
    block.forEach((line, dr) => {
      line.forEach((text, dc) => {
        const r = active.r + dr;
        const c = active.c + dc;
        const column = columns[c];
        if (!column || r >= rows.length || !editable(r, c)) {
          skipped++;
          return;
        }
        if (column.kind === "select") {
          const wanted = text.trim().toLowerCase();
          const option = column.options?.(r).find((o) => o.label.toLowerCase() === wanted);
          if (option) changes.push({ row: r, column: column.key, value: option.value });
          else if (column.allowFree || wanted === "")
            changes.push({ row: r, column: column.key, value: text });
          else skipped++;
          return;
        }
        changes.push({ row: r, column: column.key, value: text });
      });
    });
    emit(changes, "paste");
    setNotice(
      `${changes.length} sel ditempel${skipped > 0 ? `, ${skipped} dilewati (terkunci atau di luar tabel)` : ""}.`,
    );
  };

  const onCopy = (e: ClipboardEvent<HTMLDivElement>) => {
    if (edit) return;
    e.preventDefault();
    const column = columns[active.c];
    e.clipboardData.setData(
      "text/plain",
      column && !column.locked ? (rows[active.r]?.cells[column.key]?.text ?? "") : "",
    );
  };

  const cellFromEvent = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const rowEl = target.closest<HTMLElement>("[data-row]");
    const cellEl = target.closest<HTMLElement>("[data-col]");
    if (!rowEl || !cellEl) return null;
    return { r: Number(rowEl.dataset.row), c: Number(cellEl.dataset.col) };
  };

  const totalWidth = frozenWidth + colV.getTotalSize();
  const activeId = rows.length > 0 ? `${gridId}-${active.r}-${active.c}` : undefined;
  return (
    <div className={cn("space-y-1", className)}>
      {/* biome-ignore lint/a11y/useSemanticElements: grid tervirtualisasi (posisi absolut) tidak bisa memakai <table> */}
      <div
        ref={scrollRef}
        role="grid"
        aria-label={label}
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length}
        aria-activedescendant={edit ? undefined : activeId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onCopy={onCopy}
        onMouseDown={(e) => {
          // Fokus tetap di grid (pola aria-activedescendant); input editor & daftar pilihan dibiarkan.
          if (!(e.target as HTMLElement).closest("input,[role=listbox]")) {
            e.preventDefault();
            focusGrid();
          }
          const pos = cellFromEvent(e);
          if (!pos || (edit && edit.r === pos.r && edit.c === pos.c)) return;
          activate(pos.r, pos.c, false);
          // Panah ▾ di sel pilihan langsung membuka daftar.
          if ((e.target as HTMLElement).closest("svg") && columns[pos.c]?.kind === "select")
            startEdit(pos.r, pos.c);
        }}
        onDoubleClick={(e) => {
          const pos = cellFromEvent(e);
          if (pos) startEdit(pos.r, pos.c);
        }}
        className="bg-card focus-visible:ring-ring/50 relative h-[min(60vh,560px)] min-h-72 overflow-auto rounded-xl border text-sm outline-none focus-visible:ring-[3px]"
      >
        <div
          className="relative"
          style={{ width: totalWidth, height: HEAD_H + rowV.getTotalSize() }}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: grid tervirtualisasi (posisi absolut) tidak bisa memakai <table> */}
          <div
            role="row"
            tabIndex={-1}
            aria-rowindex={1}
            className="bg-muted sticky top-0 z-40 text-xs font-medium"
            style={{ height: HEAD_H, width: totalWidth }}
          >
            {[0, ...virtualCols.map((vc) => vc.index + 1)].map((c) => {
              const column = columns[c] as SheetColumn | undefined;
              if (!column) return null;
              const frozen = c === 0;
              const left = frozen
                ? 0
                : frozenWidth + (virtualCols.find((v) => v.index === c - 1)?.start ?? 0);
              return (
                // biome-ignore lint/a11y/useSemanticElements: grid tervirtualisasi (posisi absolut) tidak bisa memakai <table>
                <div
                  key={c}
                  role="columnheader"
                  tabIndex={-1}
                  aria-colindex={c + 1}
                  title={column.hint}
                  className={cn(
                    "bg-muted top-0 flex items-center gap-1 border-r border-b px-2 whitespace-nowrap",
                    frozen ? "sticky left-0 z-10" : "absolute",
                  )}
                  style={{ width: column.width, height: HEAD_H, left: frozen ? undefined : left }}
                >
                  <span className="truncate">{column.label}</span>
                  {column.locked ? (
                    <Lock className="size-3 shrink-0" aria-label="terkunci" />
                  ) : null}
                </div>
              );
            })}
          </div>
          {rowV.getVirtualItems().map((vr, slot) => {
            const row = rows[vr.index] as SheetRowData;
            return (
              <RowView
                // Kunci per slot: DOM baris dipakai ulang saat menggulir jauh (spike B0).
                // biome-ignore lint/suspicious/noArrayIndexKey: sengaja per slot virtual, bukan per data
                key={slot}
                gridId={gridId}
                row={row}
                rowIndex={vr.index}
                top={HEAD_H + vr.start}
                columns={columns}
                virtualCols={virtualCols}
                frozenWidth={frozenWidth}
                activeCol={vr.index === active.r ? active.c : -1}
                edit={edit && edit.r === vr.index ? edit : null}
                onEditChange={stable.change}
                onEditCommit={stable.commit}
                onEditCancel={stable.cancel}
              />
            );
          })}
          {rows.length === 0 ? (
            <p
              className="text-muted-foreground sticky left-0 px-4 py-10 text-center"
              style={{ top: HEAD_H, width: "100%" }}
            >
              Tidak ada baris pada kategori ini.
            </p>
          ) : null}
        </div>
      </div>
      <p className="text-muted-foreground min-h-5 text-xs" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
