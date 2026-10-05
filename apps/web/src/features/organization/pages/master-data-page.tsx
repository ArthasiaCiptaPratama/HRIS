import {
  canBeChildOf,
  companyInputSchema,
  departmentInputSchema,
  EMPLOYMENT_CATEGORIES,
  EMPLOYMENT_CATEGORY_LABELS,
  type EmploymentCategory,
  employmentStatusInputSchema,
  gradeInputSchema,
  type MasterDataKind,
  type MasterDataView,
  MERGEABLE_MASTER_DATA,
  ORG_UNIT_TYPE_LABELS,
  ORG_UNIT_TYPES,
  type OrgUnitType,
  POSITION_LEVEL_LABELS,
  POSITION_LEVELS,
  type PositionLevel,
  positionInputSchema,
  workLocationInputSchema,
} from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import {
  Archive,
  ArchiveRestore,
  Combine,
  MoreHorizontal,
  Pencil,
  Plus,
  SearchX,
  Trash2,
} from "lucide-react";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import {
  type MasterDataAction,
  useMasterDataAction,
  useMasterDataAdmin,
  useMergeMasterData,
  useSaveMasterData,
} from "../api";
import type { GeoPoint } from "../components/geofence-map";
import { GeofencePicker } from "../components/geofence-picker";
import {
  isMasterDataAlias,
  MASTER_DATA_BASE,
  MASTER_DATA_PAGES,
  type MasterDataPageConfig,
  masterDataPage,
} from "../config";
import type { MasterDataItem } from "../schemas";

// D-049: Administrasi › Master Data. SUPER_ADMIN kelola; HR_ADMIN hanya melihat (API tetap penentu).

const column = createColumnHelper<typeof tableFeaturesNone, MasterDataItem>();
const col = (def: Parameters<typeof column.display>[0]) =>
  column.display(def) as DataColumn<MasterDataItem>;

export function MasterDataPage() {
  const { kind: slug } = useParams();
  const config = masterDataPage(slug);
  if (!config) return <Navigate to={`${MASTER_DATA_BASE}/${MASTER_DATA_PAGES[0]?.slug}`} replace />;
  if (isMasterDataAlias(slug))
    return <Navigate to={`${MASTER_DATA_BASE}/${config.slug}`} replace />;
  // `key` mengosongkan filter & dialog saat berpindah jenis.
  return <MasterDataScreen key={config.kind} config={config} />;
}

