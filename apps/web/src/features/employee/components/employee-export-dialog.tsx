import type { EmploymentCategory, EmploymentCategoryGroup } from "@hris/shared";
import { useMutation } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Me } from "@/features/auth/schemas";
import { access } from "@/lib/access";
import { type EmployeeExportSection, exportEmployees, useCompanyScope, useEmployees } from "../api";
import { employeeListFilter, useListParams } from "./employee-list-view";
import { EmployeePicker } from "./employee-picker";

const SECTIONS: readonly [EmployeeExportSection, string][] = [
  ["identity", "Identitas & kepegawaian"],
  ["contact", "Kontak"],
  ["personal", "Data pribadi"],
  ["bank", "Rekening"],
  ["family", "Keluarga"],
  ["education", "Pendidikan"],
  ["training", "Pelatihan"],
  ["experience", "Pengalaman kerja"],
  ["employment", "Riwayat jabatan/status"],
];

export function EmployeeExportDialog({
  me,
  category,
  group,
}: {
  me: Me;
  category?: EmploymentCategory | undefined;
  group?: EmploymentCategoryGroup | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("filter");
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [sections, setSections] = useState<EmployeeExportSection[]>(["identity"]);
  const list = useListParams({ sort: "fullName:asc" });
  const { selectedId: companyId } = useCompanyScope();
  const filter = employeeListFilter(list, { active: true, category, group, companyId });
  const query = useEmployees({ ...filter, page: list.page, pageSize: list.pageSize }, open);
  const mutation = useMutation({
    mutationFn: () =>
      exportEmployees({ ...(mode === "filter" ? { filter } : { employeeIds }), sections }),
    onSuccess: ({ rows }) => {
      toast.success(`${rows} karyawan berhasil diekspor.`);
      setOpen(false);
    },
    onError: (error) => toast.error(error.message || "Ekspor karyawan gagal."),
  });
  const total = query.data?.meta.total;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setMode("filter");
          setEmployeeIds([]);
          setSections(["identity"]);
          setOpen(true);
        }}
      >
        <FileDown /> Ekspor
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!mutation.isPending) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ekspor data karyawan</DialogTitle>
            <DialogDescription>
              Pilih karyawan dan kelompok kolom untuk file Excel.
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={mutation.isPending} className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">Karyawan</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="export-mode"
                checked={mode === "filter"}
                onChange={() => setMode("filter")}
              />
              Sesuai filter halaman ini ({query.isFetching || total === undefined ? "…" : total}{" "}
              karyawan)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="export-mode"
                checked={mode === "ids"}
                onChange={() => setMode("ids")}
              />
              Pilih karyawan tertentu
            </label>
            {mode === "ids" ? (
              <>
                <EmployeePicker
                  active
                  selectedId={null}
                  selectedIds={employeeIds}
                  multiple
                  title="Pilih karyawan"
                  className="min-h-0 max-h-64"
                  onSelect={(id) =>
                    setEmployeeIds((prev) =>
                      prev.includes(id)
                        ? prev.filter((value) => value !== id)
                        : prev.length < 5000
                          ? [...prev, id]
                          : prev,
                    )
                  }
                />
                <p className="text-muted-foreground text-xs">
                  {employeeIds.length} karyawan dipilih (maksimal 5.000).
                </p>
              </>
            ) : null}
          </fieldset>
          <fieldset disabled={mutation.isPending} className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Kelompok kolom</legend>
            {SECTIONS.map(([section, label]) => {
              const personal = section === "personal" || section === "family";
              const denied =
                (personal && !access.readFamilyArchive(me)) ||
                (section === "bank" && !access.readBankArchive(me));
              return (
                <div key={section} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sections.includes(section)}
                      disabled={section === "identity" || denied}
                      onChange={(event) =>
                        setSections((prev) =>
                          event.target.checked
                            ? [...prev, section]
                            : prev.filter((value) => value !== section),
                        )
                      }
                    />
                    {label}
                  </label>
                  {denied ? (
                    <p className="text-muted-foreground pl-6 text-xs">
                      {personal ? "butuh izin baca data pribadi" : "butuh izin baca rekening"}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
          {mode === "filter" && total !== undefined && total > 5000 ? (
            <p className="text-destructive text-sm">
              Maksimal 5.000 karyawan; persempit filter halaman ini.
            </p>
          ) : null}
          {mode === "filter" && query.isError ? (
            <p role="alert" className="text-destructive text-sm">
              Jumlah karyawan gagal dimuat. Tutup dialog lalu coba lagi.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={
                mutation.isPending ||
                (mode === "ids"
                  ? employeeIds.length === 0
                  : query.isFetching || query.isError || total === undefined || total > 5000)
              }
              onClick={() => mutation.mutate()}
            >
              <FileDown />
              {mutation.isPending ? "Menyiapkan Excel…" : "Unduh Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
