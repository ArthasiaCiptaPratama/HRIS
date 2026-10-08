import { type MasterDataView, ORG_POST_HEADCOUNT_MAX, orgPostInputSchema } from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  SearchX,
  Trash2,
  Workflow,
} from "lucide-react";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import {
  type MasterDataAction,
  useMasterDataAdmin,
  useOrgPostAction,
  useOrgPosts,
  useSaveOrgPost,
  useSyncPostManagers,
} from "../api";
import type { OrgPostAdmin } from "../schemas";

// D-051: Administrasi › Master Data › Pos jabatan — kursi di bagan organisasi (atasan, atasan
// fungsional, jumlah slot). SA kelola, HR lihat. Penempatan karyawan lewat form karyawan.

const column = createColumnHelper<typeof tableFeaturesNone, OrgPostAdmin>();
const col = (def: Parameters<typeof column.display>[0]) =>
  column.display(def) as DataColumn<OrgPostAdmin>;
const muted = (value: ReactNode) => <span className="text-muted-foreground">{value ?? "—"}</span>;
/** Label "Jabatan · Unit" diringkas satu baris (tabel tetap muat; teks lengkap di tooltip). */
const postRef = (label: string | null) =>
  label ? (
    <span className="text-muted-foreground block max-w-52 truncate" title={label}>
      {label}
    </span>
  ) : (
    muted(null)
  );

const postLabel = (post: Pick<OrgPostAdmin, "positionName" | "departmentName">) =>
  `${post.positionName} · ${post.departmentName}`;

