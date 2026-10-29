import { ASSET_CONDITION_LABELS, ASSET_CONDITIONS, type AssetCondition } from "@hris/shared";
import { Loader2, Wand2 } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { FormSelect } from "@/components/form-select";
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
import { Textarea } from "@/components/ui/textarea";
import { useCompanyScope, useMasterData } from "@/features/employee/api";
import { EmployeePicker } from "@/features/employee/components/employee-picker";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fetchNextAssetCode, useAssetCategories, useAssetMutations, usePpeTypes } from "../api";
import type { Asset } from "../schemas";
import { Field } from "./asset-actions";
import { todayIso } from "./display";

// ARS-D1/D4: form aset per unit, serah-terima, dan pembagian APD (halaman Arsip › Data Assets).

const CONDITION_OPTIONS = ASSET_CONDITIONS.map((value) => ({
  value,
  label: ASSET_CONDITION_LABELS[value],
}));

function FormDialog({
  open,
  onClose,
  title,
  description,
  pending,
  submitLabel,
  onSubmit,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  pending: boolean;
  submitLabel: string;
  onSubmit: () => Promise<void>;
  children: ReactNode;
  wide?: boolean;
}) {
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSubmit();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent
        className={cn(
          "flex max-h-[min(90dvh,860px)] flex-col gap-0 overflow-hidden p-0",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        {/* Judul & tombol tetap terlihat; hanya isi yang di-scroll (pola dialog SP, 2026-10-19). */}
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b px-6 pt-6 pr-12 pb-4">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 py-5">
            {children}
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Tambah / ubah aset. Kode kosong = dibuat otomatis (ARS-D4). */
export function AssetFormDialog({
  asset,
  open,
  onClose,
}: {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
}) {
  const master = useMasterData();
  const scope = useCompanyScope();
  const categories = useAssetCategories();
  const { saveAsset } = useAssetMutations();
  const id = useId();
  const blank = {
    code: "",
    categoryId: "",
    companyId: scope.selectedId ?? "",
    name: "",
    brand: "",
    model: "",
    serialNumber: "",
    workLocationId: "",
    condition: "GOOD" as AssetCondition,
    purchaseDate: "",
    purchasePrice: "",
    note: "",
  };
  const [v, setV] = useState(blank);
  const set = (key: keyof typeof blank) => (value: string) =>
    setV((cur) => ({ ...cur, [key]: value }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: isi ulang hanya saat dialog dibuka / aset berganti
  useEffect(() => {
    if (!open) return;
    setV(
      asset
        ? {
            code: asset.code,
            categoryId: asset.category.id,
            companyId: asset.company.id,
            name: asset.name,
            brand: asset.brand ?? "",
            model: asset.model ?? "",
            serialNumber: asset.serialNumber ?? "",
            workLocationId: asset.workLocation?.id ?? "",
            condition: asset.condition,
            purchaseDate: asset.purchaseDate ?? "",
            purchasePrice: asset.purchasePrice ?? "",
            note: asset.note ?? "",
          }
        : { ...blank, companyId: scope.selectedId ?? master.data?.companies[0]?.id ?? "" },
    );
  }, [open, asset]);
  // Data master bisa baru termuat setelah dialog dibuka (QA staging 2026-10-14) → PT bawaan menyusul.
  const fallbackCompanyId = scope.selectedId ?? master.data?.companies[0]?.id;
  useEffect(() => {
    if (open && !asset && !v.companyId && fallbackCompanyId)
      setV((cur) => ({ ...cur, companyId: fallbackCompanyId }));
  }, [open, asset, v.companyId, fallbackCompanyId]);
  const category = categories.data?.find((c) => c.id === v.categoryId);
  const suggest = async () => {
    if (!v.companyId || !v.categoryId) return toast.error("Pilih perusahaan dan kategori dulu.");
    try {
      set("code")(await fetchNextAssetCode(v.companyId, v.categoryId));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const text = (value: string) => value.trim() || null;
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      wide
      title={asset ? `Ubah aset ${asset.code}` : "Tambah aset"}
      description="Aset per unit yang dipinjamkan ke karyawan dan harus kembali. Harga & tanggal beli hanya terlihat oleh pengelola aset."
      pending={saveAsset.isPending}
      submitLabel={asset ? "Simpan perubahan" : "Tambah aset"}
      onSubmit={async () => {
        const saved = await saveAsset.mutateAsync({
          ...(asset ? { id: asset.id } : {}),
          body: {
            code: v.code.trim(),
            categoryId: v.categoryId,
            companyId: v.companyId,
            name: v.name.trim(),
            brand: text(v.brand),
            model: text(v.model),
            serialNumber: text(v.serialNumber),
            workLocationId: v.workLocationId || null,
            condition: v.condition,
            purchaseDate: v.purchaseDate || null,
            purchasePrice: v.purchasePrice.trim().replace(",", ".") || null,
            note: text(v.note),
          },
        });
        toast.success(asset ? "Aset diperbarui." : `Aset ${saved.code} ditambahkan.`);
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Perusahaan" htmlFor={`${id}-co`}>
          <FormSelect
            id={`${id}-co`}
            value={v.companyId}
            onChange={set("companyId")}
            placeholder="Pilih PT"
            disabled={asset?.status === "ASSIGNED"}
            options={(master.data?.companies ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>
        <Field label="Kategori" htmlFor={`${id}-cat`}>
          <FormSelect
            id={`${id}-cat`}
            value={v.categoryId}
            onChange={set("categoryId")}
            placeholder="Pilih kategori"
            options={(categories.data ?? [])
              .filter((c) => c.isActive || c.id === v.categoryId)
              .map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
          />
        </Field>
        <Field
          label="Kode aset"
          htmlFor={`${id}-code`}
          hint={asset ? undefined : "Kosongkan untuk kode otomatis, atau isi kode label lama."}
        >
          <div className="flex gap-2">
            <Input
              id={`${id}-code`}
              value={v.code}
              onChange={(e) => set("code")(e.target.value.toUpperCase())}
              placeholder="Otomatis"
              maxLength={30}
              required={Boolean(asset)}
              className="font-mono"
            />
            {!asset ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={suggest}
                aria-label="Isi usulan kode"
                title="Isi usulan kode"
              >
                <Wand2 />
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label="Nama aset" htmlFor={`${id}-name`}>
          <Input
            id={`${id}-name`}
            required
            minLength={2}
            maxLength={150}
            value={v.name}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="Mis. Laptop kerja"
          />
        </Field>
        <Field label="Merek" htmlFor={`${id}-brand`}>
          <Input
            id={`${id}-brand`}
            maxLength={80}
            value={v.brand}
            onChange={(e) => set("brand")(e.target.value)}
          />
        </Field>
        <Field label="Model / tipe" htmlFor={`${id}-model`}>
          <Input
            id={`${id}-model`}
            maxLength={80}
            value={v.model}
            onChange={(e) => set("model")(e.target.value)}
          />
        </Field>
        <Field
          label={category?.requiresSerial ? "Nomor seri (wajib)" : "Nomor seri"}
          htmlFor={`${id}-sn`}
        >
          <Input
            id={`${id}-sn`}
            required={category?.requiresSerial}
            maxLength={80}
            value={v.serialNumber}
            onChange={(e) => set("serialNumber")(e.target.value)}
          />
        </Field>
        <Field label="Lokasi kerja" htmlFor={`${id}-loc`}>
          <FormSelect
            id={`${id}-loc`}
            value={v.workLocationId}
            onChange={set("workLocationId")}
            placeholder="Tanpa lokasi"
            noneLabel="Tanpa lokasi"
            options={(master.data?.workLocations ?? []).map((l) => ({
              value: l.id,
              label: l.name,
            }))}
          />
        </Field>
        <Field label="Kondisi" htmlFor={`${id}-cond`}>
          <FormSelect
            id={`${id}-cond`}
            value={v.condition}
            onChange={set("condition")}
            placeholder="Kondisi"
            options={CONDITION_OPTIONS}
          />
        </Field>
        <Field label="Tanggal beli (opsional)" htmlFor={`${id}-pd`}>
          <Input
            id={`${id}-pd`}
            type="date"
            value={v.purchaseDate}
            onChange={(e) => set("purchaseDate")(e.target.value)}
          />
        </Field>
        <Field
          label="Harga beli, Rp (opsional)"
          htmlFor={`${id}-price`}
          hint="Angka tanpa titik ribuan, mis. 12500000"
        >
          <Input
            id={`${id}-price`}
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]{1,2})?"
            value={v.purchasePrice}
            onChange={(e) => set("purchasePrice")(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Catatan (opsional)" htmlFor={`${id}-note`}>
        <Textarea
          id={`${id}-note`}
          maxLength={500}
          rows={2}
          value={v.note}
          onChange={(e) => set("note")(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}

/** Serah-terima ke karyawan aktif PT pemilik aset (API menolak PT lain). */
export function AssignAssetDialog({
  asset,
  onClose,
}: {
  asset: Asset | null;
  onClose: () => void;
}) {
  const { assign } = useAssetMutations();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [assignedAt, setAssignedAt] = useState(todayIso());
  const [dueBackAt, setDueBackAt] = useState("");
  const [condition, setCondition] = useState<AssetCondition>("GOOD");
  const [note, setNote] = useState("");
  const id = useId();
  useEffect(() => {
    if (asset) {
      setEmployeeId(null);
      setCondition(asset.condition);
      setDueBackAt("");
      setNote("");
    }
  }, [asset]);
  if (!asset) return null;
  return (
    <FormDialog
      open
      onClose={onClose}
      wide
      title={`Serahkan ${asset.name}`}
      description={`${asset.code} · ${asset.company.name}. Penerima harus karyawan aktif ${asset.company.name}. Setelah disimpan, cetak PDF BAST untuk ditandatangani; karyawan juga diminta konfirmasi terima di Layanan Mandiri.`}
      pending={assign.isPending}
      submitLabel="Serahkan aset"
      onSubmit={async () => {
        if (!employeeId) throw new Error("Pilih karyawan penerima.");
        await assign.mutateAsync({
          id: asset.id,
          body: {
            employeeId,
            assignedAt,
            dueBackAt: dueBackAt || null,
            conditionOut: condition,
            note: note.trim() || null,
          },
        });
        toast.success("Aset diserahkan. Cetak BAST dari detail aset.");
      }}
    >
      <EmployeePicker
        active
        selectedId={employeeId}
        onSelect={setEmployeeId}
        title="Karyawan penerima"
        className="h-64 min-h-0"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Tanggal serah" htmlFor={`${id}-date`}>
          <Input
            id={`${id}-date`}
            type="date"
            required
            value={assignedAt}
            onChange={(e) => setAssignedAt(e.target.value)}
          />
        </Field>
        <Field
          label="Kembali paling lambat"
          htmlFor={`${id}-due`}
          hint="Kosongkan bila tanpa batas."
        >
          <Input
            id={`${id}-due`}
            type="date"
            min={assignedAt}
            value={dueBackAt}
            onChange={(e) => setDueBackAt(e.target.value)}
          />
        </Field>
        <Field label="Kondisi saat serah" htmlFor={`${id}-cond`}>
          <FormSelect
            id={`${id}-cond`}
            value={condition}
            onChange={(value) => setCondition(value as AssetCondition)}
            placeholder="Kondisi"
            options={CONDITION_OPTIONS}
          />
        </Field>
      </div>
      <Field label="Catatan (opsional)" htmlFor={`${id}-note`}>
        <Textarea
          id={`${id}-note`}
          maxLength={500}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}

/** ARS-D1: catat pembagian APD/seragam (jumlah & ukuran, tanpa stok). */
export function PpeIssueDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const types = usePpeTypes();
  const { issuePpe } = useAssetMutations();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [ppeTypeId, setPpeTypeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [size, setSize] = useState("");
  const [issuedAt, setIssuedAt] = useState(todayIso());
  const [note, setNote] = useState("");
  const id = useId();
  useEffect(() => {
    if (open) {
      setEmployeeId(null);
      setQuantity("1");
      setSize("");
      setNote("");
    }
  }, [open]);
  const type = types.data?.find((t) => t.id === ppeTypeId);
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      wide
      title="Catat pembagian APD"
      description="Pembagian APD/seragam ke karyawan (tanpa stok gudang). Cetak BAST APD setelah disimpan."
      pending={issuePpe.isPending}
      submitLabel="Simpan pembagian"
      onSubmit={async () => {
        if (!employeeId) throw new Error("Pilih karyawan penerima.");
        await issuePpe.mutateAsync({
          body: {
            employeeId,
            ppeTypeId,
            quantity: Number(quantity),
            size: size.trim() || null,
            issuedAt,
            note: note.trim() || null,
          },
        });
        toast.success("Pembagian APD dicatat.");
      }}
    >
      <EmployeePicker
        active
        selectedId={employeeId}
        onSelect={setEmployeeId}
        title="Karyawan penerima"
        className="h-56 min-h-0"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field
            label="Jenis APD"
            htmlFor={`${id}-type`}
            hint={
              type
                ? [
                    type.replaceAfterMonths
                      ? `Masa ganti ${type.replaceAfterMonths} bulan`
                      : "Tanpa masa ganti",
                    type.mustReturn ? "wajib kembali saat keluar" : "habis pakai",
                  ].join(" · ")
                : undefined
            }
          >
            <FormSelect
              id={`${id}-type`}
              value={ppeTypeId}
              onChange={setPpeTypeId}
              placeholder="Pilih jenis"
              options={(types.data ?? [])
                .filter((t) => t.isActive)
                .map((t) => ({ value: t.id, label: t.name }))}
            />
          </Field>
        </div>
        <Field label="Jumlah" htmlFor={`${id}-qty`}>
          <Input
            id={`${id}-qty`}
            type="number"
            required
            min={1}
            max={100}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label="Ukuran" htmlFor={`${id}-size`}>
          <Input
            id={`${id}-size`}
            maxLength={20}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="Mis. L / 42"
          />
        </Field>
        <Field label="Tanggal terima" htmlFor={`${id}-date`}>
          <Input
            id={`${id}-date`}
            type="date"
            required
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Catatan (opsional)" htmlFor={`${id}-note`}>
        <Textarea
          id={`${id}-note`}
          maxLength={500}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
