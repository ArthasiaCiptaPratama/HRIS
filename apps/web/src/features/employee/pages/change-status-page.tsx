import { EXIT_REASON_LABELS, EXIT_REASONS, type ExitReason } from "@hris/shared";
import { ArrowLeftRight, ArrowRight, Power, TriangleAlert, UserRoundSearch } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useChangeStatus, useDeactivateEmployee, useEmployee, useMasterData } from "../api";
import { ChoiceCard } from "../components/choice-card";
import { EmployeeAvatar } from "../components/employee-avatar";
import { EmployeePicker } from "../components/employee-picker";
import { StatusBadge } from "../components/status-badge";
import { tenure, todayIso } from "../labels";
import type { EmployeeDetail } from "../schemas";

const EXIT_HINTS: Record<ExitReason, string> = {
  RESIGNATION: "Karyawan mengajukan pengunduran diri.",
  TERMINATION: "Pemutusan hubungan kerja oleh perusahaan.",
  CONTRACT_ENDED: "Masa PKWT/magang selesai dan tidak diperpanjang.",
  RETIREMENT: "Mencapai usia pensiun.",
  DECEASED: "Karyawan meninggal dunia.",
  OTHER: "Alasan lain; jelaskan di catatan.",
};

export function ChangeStatusPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("pegawai");
  const action = params.get("aksi") === "nonaktif" ? "deactivate" : "status";
  const employee = useEmployee(selectedId, "work");

  const select = (id: string | null, nextAction = action) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("pegawai", id);
        else next.delete("pegawai");
        if (nextAction === "deactivate") next.set("aksi", "nonaktif");
        else next.delete("aksi");
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <PageHeader
        title="Ubah Status Karyawan"
        description="Ubah kategori kepegawaian (mis. PKWT menjadi Karyawan Tetap) atau nonaktifkan karyawan yang keluar. Setiap perubahan tercatat di riwayat dan audit log."
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <EmployeePicker
          active
          title="Karyawan aktif"
          selectedId={selectedId}
          onSelect={(id) => select(id)}
        />
        <section aria-label="Panel perubahan status" className="min-w-0">
          {!selectedId ? (
            <div className="bg-card grid h-full min-h-[420px] place-items-center rounded-2xl border border-dashed">
              <EmptyState
                icon={UserRoundSearch}
                title="Pilih karyawan terlebih dulu"
                description="Cari dan pilih karyawan di daftar sebelah kiri untuk mengubah status atau menonaktifkannya."
              />
            </div>
          ) : employee.isPending ? (
            <div className="bg-card space-y-5 rounded-2xl border p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="size-14 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
              </div>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : employee.isError ? (
            <div className="bg-card rounded-2xl border">
              <EmptyState
                icon={TriangleAlert}
                title="Gagal memuat karyawan"
                description={errorMessage(employee.error)}
              />
            </div>
          ) : !employee.data.isActive ? (
            <div className="bg-card rounded-2xl border">
              <EmptyState
                icon={Power}
                title={`${employee.data.fullName} sudah nonaktif`}
                description="Gunakan menu Pengaktifan Karyawan untuk mengaktifkan kembali."
              />
            </div>
          ) : (
            <ActionPanel
              key={employee.data.id}
              employee={employee.data}
              action={action}
              onActionChange={(next) => select(selectedId, next)}
              onDone={() => select(null, "status")}
            />
          )}
        </section>
      </div>
    </>
  );
}