export function OrgPostsPage() {
  const me = useMe().data as Me;
  const canManage = access.manageMasterData(me);
  const [view, setView] = useState<MasterDataView>("active");
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const list = useOrgPosts(view, q, companyId);
  const companies = useMasterDataAdmin("companies", "active", "");
  const sync = useSyncPostManagers();
  const [editing, setEditing] = useState<OrgPostAdmin | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ post: OrgPostAdmin; action: MasterDataAction } | null>(
    null,
  );

  const columns = useMemo<DataColumn<OrgPostAdmin>[]>(
    () => [
      col({
        id: "position",
        header: "Pos jabatan",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.original.positionName}
              {row.original.archived ? (
                <Badge variant="outline" className="ml-2">
                  Diarsipkan
                </Badge>
              ) : null}
            </p>
            <p className="text-muted-foreground truncate font-mono text-xs">
              {row.original.code ?? "—"}
            </p>
          </div>
        ),
      }),
      col({
        id: "unit",
        header: "Unit",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            {row.original.companyCode ? (
              <Badge variant="outline">{row.original.companyCode}</Badge>
            ) : (
              <Badge variant="secondary">Korporat</Badge>
            )}
            <span className="max-w-48 truncate" title={row.original.departmentName}>
              {row.original.departmentName}
            </span>
          </div>
        ),
      }),
      col({
        id: "reportsTo",
        header: "Atasan",
        cell: ({ row }) => postRef(row.original.reportsToLabel),
      }),
      col({
        id: "functional",
        header: "Atasan fungsional",
        cell: ({ row }) => postRef(row.original.functionalReportsToLabel),
      }),
      col({
        id: "slots",
        header: "Slot",
        cell: ({ row }) => {
          const { holderCount, headcount } = row.original;
          const vacant = Math.max(headcount - holderCount, 0);
          return (
            <span className="tabular-nums">
              {holderCount}/{headcount}
              {vacant > 0 ? (
                <span className="text-destructive ml-1.5 text-xs">{vacant} kosong</span>
              ) : null}
            </span>
          );
        },
      }),
      col({
        id: "actions",
        header: () => <span className="sr-only">Aksi</span>,
        cell: ({ row }) =>
          canManage ? (
            <PostActions
              post={row.original}
              onEdit={() => setEditing(row.original)}
              onAction={(action) => setConfirm({ post: row.original, action })}
            />
          ) : null,
      }),
    ],
    [canManage],
  );

  return (
    <div>
      <PageHeader
        title="Pos jabatan"
        description="Kursi di bagan organisasi: atasan langsung (garis tegas), atasan fungsional (garis putus-putus), dan jumlah slot. Pos tanpa pemegang tampil Kosong. Atasan karyawan dihitung otomatis dari pos."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/personal/struktur-organisasi">
                <Workflow /> Lihat bagan
              </Link>
            </Button>
            {canManage ? (
              <>
                <Button
                  variant="outline"
                  disabled={sync.isPending}
                  onClick={() =>
                    sync.mutate(undefined, {
                      onSuccess: (result) =>
                        toast.success(
                          result.updated > 0
                            ? `Atasan ${result.updated} karyawan diperbarui dari pos.`
                            : "Atasan semua pemegang pos sudah sesuai.",
                        ),
                      onError: (error) => toast.error(errorMessage(error)),
                    })
                  }
                >
                  <RefreshCcw /> Sinkronkan atasan
                </Button>
                <Button variant="brand" onClick={() => setEditing("new")}>
                  <Plus /> Tambah pos
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      {!canManage ? (
        <Alert className="mb-4">
          <AlertDescription>
            Hanya Super Admin yang dapat mengubah pos jabatan. Penempatan karyawan ke pos dilakukan
            lewat ubah data karyawan.
          </AlertDescription>
        </Alert>
      ) : null}
      <ListPanel
        toolbar={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Cari jabatan, unit, kode…"
              aria-label="Cari pos jabatan"
            />
            <FormSelect
              aria-label="Perusahaan"
              className="h-9 sm:w-56"
              value={companyId}
              onChange={setCompanyId}
              placeholder="Semua perusahaan"
              noneLabel="Semua perusahaan"
              options={[
                ...(companies.data ?? []).map((c) => ({
                  value: c.id,
                  label: `${c.code ?? ""} · ${c.name}`,
                })),
                { value: "corporate", label: "Korporat / grup" },
              ]}
            />
            <FormSelect
              aria-label="Tampilkan"
              className="h-9 sm:w-44"
              value={view}
              onChange={(value) => setView(value as MasterDataView)}
              placeholder="Aktif"
              options={[
                { value: "active", label: "Aktif" },
                { value: "archived", label: "Diarsipkan" },
                { value: "all", label: "Semua" },
              ]}
            />
          </div>
        }
      >
        <DataTable
          label="Daftar pos jabatan"
          columns={columns}
          data={list.data ?? []}
          loading={list.isPending}
          fetching={list.isFetching}
          skeletonAvatar={false}
          empty={
            list.isError
              ? { icon: SearchX, title: "Gagal memuat data", description: errorMessage(list.error) }
              : {
                  icon: Workflow,
                  title: q ? "Tidak ada yang cocok" : "Belum ada pos jabatan",
                  ...(canManage && !q
                    ? {
                        action: (
                          <Button variant="outline" onClick={() => setEditing("new")}>
                            <Plus /> Tambah pos
                          </Button>
                        ),
                      }
                    : {}),
                }
          }
        />
      </ListPanel>
      {canManage ? (
        <>
          <PostFormDialog
            post={editing === "new" ? null : editing}
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
          />
          <ConfirmDialog state={confirm} onOpenChange={(open) => !open && setConfirm(null)} />
        </>
      ) : null}
    </div>
  );
}

function PostActions({
  post,
  onEdit,
  onAction,
}: {
  post: OrgPostAdmin;
  onEdit: () => void;
  onAction: (action: MasterDataAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Aksi untuk ${post.positionName} (${post.departmentName})`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {post.archived ? (
          <DropdownMenuItem onSelect={() => onAction("restore")}>
            <ArchiveRestore /> Pulihkan
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Ubah
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("archive")}>
              <Archive /> Arsipkan
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onAction("delete")}>
          <Trash2 /> Hapus permanen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Values = Record<
  "code" | "positionId" | "reportsToId" | "functionalReportsToId" | "headcount" | "sortOrder",
  string
>;

const initial = (post: OrgPostAdmin | null): Values => ({
  code: post?.code ?? "",
  positionId: post?.positionId ?? "",
  reportsToId: post?.reportsToId ?? "",
  functionalReportsToId: post?.functionalReportsToId ?? "",
  headcount: String(post?.headcount ?? 1),
  sortOrder: String(post?.sortOrder ?? 0),
});

function PostFormDialog({
  post,
  open,
  onOpenChange,
}: {
  post: OrgPostAdmin | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveOrgPost();
  const positions = useMasterDataAdmin("positions", "active", "");
  const units = useMasterDataAdmin("departments", "all", "");
  const posts = useOrgPosts("active", "", "");
  const [values, setValues] = useState<Values>(() => initial(post));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setValues(initial(post));
      setErrors({});
    }
  }, [open, post]);

  const unitCompany = useMemo(
    () => new Map((units.data ?? []).map((u) => [u.id, u.companyId ?? null])),
    [units.data],
  );
  const selected = (positions.data ?? []).find((p) => p.id === values.positionId);
  const company = selected?.departmentId ? (unitCompany.get(selected.departmentId) ?? null) : null;
  const candidates = (posts.data ?? []).filter((p) => p.id !== post?.id);
  const set = (key: keyof Values) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const number = (value: string) => (value.trim() === "" ? undefined : Number(value));
    const body = {
      code: values.code.trim() ? values.code.trim() : null,
      positionId: values.positionId,
      reportsToId: values.reportsToId || null,
      functionalReportsToId: values.functionalReportsToId || null,
      headcount: number(values.headcount),
      sortOrder: number(values.sortOrder),
    };
    const parsed = orgPostInputSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync({ ...(post ? { id: post.id } : {}), body: parsed.data });
      toast.success(post ? "Pos jabatan diperbarui." : "Pos jabatan ditambahkan.");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const field = (name: keyof Values, label: string, input: ReactNode, hint?: string) => (
    <div className="space-y-2">
      <Label htmlFor={`op-${name}`}>{label}</Label>
      {input}
      {errors[name] ? (
        <p className="text-destructive text-xs">{errors[name]}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{post ? "Ubah pos jabatan" : "Tambah pos jabatan"}</DialogTitle>
          <DialogDescription>
            Garis tegas hanya ke pos di perusahaan yang sama; garis fungsional boleh ke fungsi
            korporat grup.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {field(
            "positionId",
            "Jabatan",
            <FormSelect
              id="op-positionId"
              value={values.positionId}
              onChange={set("positionId")}
              placeholder="Pilih jabatan"
              invalid={Boolean(errors.positionId)}
              disabled={Boolean(post && post.holderCount > 0)}
              options={(positions.data ?? []).map((p) => ({
                value: p.id,
                label: p.name,
                hint: p.departmentName ?? "",
              }))}
            />,
            post && post.holderCount > 0
              ? "Pos masih ditempati — pindahkan pemegangnya dulu untuk mengganti jabatan."
              : "Unit & perusahaan pos mengikuti jabatan.",
          )}
          {field(
            "reportsToId",
            "Atasan langsung (garis tegas)",
            <FormSelect
              id="op-reportsToId"
              value={values.reportsToId}
              onChange={set("reportsToId")}
              placeholder="Pilih atasan"
              noneLabel="Tanpa atasan (puncak)"
              options={candidates
                .filter((p) => p.companyId === company)
                .map((p) => ({ value: p.id, label: postLabel(p), hint: p.code ?? "" }))}
            />,
          )}
          {field(
            "functionalReportsToId",
            "Atasan fungsional (garis putus-putus)",
            <FormSelect
              id="op-functionalReportsToId"
              value={values.functionalReportsToId}
              onChange={set("functionalReportsToId")}
              placeholder="Pilih atasan fungsional"
              noneLabel="Tidak ada"
              options={candidates
                .filter((p) => p.companyId === company || p.companyId === null)
                .map((p) => ({
                  value: p.id,
                  label: postLabel(p),
                  hint: p.companyId === null ? "Korporat" : (p.code ?? ""),
                }))}
            />,
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {field(
              "headcount",
              "Jumlah slot",
              <Input
                id="op-headcount"
                inputMode="numeric"
                value={values.headcount}
                onChange={(event) => set("headcount")(event.target.value)}
                aria-invalid={Boolean(errors.headcount)}
              />,
              `1–${ORG_POST_HEADCOUNT_MAX}`,
            )}
            {field(
              "sortOrder",
              "Urutan",
              <Input
                id="op-sortOrder"
                inputMode="numeric"
                value={values.sortOrder}
                onChange={(event) => set("sortOrder")(event.target.value)}
              />,
              "Kiri → kanan",
            )}
            {field(
              "code",
              "Kode (opsional)",
              <Input
                id="op-code"
                value={values.code}
                onChange={(event) => set("code")(event.target.value)}
                placeholder="ACP-KTT"
                aria-invalid={Boolean(errors.code)}
              />,
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" variant="brand" disabled={save.isPending}>
              {save.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ACTION_TEXT: Record<
  MasterDataAction,
  { title: string; button: string; done: string; description: string }
> = {
  archive: {
    title: "Arsipkan pos?",
    button: "Arsipkan",
    done: "diarsipkan",
    description: "Pos hilang dari bagan. Hanya pos kosong tanpa bawahan yang bisa diarsipkan.",
  },
  restore: {
    title: "Pulihkan pos?",
    button: "Pulihkan",
    done: "dipulihkan",
    description: "Pos tampil lagi di bagan.",
  },
  delete: {
    title: "Hapus pos permanen?",
    button: "Hapus",
    done: "dihapus",
    description: "Hanya pos yang tidak pernah dirujuk karyawan atau pos lain yang bisa dihapus.",
  },
};

function ConfirmDialog({
  state,
  onOpenChange,
}: {
  state: { post: OrgPostAdmin; action: MasterDataAction } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const run = useOrgPostAction();
  if (!state) return null;
  const text = ACTION_TEXT[state.action];
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>
            {postLabel(state.post)}. {text.description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            variant={state.action === "delete" ? "destructive" : "brand"}
            disabled={run.isPending}
            onClick={async () => {
              try {
                await run.mutateAsync({ id: state.post.id, action: state.action });
                toast.success(`Pos ${text.done}.`);
                onOpenChange(false);
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            {run.isPending ? "Memproses…" : text.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
