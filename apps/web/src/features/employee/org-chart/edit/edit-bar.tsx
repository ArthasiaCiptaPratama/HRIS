import { LogOut, PencilRuler, Redo2, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DraftState } from "./draft";

// ORG-D2: bilah mode edit (desktop saja). Tombol "Mode edit" hanya untuk akun ber-izin
// `org.structure.manage` (API tetap memeriksa ulang setiap simpan).

export function EditBar({
  editing,
  draft,
  onStart,
  onUndo,
  onRedo,
  onExit,
  onSave,
}: {
  editing: boolean;
  draft: DraftState;
  onStart: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExit: () => void;
  onSave: () => void;
}) {
  if (!editing) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="bg-card hidden shadow-xs lg:inline-flex"
        onClick={onStart}
      >
        <PencilRuler /> Mode edit
      </Button>
    );
  }
  const count = draft.actions.length;
  const lastUndo = draft.actions.at(-1)?.label;
  const nextRedo = draft.redo[0]?.label;
  return (
    <div
      role="toolbar"
      aria-label="Mode edit bagan"
      className="bg-card flex items-center gap-1 rounded-lg border p-1 shadow-sm"
    >
      <span className="text-brand px-2 text-xs font-semibold">Mode edit</span>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={lastUndo ? `Urungkan: ${lastUndo}` : "Urungkan"}
        title={lastUndo ? `Urungkan: ${lastUndo} (Ctrl+Z)` : "Urungkan (Ctrl+Z)"}
        disabled={count === 0}
        onClick={onUndo}
      >
        <Undo2 />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={nextRedo ? `Ulangi: ${nextRedo}` : "Ulangi"}
        title={nextRedo ? `Ulangi: ${nextRedo} (Ctrl+Shift+Z)` : "Ulangi (Ctrl+Shift+Z)"}
        disabled={draft.redo.length === 0}
        onClick={onRedo}
      >
        <Redo2 />
      </Button>
      <span className="text-muted-foreground px-1.5 text-xs tabular-nums" aria-live="polite">
        {count === 0 ? "Belum ada perubahan" : `${count} perubahan`}
      </span>
      <Button size="sm" variant="ghost" onClick={onExit}>
        <LogOut /> Keluar
      </Button>
      <Button size="sm" onClick={onSave} disabled={count === 0}>
        <Save /> Simpan
      </Button>
    </div>
  );
}