function MasterDataScreen({ config }: { config: MasterDataPageConfig }) {
  const me = useMe().data as Me;
  const canManage = access.manageMasterData(me);
  const [view, setView] = useState<MasterDataView>("active");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const list = useMasterDataAdmin(config.kind, view, q);
  const [editing, setEditing] = useState<MasterDataItem | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ item: MasterDataItem; action: MasterDataAction } | null>(
    null,
  );
  const [merging, setMerging] = useState<MasterDataItem | null>(null);
  const mergeable = MERGEABLE_MASTER_DATA.includes(config.kind);

  const columns = useMemo(
    () =>
      buildColumns(config.kind, {
        canManage,
        mergeable,
        onEdit: setEditing,
        onMerge: setMerging,
        onAction: (item, action) => setConfirm({ item, action }),
      }),
    [config.kind, canManage, mergeable],
  );

  return (
    <div>
      <PageHeader
        title={config.label}
        description={config.description}
        actions={
          canManage ? (
            <Button variant="brand" onClick={() => setEditing("new")}>
              <Plus /> Tambah {config.noun}
            </Button>
          ) : null
        }
      />
      {!canManage ? (
        <Alert className="mb-4">
          <AlertDescription>
            Hanya Super Admin yang dapat mengubah master data. Jabatan, departemen, grade, dan
            lokasi baru juga bisa ditambahkan lewat Import Data Karyawan.
          </AlertDescription>
        </Alert>
      ) : null}
      <ListPanel
        toolbar={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder={`Cari ${config.noun}…`}
              aria-label={`Cari ${config.noun}`}
            />
            <FormSelect
              aria-label="Tampilkan"
              className="h-9 sm:w-48"
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
          label={`Daftar ${config.label.toLowerCase()}`}
          columns={columns}
          data={list.data ?? []}
          loading={list.isPending}
          fetching={list.isFetching}
          skeletonAvatar={false}
          empty={
            list.isError
              ? { icon: SearchX, title: "Gagal memuat data", description: errorMessage(list.error) }
              : {
                  icon: config.icon,
                  title: q
                    ? "Tidak ada yang cocok"
                    : view === "archived"
                      ? "Tidak ada yang diarsipkan"
                      : `Belum ada ${config.noun}`,
                  ...(canManage && !q && view !== "archived"
                    ? {
                        action: (
                          <Button variant="outline" onClick={() => setEditing("new")}>
                            <Plus /> Tambah {config.noun}
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
          <MasterDataFormDialog
            config={config}
            item={editing === "new" ? null : editing}
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
          />
          <ConfirmActionDialog
            config={config}
            state={confirm}
            onOpenChange={(open) => !open && setConfirm(null)}
          />
          {mergeable ? (
            <MergeDialog
              config={config}
              source={merging}
              onOpenChange={(open) => !open && setMerging(null)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ── Kolom ─────────────────────────────────────────────────────────────────────

function buildColumns(
  kind: MasterDataKind,
  opts: {
    canManage: boolean;
    mergeable: boolean;
    onEdit: (item: MasterDataItem) => void;
    onMerge: (item: MasterDataItem) => void;
    onAction: (item: MasterDataItem, action: MasterDataAction) => void;
  },
): DataColumn<MasterDataItem>[] {
  const muted = (value: ReactNode) => <span className="text-muted-foreground">{value ?? "—"}</span>;
  const nameCol = col({
    id: "name",
    header: kind === "companies" ? "Perusahaan" : "Nama",
    meta: { className: "min-w-[200px]" },
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-2">
        {kind === "companies" ? (
          <span className="font-mono text-xs font-semibold">{row.original.code}</span>
        ) : null}
        <span className="font-medium">{row.original.name}</span>
        {row.original.archived ? <Badge variant="muted">Diarsipkan</Badge> : null}
      </div>
    ),
  });
  const extra: Record<MasterDataKind, DataColumn<MasterDataItem>[]> = {
    companies: [
      col({
        id: "npwp",
        header: "NPWP badan",
        meta: { className: "whitespace-nowrap tabular-nums" },
        cell: ({ row }) => muted(row.original.npwpNumber),
      }),
    ],
    departments: [
      col({
        id: "unitType",
        header: "Jenis",
        cell: ({ row }) => (
          <Badge variant="secondary">
            {ORG_UNIT_TYPE_LABELS[row.original.unitType ?? "DEPARTMENT"]}
          </Badge>
        ),
      }),
      col({ id: "parent", header: "Induk", cell: ({ row }) => muted(row.original.parentName) }),
      col({
        id: "company",
        header: "PT",
        cell: ({ row }) =>
          row.original.companyCode ? (
            <Badge variant="outline">{row.original.companyCode}</Badge>
          ) : (
            <span className="text-muted-foreground text-xs">Korporat / grup</span>
          ),
      }),
      col({
        id: "positions",
        header: "Jabatan",
        meta: { className: "tabular-nums" },
        cell: ({ row }) => row.original.positionCount ?? 0,
      }),
    ],
    positions: [
      col({
        id: "department",
        header: "Unit organisasi",
        cell: ({ row }) => row.original.departmentName,
      }),
      col({
        id: "level",
        header: "Level",
        meta: { className: "whitespace-nowrap" },
        cell: ({ row }) =>
          row.original.level ? POSITION_LEVEL_LABELS[row.original.level] : muted("—"),
      }),
    ],
    "employment-statuses": [
      col({
        id: "category",
        header: "Kategori",
        cell: ({ row }) =>
          row.original.category ? (
            <Badge variant="brand">{EMPLOYMENT_CATEGORY_LABELS[row.original.category]}</Badge>
          ) : (
            muted("Tanpa kategori")
          ),
      }),
    ],
    grades: [],
    "work-locations": [
      col({ id: "city", header: "Kota", cell: ({ row }) => muted(row.original.city) }),
      col({
        id: "geofence",
        header: "Geofence",
        meta: { className: "whitespace-nowrap" },
        cell: ({ row }) =>
          row.original.radiusM ? (
            <span className="tabular-nums">
              {row.original.latitude}, {row.original.longitude} · {row.original.radiusM} m
            </span>
          ) : (
            muted("Belum diatur")
          ),
      }),
    ],
  };
  const count = col({
    id: "employees",
    header: "Karyawan aktif",
    meta: { className: "text-right tabular-nums", headerClassName: "text-right" },
    cell: ({ row }) => row.original.employeeCount,
  });
  const actions = col({
    id: "actions",
    header: () => <span className="sr-only">Aksi</span>,
    meta: { className: "w-12 text-right" },
    cell: ({ row }) => {
      const item = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Aksi untuk ${item.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {item.archived ? (
              <DropdownMenuItem onSelect={() => opts.onAction(item, "restore")}>
                <ArchiveRestore /> Pulihkan
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onSelect={() => opts.onEdit(item)}>
                  <Pencil /> Ubah
                </DropdownMenuItem>
                {opts.mergeable ? (
                  <DropdownMenuItem onSelect={() => opts.onMerge(item)}>
                    <Combine /> Gabungkan ke…
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => opts.onAction(item, "archive")}>
                  <Archive /> Arsipkan
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => opts.onAction(item, "delete")}>
              <Trash2 /> Hapus permanen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  });
  return [nameCol, ...extra[kind], count, ...(opts.canManage ? [actions] : [])];
}

// ── Form tambah/ubah ──────────────────────────────────────────────────────────

type Values = Record<string, string>;

const SCHEMA: Record<MasterDataKind, z.ZodType> = {
  companies: companyInputSchema,
  departments: departmentInputSchema,
  positions: positionInputSchema,
  "employment-statuses": employmentStatusInputSchema,
  grades: gradeInputSchema,
  "work-locations": workLocationInputSchema,
};

function initialValues(item: MasterDataItem | null): Values {
  const s = (value: string | number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);
  return {
    name: s(item?.name),
    code: s(item?.code),
    npwpNumber: s(item?.npwpNumber),
    address: s(item?.address),
    unitType: s(item?.unitType ?? "DEPARTMENT"),
    parentId: s(item?.parentId),
    companyId: s(item?.companyId),
    departmentId: s(item?.departmentId),
    level: s(item?.level),
    category: s(item?.category),
    city: s(item?.city),
    latitude: s(item?.latitude),
    longitude: s(item?.longitude),
    radiusM: s(item?.radiusM),
  };
}

/** Nilai form (teks) → body API; angka kosong = null, teks angka tidak valid dibiarkan agar Zod menolak. */
function toBody(kind: MasterDataKind, v: Values): Record<string, unknown> {
  const text = (value: string | undefined) => (value?.trim() ? value.trim() : null);
  const number = (value: string | undefined) => {
    const raw = value?.trim().replace(",", ".");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  };
  switch (kind) {
    case "companies":
      return {
        code: v.code ?? "",
        name: v.name ?? "",
        npwpNumber: text(v.npwpNumber),
        address: text(v.address),
      };
    case "departments":
      return {
        name: v.name ?? "",
        unitType: (v.unitType || "DEPARTMENT") as OrgUnitType,
        parentId: text(v.parentId),
        // D-052: kosong = fungsi korporat / unit lintas grup.
        companyId: text(v.companyId),
      };
    case "positions":
      return {
        name: v.name ?? "",
        departmentId: v.departmentId ?? "",
        level: (text(v.level) as PositionLevel | null) ?? null,
      };
    case "employment-statuses":
      return { name: v.name ?? "", category: (text(v.category) as EmploymentCategory) ?? null };
    case "grades":
      return { name: v.name ?? "" };
    case "work-locations":
      return {
        name: v.name ?? "",
        city: text(v.city),
        address: text(v.address),
        latitude: number(v.latitude),
        longitude: number(v.longitude),
        radiusM: number(v.radiusM),
      };
  }
}

function MasterDataFormDialog({
  config,
  item,
  open,
  onOpenChange,
}: {
  config: MasterDataPageConfig;
  item: MasterDataItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveMasterData(config.kind);
  const departments = useMasterDataAdmin("departments", "active", "");
  const statuses = useMasterDataAdmin("employment-statuses", "all", "");
  const companies = useMasterDataAdmin("companies", "active", "");
  const [values, setValues] = useState<Values>(() => initialValues(item));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setValues(initialValues(item));
      setErrors({});
    }
  }, [open, item]);

  const set = (field: string) => (value: string) => setValues((v) => ({ ...v, [field]: value }));
  const codeLocked = config.kind === "companies" && (item?.totalEmployeeCount ?? 0) > 0;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = toBody(config.kind, values);
    const parsed = SCHEMA[config.kind].safeParse(body);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "name");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync({ ...(item ? { id: item.id } : {}), body });
      toast.success(item ? `${config.label} diperbarui.` : `${config.label} ditambahkan.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const field = (
    name: string,
    label: string,
    input: ReactNode,
    opts: { optional?: boolean; hint?: string } = {},
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`md-${name}`}>
        {label}
        {opts.optional ? (
          <span className="text-muted-foreground font-normal"> (opsional)</span>
        ) : null}
      </Label>
      {input}
      {errors[name] ? (
        <p className="text-destructive text-xs">{errors[name]}</p>
      ) : opts.hint ? (
        <p className="text-muted-foreground text-xs">{opts.hint}</p>
      ) : null}
    </div>
  );
  const textInput = (name: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Input
      id={`md-${name}`}
      value={values[name] ?? ""}
      onChange={(event) => set(name)(event.target.value)}
      aria-invalid={Boolean(errors[name])}
      {...props}
    />
  );

  // Kategori yang sudah dipakai status lain ditandai (satu kategori = satu status, D-038).
  const categoryOwner = new Map(
    (statuses.data ?? [])
      .filter((s) => s.category && s.id !== item?.id)
      .map((s) => [s.category as string, s.name]),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          config.kind === "work-locations"
            ? "max-h-[92dvh] overflow-y-auto sm:max-w-2xl"
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>{item ? `Ubah ${config.noun}` : `Tambah ${config.noun}`}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {config.kind === "companies"
            ? field(
                "code",
                "Kode",
                textInput("code", {
                  className: "font-mono uppercase",
                  placeholder: "ACP",
                  disabled: codeLocked,
                }),
                {
                  hint: codeLocked
                    ? "Terkunci: sudah dipakai nomor induk karyawan."
                    : "2–10 huruf besar/angka; dipakai di nomor induk (mis. 25.11.ACP.023).",
                },
              )
            : null}
          {field(
            "name",
            config.kind === "companies" ? "Nama badan hukum" : "Nama",
            textInput("name"),
          )}
          {config.kind === "companies" ? (
            <>
              {field(
                "npwpNumber",
                "NPWP badan",
                textInput("npwpNumber", { inputMode: "numeric" }),
                {
                  optional: true,
                },
              )}
              {field(
                "address",
                "Alamat",
                <Textarea
                  id="md-address"
                  rows={2}
                  value={values.address ?? ""}
                  onChange={(event) => set("address")(event.target.value)}
                />,
                { optional: true },
              )}
            </>
          ) : null}
          {config.kind === "departments" ? (
            <>
              {field(
                "unitType",
                "Jenis unit",
                <FormSelect
                  id="md-unitType"
                  value={values.unitType ?? "DEPARTMENT"}
                  onChange={(value) =>
                    setValues((v) => {
                      // Induk yang tidak sah untuk jenis baru dikosongkan (D-050).
                      const parent = (departments.data ?? []).find((d) => d.id === v.parentId);
                      const keep =
                        !parent ||
                        canBeChildOf(value as OrgUnitType, parent.unitType ?? "DEPARTMENT");
                      return { ...v, unitType: value, parentId: keep ? (v.parentId ?? "") : "" };
                    })
                  }
                  placeholder="Pilih jenis"
                  options={ORG_UNIT_TYPES.map((t) => ({
                    value: t,
                    label: ORG_UNIT_TYPE_LABELS[t],
                  }))}
                />,
              )}
              {field(
                "parentId",
                "Unit induk",
                <FormSelect
                  id="md-parentId"
                  value={values.parentId ?? ""}
                  onChange={set("parentId")}
                  placeholder="Pilih induk"
                  noneLabel="Tanpa induk (puncak)"
                  options={(departments.data ?? [])
                    .filter(
                      (d) =>
                        d.id !== item?.id &&
                        // D-052: induk ber-PT harus PT yang sama; induk tanpa PT boleh semua.
                        (!d.companyId || d.companyId === (values.companyId || null)) &&
                        canBeChildOf(
                          (values.unitType || "DEPARTMENT") as OrgUnitType,
                          d.unitType ?? "DEPARTMENT",
                        ),
                    )
                    .map((d) => ({
                      value: d.id,
                      label: d.name,
                      hint: ORG_UNIT_TYPE_LABELS[d.unitType ?? "DEPARTMENT"],
                    }))}
                />,
                {
                  optional: true,
                  hint: "Direktorat ⊃ Divisi ⊃ Departemen ⊃ Seksi; departemen boleh langsung di bawah direktorat.",
                },
              )}
              {field(
                "companyId",
                "Perusahaan pemilik",
                <FormSelect
                  id="md-companyId"
                  value={values.companyId ?? ""}
                  onChange={set("companyId")}
                  placeholder="Pilih perusahaan"
                  noneLabel="Tanpa PT (fungsi korporat / lintas grup)"
                  options={(companies.data ?? []).map((c) => ({
                    value: c.id,
                    label: `${c.code ?? ""} · ${c.name}`,
                  }))}
                />,
                {
                  optional: true,
                  hint: "Unit milik PT tampil di bagan PT itu; unit tanpa PT tampil sebagai Corporate Function di bagan semua PT.",
                },
              )}
            </>
          ) : null}
          {config.kind === "positions" ? (
            <>
              {field(
                "departmentId",
                "Unit organisasi",
                <FormSelect
                  id="md-departmentId"
                  value={values.departmentId ?? ""}
                  onChange={set("departmentId")}
                  placeholder="Pilih unit"
                  invalid={Boolean(errors.departmentId)}
                  options={(departments.data ?? []).map((d) => ({
                    value: d.id,
                    label: d.name,
                    hint: ORG_UNIT_TYPE_LABELS[d.unitType ?? "DEPARTMENT"],
                  }))}
                />,
                { hint: "Jabatan direksi (Direktur, Sekretaris) cukup di unit Direktorat." },
              )}
              {field(
                "level",
                "Level",
                <FormSelect
                  id="md-level"
                  value={values.level ?? ""}
                  onChange={set("level")}
                  placeholder="Pilih level"
                  noneLabel="Tanpa level"
                  options={POSITION_LEVELS.map((l) => ({
                    value: l,
                    label: POSITION_LEVEL_LABELS[l],
                  }))}
                />,
                { optional: true },
              )}
            </>
          ) : null}
          {config.kind === "employment-statuses"
            ? field(
                "category",
                "Kategori",
                <FormSelect
                  id="md-category"
                  value={values.category ?? ""}
                  onChange={set("category")}
                  placeholder="Pilih kategori"
                  noneLabel="Tanpa kategori"
                  options={EMPLOYMENT_CATEGORIES.map((c) => ({
                    value: c,
                    label: EMPLOYMENT_CATEGORY_LABELS[c],
                    ...(categoryOwner.has(c) ? { hint: `dipakai "${categoryOwner.get(c)}"` } : {}),
                  }))}
                />,
                {
                  optional: true,
                  hint: "Menentukan pengelompokan di Data Karyawan Aktif. Satu kategori hanya untuk satu status.",
                },
              )
            : null}
          {config.kind === "work-locations" ? (
            <>
              {field("city", "Kota", textInput("city"), { optional: true })}
              {field(
                "address",
                "Alamat",
                <Textarea
                  id="md-address"
                  rows={2}
                  value={values.address ?? ""}
                  onChange={(event) => set("address")(event.target.value)}
                />,
                { optional: true },
              )}
              <fieldset className="space-y-3 rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">Geofence (opsional)</legend>
                <GeofencePicker
                  point={geoPoint(values)}
                  radius={positiveNumber(values.radiusM)}
                  onPick={(point) =>
                    setValues((v) => ({
                      ...v,
                      latitude: String(point.lat),
                      longitude: String(point.lng),
                      // Radius kosong → 100 m supaya lingkaran langsung terlihat (bisa diubah).
                      radiusM: v.radiusM?.trim() ? v.radiusM : String(DEFAULT_RADIUS_M),
                    }))
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Atau isi angka langsung / tempel koordinat dari Google Maps (mis. “-2.2136,
                  113.9213”) ke kolom latitude. Wajib untuk absensi nanti.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {field(
                    "latitude",
                    "Latitude",
                    textInput("latitude", {
                      inputMode: "decimal",
                      placeholder: "-2.213600",
                      onPaste: (event) => {
                        const text = event.clipboardData.getData("text");
                        const parts = text.split(/[,\s]+/).filter(Boolean);
                        if (parts.length === 2) {
                          event.preventDefault();
                          setValues((v) => ({
                            ...v,
                            latitude: parts[0] ?? "",
                            longitude: parts[1] ?? "",
                          }));
                        }
                      },
                    }),
                  )}
                  {field(
                    "longitude",
                    "Longitude",
                    textInput("longitude", { inputMode: "decimal", placeholder: "113.921300" }),
                  )}
                  {field(
                    "radiusM",
                    "Radius (m)",
                    textInput("radiusM", { inputMode: "numeric", placeholder: "150" }),
                  )}
                </div>
              </fieldset>
            </>
          ) : null}
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

const DEFAULT_RADIUS_M = 100;

function positiveNumber(value: string | undefined): number | null {
  const parsed = Number(value?.trim().replace(",", "."));
  return value?.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Titik peta dari kolom angka; null bila kosong/tidak valid. */
function geoPoint(values: Values): GeoPoint | null {
  const lat = Number(values.latitude?.trim().replace(",", "."));
  const lng = Number(values.longitude?.trim().replace(",", "."));
  if (!values.latitude?.trim() || !values.longitude?.trim()) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return null;
  return { lat, lng };
}

// ── Konfirmasi arsip / pulihkan / hapus ───────────────────────────────────────

const ACTION_TEXT: Record<
  MasterDataAction,
  { title: string; button: string; done: string; variant: "brand" | "destructive" }
> = {
  archive: { title: "Arsipkan", button: "Arsipkan", done: "diarsipkan", variant: "brand" },
  restore: { title: "Pulihkan", button: "Pulihkan", done: "dipulihkan", variant: "brand" },
  delete: { title: "Hapus permanen", button: "Hapus", done: "dihapus", variant: "destructive" },
};

function ConfirmActionDialog({
  config,
  state,
  onOpenChange,
}: {
  config: MasterDataPageConfig;
  state: { item: MasterDataItem; action: MasterDataAction } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const run = useMasterDataAction(config.kind);
  if (!state) return null;
  const { item, action } = state;
  const text = ACTION_TEXT[action];
  const description: Record<MasterDataAction, string> = {
    archive:
      item.employeeCount > 0
        ? `${item.employeeCount} karyawan aktif masih memakai "${item.name}". Data mereka tidak berubah, tetapi "${item.name}" tidak bisa dipilih lagi untuk data baru.`
        : `"${item.name}" tidak bisa dipilih lagi untuk data baru. Data lama tetap menampilkan namanya.`,
    restore: `"${item.name}" bisa dipilih lagi di form dan import.`,
    delete: `"${item.name}" dihapus selamanya. Bila pernah dipakai data mana pun, penghapusan ditolak — arsipkan saja.`,
  };
  const onConfirm = async () => {
    try {
      await run.mutateAsync({ id: item.id, action });
      toast.success(`${config.label} ${text.done}.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {text.title} {config.noun}?
          </DialogTitle>
          <DialogDescription>{description[action]}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button variant={text.variant} onClick={onConfirm} disabled={run.isPending}>
            {run.isPending ? "Memproses…" : text.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Gabungkan ─────────────────────────────────────────────────────────────────

function MergeDialog({
  config,
  source,
  onOpenChange,
}: {
  config: MasterDataPageConfig;
  source: MasterDataItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const merge = useMergeMasterData(config.kind);
  const targets = useMasterDataAdmin(config.kind, "active", "");
  const [targetId, setTargetId] = useState("");
  useEffect(() => {
    if (source) setTargetId("");
  }, [source]);
  if (!source) return null;
  const options = (targets.data ?? [])
    // D-050: unit hanya digabung ke unit sejenis.
    .filter((t) => t.id !== source.id && (!source.unitType || t.unitType === source.unitType))
    .map((t) => ({
      value: t.id,
      label: t.name,
      ...(t.departmentName ? { hint: t.departmentName } : {}),
    }));
  const onConfirm = async () => {
    if (!targetId) return;
    try {
      const result = await merge.mutateAsync({ id: source.id, targetId });
      toast.success(
        `Digabungkan: ${result.movedEmployees} karyawan dipindah${
          result.movedPositions ? `, ${result.movedPositions} jabatan dipindah` : ""
        }.`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gabungkan "{source.name}"</DialogTitle>
          <DialogDescription>
            Semua karyawan{config.kind === "departments" ? ", jabatan, dan sub-departemen" : ""}{" "}
            yang memakai "{source.name}" dipindah ke tujuan, lalu "{source.name}" diarsipkan.
            Riwayat ikut menunjuk ke tujuan. Tidak bisa dibatalkan otomatis.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="md-merge-target">Gabungkan ke</Label>
          <FormSelect
            id="md-merge-target"
            value={targetId}
            onChange={setTargetId}
            placeholder={`Pilih ${config.noun} tujuan`}
            options={options}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button variant="brand" onClick={onConfirm} disabled={!targetId || merge.isPending}>
            {merge.isPending ? "Menggabungkan…" : "Gabungkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