function ActionPanel({
  employee,
  action,
  onActionChange,
  onDone,
}: {
  employee: EmployeeDetail;
  action: "status" | "deactivate";
  onActionChange: (action: "status" | "deactivate") => void;
  onDone: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Mobile/tablet: panel ada di bawah daftar karyawan → gulir ke panel setelah karyawan dipilih.
  useEffect(() => {
    if (window.matchMedia?.("(max-width: 1023px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);
  return (
    <div
      ref={panelRef}
      className="bg-card animate-fade-up scroll-mt-4 overflow-hidden rounded-2xl border"
    >
      <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:p-6">
        <EmployeeAvatar name={employee.fullName} photoUrl={employee.photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold tracking-tight">{employee.fullName}</p>
          <p className="text-muted-foreground truncate text-sm">
            <span className="font-mono text-xs">{employee.employeeNumber}</span> ·{" "}
            {employee.position.name}
            {employee.department ? ` · ${employee.department.name}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <StatusBadge
            name={employee.employmentStatus.name}
            category={employee.employmentStatus.category}
          />
          <span className="text-muted-foreground text-xs">
            Masuk {formatDate(employee.joinDate)} · {tenure(employee.joinDate)}
          </span>
        </div>
      </div>
      <Tabs
        value={action}
        onValueChange={(value) => onActionChange(value as "status" | "deactivate")}
        className="gap-0"
      >
        <TabsList className="px-5 sm:px-6">
          <TabsTrigger value="status">
            <ArrowLeftRight /> Ubah kategori
          </TabsTrigger>
          {employee.access.deactivate ? (
            <TabsTrigger value="deactivate" className="data-[state=active]:after:bg-destructive">
              <Power /> Nonaktifkan
            </TabsTrigger>
          ) : null}
        </TabsList>
        <div className="p-5 sm:p-6">
          <TabsContent value="status">
            <ChangeCategoryForm employee={employee} onDone={onDone} />
          </TabsContent>
          {employee.access.deactivate ? (
            <TabsContent value="deactivate">
              <DeactivateForm employee={employee} onDone={onDone} />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </div>
  );
}

function ChangeCategoryForm({
  employee,
  onDone,
}: {
  employee: EmployeeDetail;
  onDone: () => void;
}) {
  const master = useMasterData();
  const mutation = useChangeStatus();
  const [statusId, setStatusId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const target = master.data?.employmentStatuses.find((s) => s.id === statusId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!statusId) return;
    try {
      await mutation.mutateAsync({
        id: employee.id,
        employmentStatusId: statusId,
        effectiveDate,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(`Status ${employee.fullName} menjadi ${target?.name}.`);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-3">
        <Label>Status baru</Label>
        <div
          role="radiogroup"
          aria-label="Status baru"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {(master.data?.employmentStatuses ?? []).map((status) => {
            const current = status.id === employee.employmentStatus.id;
            return (
              <ChoiceCard
                key={status.id}
                selected={status.id === statusId}
                disabled={current}
                onSelect={() => setStatusId(status.id)}
                title={status.name}
                description={current ? "Status saat ini" : undefined}
              />
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="status-date">Tanggal efektif</Label>
          <Input
            id="status-date"
            type="date"
            required
            min={employee.joinDate}
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:row-span-2">
          <Label htmlFor="status-note">
            Catatan <span className="text-muted-foreground font-normal">(opsional)</span>
          </Label>
          <Textarea
            id="status-note"
            maxLength={500}
            rows={3}
            placeholder="Mis. nomor SK pengangkatan"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
      <div className="bg-muted/40 flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge
            name={employee.employmentStatus.name}
            category={employee.employmentStatus.category}
          />
          <ArrowRight className="text-muted-foreground size-4" aria-hidden />
          {target ? (
            <StatusBadge name={target.name} category={target.category} />
          ) : (
            <span className="text-muted-foreground">pilih status baru</span>
          )}
        </div>
        <Button type="submit" variant="brand" disabled={!statusId || mutation.isPending}>
          {mutation.isPending ? "Menyimpan…" : "Simpan perubahan"}
        </Button>
      </div>
    </form>
  );
}

function DeactivateForm({ employee, onDone }: { employee: EmployeeDetail; onDone: () => void }) {
  const mutation = useDeactivateEmployee();
  const [reason, setReason] = useState<ExitReason | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason || !confirmed) return;
    try {
      await mutation.mutateAsync({
        id: employee.id,
        effectiveDate,
        exitReason: reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(`${employee.fullName} dinonaktifkan.`);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-3">
        <Label>Alasan keluar</Label>
        <div
          role="radiogroup"
          aria-label="Alasan keluar"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {EXIT_REASONS.map((value) => (
            <ChoiceCard
              key={value}
              tone="destructive"
              selected={reason === value}
              onSelect={() => setReason(value)}
              title={EXIT_REASON_LABELS[value]}
              description={EXIT_HINTS[value]}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="exit-date">Tanggal efektif keluar</Label>
          <Input
            id="exit-date"
            type="date"
            required
            min={employee.joinDate}
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:row-span-2">
          <Label htmlFor="exit-note">
            Catatan <span className="text-muted-foreground font-normal">(opsional)</span>
          </Label>
          <Textarea
            id="exit-note"
            maxLength={500}
            rows={3}
            placeholder="Mis. nomor surat resign"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>Yang akan terjadi</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Karyawan pindah ke Data Karyawan Tidak Aktif (data tetap diarsip).</li>
            {employee.account?.isActive ? (
              <li>Akun loginnya ikut dinonaktifkan dan tidak bisa masuk lagi.</li>
            ) : null}
            <li>Bawahan langsung perlu diberi atasan baru secara terpisah.</li>
          </ul>
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-destructive size-4"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Saya yakin menonaktifkan {employee.fullName}
        </label>
        <Button
          type="submit"
          variant="destructive"
          disabled={!reason || !confirmed || mutation.isPending}
        >
          <Power /> {mutation.isPending ? "Memproses…" : "Nonaktifkan karyawan"}
        </Button>
      </div>
    </form>
  );
}
