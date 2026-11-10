import {
  ORG_POST_HEADCOUNT_MAX,
  type OrgChartChange,
  type OrgChartChangePreview,
  POSITION_LEVEL_LABELS,
  POSITION_LEVELS,
  type PositionLevel,
} from "@hris/shared";
import { LoaderCircle, Plus, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { FormSelect } from "@/components/form-select";
import { LazySelect } from "@/components/lazy-select";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useEmployees } from "../../api";
import { EmployeeAvatar } from "../../components/employee-avatar";
import type { OrgChart, OrgChartPost } from "../../schemas";
import { type DraftAction, type DraftPerson, newTempId } from "./draft";

// ORG-D2: dialog mode edit bagan. Semua dialog hanya MENYUSUN aksi draf; tidak ada yang tersimpan ke
// server sebelum "Simpan" (pratinjau dampak) di bilah edit.

export interface MasterOptions {
  positions: { id: string; name: string; departmentId: string; level: PositionLevel | null }[];
  units: { id: string; name: string; companyId: string | null; parentId: string | null }[];
}

const NEW_POSITION = "__new__";

const postLabel = (chart: OrgChart, post: OrgChartPost) => {
  const unit = chart.units.find((u) => u.id === post.departmentId)?.name;
  const holders = post.holders.map((h) => h.fullName).join(", ");
  return `${post.positionName}${unit ? ` · ${unit}` : ""}${holders ? ` (${holders})` : ""}`;
};

// ── Tambah / ubah pos ───────────────────────────────────────────────────────

export type PostDialogState =
  | { mode: "create"; reportsToId: string | null; sortOrder: number; title: string }
  | { mode: "edit"; post: OrgChartPost };

export function PostDialog({
  state,
  chart,
  master,
  canEditCorporate,
  onClose,
  onSubmit,
}: {
  state: PostDialogState | null;
  chart: OrgChart;
  master: MasterOptions;
  canEditCorporate: boolean;
  onClose: () => void;
  /** Mengembalikan pesan error bila aksi ditolak validasi draf (dialog tetap terbuka). */
  onSubmit: (action: DraftAction) => string | null;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {state ? (
          <PostForm
            // Form baru setiap kali dibuka supaya isian lama tidak terbawa.
            key={
              state.mode === "edit" ? state.post.id : `new-${state.reportsToId}-${state.sortOrder}`
            }
            state={state}
            chart={chart}
            master={master}
            canEditCorporate={canEditCorporate}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PostForm({
  state,
  chart,
  master,
  canEditCorporate,
  onClose,
  onSubmit,
}: {
  state: PostDialogState;
  chart: OrgChart;
  master: MasterOptions;
  canEditCorporate: boolean;
  onClose: () => void;
  onSubmit: (action: DraftAction) => string | null;
}) {
  const editing = state.mode === "edit" ? state.post : null;
  const units = useMemo(
    () =>
      master.units.filter(
        (u) => u.companyId === chart.company.id || (canEditCorporate && u.companyId === null),
      ),
    [master.units, chart.company.id, canEditCorporate],
  );
  const unitIds = useMemo(() => new Set(units.map((u) => u.id)), [units]);
  const unitName = useMemo(() => new Map(master.units.map((u) => [u.id, u.name])), [master.units]);
  const positionOptions = useMemo(
    () => [
      { value: NEW_POSITION, label: "＋ Buat jabatan baru…" },
      ...master.positions
        .filter((p) => unitIds.has(p.departmentId))
        .map((p) => ({
          value: p.id,
          label: p.name,
          hint: p.level ? POSITION_LEVEL_LABELS[p.level] : undefined,
          group: unitName.get(p.departmentId),
        }))
        .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "", "id")),
    ],
    [master.positions, unitIds, unitName],
  );
  const currentPositionId = editing?.positionId ?? "";
  const [positionId, setPositionId] = useState(currentPositionId);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newLevel, setNewLevel] = useState<string>("");
  const [headcount, setHeadcount] = useState(String(editing?.headcount ?? 1));
  const [holders, setHolders] = useState<DraftPerson[]>(editing ? [...editing.holders] : []);
  const [error, setError] = useState<string | null>(null);
  const slots = Number(headcount);
  const placedElsewhere = useMemo(() => {
    const map = new Map<string, string>();
    for (const post of chart.posts) {
      if (post.id === editing?.id) continue;
      for (const holder of post.holders) map.set(holder.id, post.positionName);
    }
    return map;
  }, [chart.posts, editing?.id]);

  const submit = () => {
    setError(null);
    if (!Number.isInteger(slots) || slots < 1 || slots > ORG_POST_HEADCOUNT_MAX) {
      setError(`Jumlah slot 1–${ORG_POST_HEADCOUNT_MAX}.`);
      return;
    }
    if (holders.length > slots) {
      setError(`Pemegang (${holders.length}) melebihi jumlah slot (${slots}).`);
      return;
    }
    const changes: OrgChartChange[] = [];
    let resolvedPosition = positionId;
    if (positionId === NEW_POSITION) {
      if (!newName.trim() || !newUnit) {
        setError("Isi nama jabatan baru dan unit organisasinya.");
        return;
      }
      resolvedPosition = newTempId("position");
      changes.push({
        op: "createPosition",
        tempId: resolvedPosition,
        name: newName.trim(),
        departmentId: newUnit,
        level: (newLevel || null) as PositionLevel | null,
      });
    } else if (!positionId) {
      setError("Pilih jabatan.");
      return;
    }
    let postId: string;
    if (editing) {
      postId = editing.id;
      const removed = editing.holders.filter((h) => !holders.some((x) => x.id === h.id));
      for (const person of removed) {
        changes.push({ op: "placeEmployee", employeeId: person.id, postId: null });
      }
      const update: Extract<OrgChartChange, { op: "updatePost" }> = { op: "updatePost", postId };
      if (resolvedPosition !== currentPositionId) update.positionId = resolvedPosition;
      if (slots !== editing.headcount) update.headcount = slots;
      if (update.positionId !== undefined || update.headcount !== undefined) changes.push(update);
    } else {
      postId = newTempId("post");
      changes.push({
        op: "createPost",
        tempId: postId,
        positionId: resolvedPosition,
        reportsToId: state.mode === "create" ? state.reportsToId : null,
        functionalReportsToId: null,
        headcount: slots,
        sortOrder: state.mode === "create" ? state.sortOrder : 0,
      });
    }
    const added = holders.filter((h) => !editing?.holders.some((x) => x.id === h.id));
    for (const person of added)
      changes.push({ op: "placeEmployee", employeeId: person.id, postId });
    if (changes.length === 0) {
      onClose();
      return;
    }
    const name =
      positionId === NEW_POSITION
        ? newName.trim()
        : (master.positions.find((p) => p.id === positionId)?.name ?? "pos");
    const message = onSubmit({
      label: editing ? `Ubah pos ${name}` : `Tambah pos ${name}`,
      changes,
      people: added,
    });
    if (message) setError(message);
    else onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {editing ? "Ubah pos" : state.mode === "create" ? state.title : ""}
        </DialogTitle>
        <DialogDescription>
          Ubahan masuk draf dan baru tersimpan setelah Anda menekan Simpan.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="post-position">Jabatan</Label>
          <LazySelect
            aria-label="Jabatan"
            value={positionId}
            onChange={setPositionId}
            options={positionOptions}
            placeholder="Pilih jabatan"
            searchable
          />
          {editing && editing.holders.length > 0 && positionId !== currentPositionId ? (
            <p className="text-destructive text-xs">
              Pos masih ditempati. Lepas pemegangnya dulu sebelum mengganti jabatan.
            </p>
          ) : null}
        </div>
        {positionId === NEW_POSITION ? (
          <div className="bg-muted/40 grid gap-3 rounded-lg border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="new-position-name">Nama jabatan baru</Label>
              <Input
                id="new-position-name"
                value={newName}
                maxLength={100}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="new-position-unit">Unit organisasi</Label>
                <FormSelect
                  id="new-position-unit"
                  aria-label="Unit organisasi"
                  value={newUnit}
                  onChange={setNewUnit}
                  options={units.map((u) => ({ value: u.id, label: u.name }))}
                  placeholder="Pilih unit"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-position-level">Level</Label>
                <FormSelect
                  id="new-position-level"
                  aria-label="Level"
                  value={newLevel}
                  onChange={setNewLevel}
                  options={POSITION_LEVELS.map((l) => ({
                    value: l,
                    label: POSITION_LEVEL_LABELS[l],
                  }))}
                  placeholder="Pilih level"
                  noneLabel="Tanpa level"
                />
              </div>
            </div>
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="post-headcount">Jumlah slot</Label>
          <Input
            id="post-headcount"
            type="number"
            min={1}
            max={ORG_POST_HEADCOUNT_MAX}
            className="w-28"
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
          />
        </div>
        <HolderPicker
          companyId={chart.company.id}
          holders={holders}
          slots={Number.isInteger(slots) ? slots : 0}
          placedElsewhere={placedElsewhere}
          onChange={setHolders}
        />
        {error ? (
          <p role="alert" className="text-destructive flex items-start gap-1.5 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Batal
        </Button>
        <Button onClick={submit}>{editing ? "Terapkan" : "Tambah ke draf"}</Button>
      </DialogFooter>
    </>
  );
}

/** Pilih pemegang dari karyawan aktif yang sudah ada (karyawan baru tetap lewat Penerimaan/Import). */
function HolderPicker({
  companyId,
  holders,
  slots,
  placedElsewhere,
  onChange,
}: {
  companyId: string;
  holders: DraftPerson[];
  slots: number;
  placedElsewhere: ReadonlyMap<string, string>;
  onChange: (next: DraftPerson[]) => void;
}) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 250);
  const results = useEmployees(
    { page: 1, pageSize: 8, active: true, q: q || undefined, companyId, sort: "fullName:asc" },
    q.length >= 2,
  );
  const full = holders.length >= slots;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="post-holder-search">
        Pemegang{" "}
        <span className="text-muted-foreground font-normal">
          ({holders.length}/{slots || "–"} slot)
        </span>
      </Label>
      {holders.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {holders.map((person) => (
            <li
              key={person.id}
              className="bg-muted flex items-center gap-1.5 rounded-full py-0.5 pr-1 pl-0.5 text-xs"
            >
              <EmployeeAvatar name={person.fullName} photoUrl={person.photoUrl} size="sm" />
              {person.fullName}
              <button
                type="button"
                className="hover:bg-background rounded-full p-0.5"
                aria-label={`Lepas ${person.fullName} dari pos`}
                onClick={() => onChange(holders.filter((h) => h.id !== person.id))}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id="post-holder-search"
        placeholder={full ? "Slot penuh" : "Cari karyawan aktif (min. 2 huruf)…"}
        value={search}
        disabled={full}
        onChange={(e) => setSearch(e.target.value)}
      />
      {q.length >= 2 && !full ? (
        <ul
          className="max-h-48 overflow-y-auto rounded-md border"
          aria-label="Hasil pencarian karyawan"
        >
          {results.isFetching && !results.data ? (
            <li className="text-muted-foreground flex items-center gap-2 p-2 text-xs">
              <LoaderCircle className="size-3.5 animate-spin" /> Mencari…
            </li>
          ) : (results.data?.data ?? []).length === 0 ? (
            <li className="text-muted-foreground p-2 text-xs">
              Tidak ada karyawan aktif yang cocok.
            </li>
          ) : (
            (results.data?.data ?? []).map((employee) => {
              const chosen = holders.some((h) => h.id === employee.id);
              const elsewhere = placedElsewhere.get(employee.id);
              return (
                <li key={employee.id}>
                  <button
                    type="button"
                    disabled={chosen}
                    className="hover:bg-accent flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm disabled:opacity-50"
                    onClick={() => {
                      onChange([
                        ...holders,
                        {
                          id: employee.id,
                          fullName: employee.fullName,
                          photoUrl: employee.photoUrl,
                        },
                      ]);
                      setSearch("");
                    }}
                  >
                    <EmployeeAvatar
                      name={employee.fullName}
                      photoUrl={employee.photoUrl}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {employee.fullName}
                      <span className="text-muted-foreground ml-1 text-xs">
                        {employee.position.name}
                      </span>
                    </span>
                    {elsewhere ? (
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        pindah dari {elsewhere}
                      </span>
                    ) : employee.orgPostId ? (
                      <span className="text-muted-foreground shrink-0 text-[11px]">pindah pos</span>
                    ) : null}
                    <Plus className="size-3.5 shrink-0" aria-hidden />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

// ── Ubah atasan / atasan fungsional (jalur keyboard untuk "seret titik atas") ───────────────

export interface ParentDialogState {
  post: OrgChartPost;
  line: "solid" | "functional";
}

export function ParentDialog({
  state,
  chart,
  descendants,
  onClose,
  onSubmit,
}: {
  state: ParentDialogState | null;
  chart: OrgChart;
  /** Keturunan pos (tidak boleh jadi atasan: siklus). */
  descendants: (postId: string) => string[];
  onClose: () => void;
  onSubmit: (action: DraftAction) => string | null;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const post = state?.post;
  const options = useMemo(() => {
    if (!post || !state) return [];
    const blocked = new Set([post.id, ...(state.line === "solid" ? descendants(post.id) : [])]);
    return chart.posts
      .filter((p) => !blocked.has(p.id))
      .filter((p) => (state.line === "solid" ? p.corporate === post.corporate : true))
      .map((p) => ({
        value: p.id,
        label: postLabel(chart, p),
        group: p.corporate ? "Fungsi korporat" : chart.company.code,
      }));
  }, [chart, post, state, descendants]);
  const current = post
    ? state?.line === "solid"
      ? post.reportsToId
      : post.functionalReportsToId
    : null;

  const submit = (target: string | null) => {
    if (!post || !state) return;
    const field = state.line === "solid" ? "reportsToId" : "functionalReportsToId";
    const message = onSubmit({
      label:
        state.line === "solid"
          ? `Ubah atasan ${post.positionName}`
          : `Atasan fungsional ${post.positionName}`,
      changes: [{ op: "updatePost", postId: post.id, [field]: target }],
    });
    if (message) setError(message);
    else onClose();
  };

  return (
    <Dialog
      open={state !== null}
      onOpenChange={(open) => {
        if (!open) {
          setValue("");
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {state?.line === "functional" ? "Atasan fungsional" : "Ubah atasan langsung"}
          </DialogTitle>
          <DialogDescription>
            {post ? `${post.positionName}. ` : ""}
            {state?.line === "functional"
              ? "Garis putus-putus; boleh ke fungsi korporat grup."
              : "Garis tegas; hanya pos di perusahaan yang sama. Atasan langsung karyawan dihitung ulang saat disimpan."}
          </DialogDescription>
        </DialogHeader>
        <LazySelect
          aria-label={state?.line === "functional" ? "Atasan fungsional" : "Atasan langsung"}
          value={value || current || ""}
          onChange={setValue}
          options={options}
          placeholder="Pilih pos atasan"
          searchable
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => submit(null)} disabled={!current}>
            {state?.line === "functional"
              ? "Hapus garis fungsional"
              : "Jadikan puncak (tanpa atasan)"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button onClick={() => submit(value || null)} disabled={!value || value === current}>
              Terapkan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Hapus pos (arsip lunak) ──────────────────────────────────────────────────

export function DeleteDialog({
  post,
  chart,
  onClose,
  onSubmit,
}: {
  post: OrgChartPost | null;
  chart: OrgChart;
  onClose: () => void;
  onSubmit: (action: DraftAction) => string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const children = post
    ? chart.posts.filter((p) => p.reportsToId === post.id || p.functionalReportsToId === post.id)
    : [];
  const parent = post?.reportsToId ? chart.posts.find((p) => p.id === post.reportsToId) : null;
  const submit = () => {
    if (!post) return;
    // Bawahan garis tegas naik ke atasan pos ini; garis fungsional yang menunjuk pos ini dilepas.
    const changes: OrgChartChange[] = children.map((child) =>
      child.reportsToId === post.id
        ? { op: "updatePost", postId: child.id, reportsToId: post.reportsToId }
        : { op: "updatePost", postId: child.id, functionalReportsToId: null },
    );
    changes.push({ op: "archivePost", postId: post.id });
    const message = onSubmit({ label: `Hapus pos ${post.positionName}`, changes });
    if (message) setError(message);
    else onClose();
  };
  return (
    <Dialog
      open={post !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hapus pos {post?.positionName}?</DialogTitle>
          <DialogDescription>
            Pos diarsipkan (bisa dipulihkan di Master Data › Pos jabatan).
          </DialogDescription>
        </DialogHeader>
        {post && post.holders.length > 0 ? (
          <p className="text-destructive text-sm">
            Pos masih ditempati {post.holders.map((h) => h.fullName).join(", ")}. Pindahkan
            pemegangnya ke pos lain dulu (seret avatar atau Ubah pos).
          </p>
        ) : children.length > 0 ? (
          <p className="text-sm">
            {children.length} pos bawahan akan dipindah ke{" "}
            <strong>{parent ? parent.positionName : "puncak bagan (tanpa atasan)"}</strong> lebih
            dulu.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={!post || post.holders.length > 0}
          >
            {children.length > 0 ? "Pindahkan bawahan & hapus" : "Hapus pos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Simpan: pratinjau dampak ─────────────────────────────────────────────────

const SUBJECT_LABELS: Record<string, string> = {
  LEAVE: "Cuti",
  PERMIT: "Izin",
  ATTENDANCE_CORRECTION: "Koreksi absen",
  OVERTIME: "Lembur",
  ATTENDANCE_DAY: "Verifikasi hari absen",
  ROSTER_CHANGE: "Tukar/ubah shift",
  ATTENDANCE_PUNCH: "Absen di luar ketentuan",
  ROSTER_EDIT: "Perubahan jadwal",
};

export function SaveDialog({
  open,
  preview,
  loading,
  saving,
  error,
  conflict,
  onClose,
  onConfirm,
  onReload,
}: {
  open: boolean;
  preview: OrgChartChangePreview | undefined;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** 409: editor lain sudah menyimpan → hanya bisa muat ulang (draf dibuang). */
  conflict: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onReload: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Simpan perubahan bagan?</DialogTitle>
          <DialogDescription>
            Semua perubahan disimpan sekaligus. Bila satu gagal, tidak ada yang tersimpan.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" /> Menghitung dampak…
          </p>
        ) : error ? (
          <p role="alert" className="text-destructive flex items-start gap-1.5 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : preview ? (
          <div className="grid gap-4 text-sm">
            <ImpactSection title={`Pos berubah (${preview.posts.length})`}>
              {preview.posts.map((post) => (
                <li key={post.postId}>
                  <span className="font-medium">{post.label}</span>{" "}
                  <span className="text-muted-foreground text-xs">
                    {post.kind === "CREATED"
                      ? "baru"
                      : post.kind === "ARCHIVED"
                        ? "dihapus"
                        : "diubah"}
                  </span>
                  {post.details.length > 0 ? (
                    <ul className="text-muted-foreground ml-4 list-disc text-xs">
                      {post.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ImpactSection>
            {preview.createdPositions.length > 0 ? (
              <ImpactSection title={`Jabatan baru (${preview.createdPositions.length})`}>
                {preview.createdPositions.map((p) => (
                  <li key={`${p.name}-${p.unitName}`}>
                    {p.name} · {p.unitName}
                  </li>
                ))}
              </ImpactSection>
            ) : null}
            {preview.placements.length > 0 ? (
              <ImpactSection title={`Penempatan karyawan (${preview.placements.length})`}>
                {preview.placements.map((p) => (
                  <li key={p.employee.id}>
                    {p.employee.fullName}: {p.fromPost ?? "belum ditempatkan"} →{" "}
                    {p.toPost ?? "dilepas dari pos"}
                  </li>
                ))}
              </ImpactSection>
            ) : null}
            <ImpactSection
              title={`Atasan langsung berganti (${preview.managerChanges.length} karyawan)`}
              empty="Tidak ada karyawan yang atasan langsungnya berganti."
            >
              {preview.managerChanges.map((m) => (
                <li key={m.employee.id}>
                  {m.employee.fullName}: {m.fromManager?.fullName ?? "tanpa atasan"} →{" "}
                  <strong>{m.toManager?.fullName ?? "tanpa atasan"}</strong>
                </li>
              ))}
            </ImpactSection>
            {preview.pendingRequests.length > 0 ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="mb-1 font-medium">Pengajuan yang masih menunggu persetujuan</p>
                <p className="text-muted-foreground mb-2 text-xs">
                  Tetap diproses penyetuju lama. Pengajuan baru memakai atasan baru.
                </p>
                <ul className="list-disc pl-4 text-xs">
                  {preview.pendingRequests.map((r) => (
                    <li key={`${r.employee.id}-${r.subjectType}`}>
                      {r.employee.fullName}: {r.count}{" "}
                      {SUBJECT_LABELS[r.subjectType] ?? r.subjectType}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          {conflict ? (
            <Button onClick={onReload}>Muat ulang bagan</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Kembali ke draf
              </Button>
              <Button
                onClick={onConfirm}
                disabled={!preview || loading || saving || error !== null}
              >
                {saving ? <LoaderCircle className="animate-spin" /> : null} Simpan
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImpactSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children: React.ReactNode[] | React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <section>
      <h3 className="mb-1 font-semibold">{title}</h3>
      {items.length === 0 && empty ? (
        <p className="text-muted-foreground text-xs">{empty}</p>
      ) : (
        <ul className="grid gap-1">{items}</ul>
      )}
    </section>
  );
}

// ── Konfirmasi keluar mode edit dengan draf ─────────────────────────────────

export function DiscardDialog({
  open,
  count,
  onClose,
  onDiscard,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buang draf?</DialogTitle>
          <DialogDescription>
            Ada {count} perubahan yang belum disimpan. Keluar dari mode edit akan membuangnya.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Lanjut mengedit
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            Buang & keluar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
