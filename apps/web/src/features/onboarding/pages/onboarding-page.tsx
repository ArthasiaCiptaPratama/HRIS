import { ONBOARDING_STATUS_LABELS, ONBOARDING_STATUSES, type OnboardingStatus } from "@hris/shared";
import { createColumnHelper } from "@tanstack/react-table";
import {
  ClipboardCheck,
  FileUp,
  MailPlus,
  RotateCcw,
  SearchX,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { type DataColumn, DataTable, type tableFeaturesNone } from "@/components/data-table";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { TablePagination } from "@/components/table-pagination";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/features/auth/api";
import { useEmployee } from "@/features/employee/api";
import { EmployeePicker } from "@/features/employee/components/employee-picker";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useInviteExisting,
  useOnboardingCandidates,
  useProcessInvitations,
  useResendInvitation,
  useRestoreOnboarding,
} from "../api";
import type { OnboardingCandidateRow } from "../schemas";

// D-045 bagian a: Administrasi › Penerimaan Karyawan Baru — daftar calon per status + undangan.

const column = createColumnHelper<typeof tableFeaturesNone, OnboardingCandidateRow>();
const col = (def: Parameters<typeof column.display>[0]) =>
  column.display(def) as DataColumn<OnboardingCandidateRow>;

/** Tab yang ditampilkan (Disetujui hanya relevan untuk karyawan terdaftar yang diundang). */
const TABS: (OnboardingStatus | "ALL")[] = ["ALL", ...ONBOARDING_STATUSES];

const STATUS_VARIANT: Record<OnboardingStatus, "muted" | "warning" | "success" | "brand"> = {
  NOT_INVITED: "muted",
  INVITED: "brand",
  FILLING: "warning",
  SUBMITTED: "warning",
  REVISION_REQUESTED: "warning",
  APPROVED: "success",
  CANCELLED: "muted",
};

const INVITE_ERROR: Record<string, string> = {
  INVITE_FAILED: "gagal dikirim",
  EMAIL_HAS_ACCOUNT: "email sudah dipakai akun lain",
  EMPLOYEE_HAS_ACCOUNT: "sudah punya akun",
};

export function OnboardingPage() {
  const me = useMe().data;
  const canReview = me ? access.reviewOnboarding(me) : false;
  const [tab, setTab] = useState<OnboardingStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [inviteOpen, setInviteOpen] = useState(false);
  const list = useOnboardingCandidates({
    status: tab === "ALL" ? undefined : tab,
    q,
    page,
    pageSize,
  });
  const process = useProcessInvitations();
  const resend = useResendInvitation();
  const restore = useRestoreOnboarding();
  const [restoreTarget, setRestoreTarget] = useState<OnboardingCandidateRow | null>(null);
  const onRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restore.mutateAsync(restoreTarget.id);
      toast.success(`Penerimaan ${restoreTarget.fullName} dipulihkan.`);
      setRestoreTarget(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const counts = list.data?.meta.counts;
  const total = list.data?.meta.total ?? 0;
  const queuedOnPage = (list.data?.data ?? []).some((r) => r.invitation?.status === "QUEUED");

  const onProcess = async () => {
    try {
      const result = await process.mutateAsync();
      toast.success(
        `${result.sent} undangan terkirim${result.failed ? `, ${result.failed} gagal` : ""}.${
          result.remaining ? ` Sisa antrean ${result.remaining}.` : ""
        }`,
        result.rateLimited
          ? { description: "Batas kirim per jam tercapai; sisa dikirim nanti otomatis." }
          : undefined,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const onResend = async (row: OnboardingCandidateRow) => {
    try {
      await resend.mutateAsync(row.id);
      toast.success(`Undangan untuk ${row.fullName} masuk antrean.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns: DataColumn<OnboardingCandidateRow>[] = [
    col({
      id: "name",
      header: "Calon",
      meta: { className: "min-w-[220px]" },
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.fullName}</p>
          <p className="text-muted-foreground font-mono text-xs">{row.original.employeeNumber}</p>
        </div>
      ),
    }),
    col({
      id: "email",
      header: "Email",
      meta: { className: "min-w-[200px] text-muted-foreground" },
      cell: ({ row }) => row.original.email ?? "—",
    }),
    col({
      id: "joinDate",
      header: "Tanggal masuk",
      meta: { className: "whitespace-nowrap tabular-nums" },
      cell: ({ row }) => formatDate(row.original.joinDate),
    }),
    col({
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={STATUS_VARIANT[row.original.onboardingStatus]}>
            {ONBOARDING_STATUS_LABELS[row.original.onboardingStatus]}
          </Badge>
          {row.original.completionRequired ? (
            <Badge variant="secondary">Lengkapi data</Badge>
          ) : null}
          {row.original.cancellation ? (
            <span className="text-muted-foreground w-full text-xs">
              {daysLeftLabel(row.original.cancellation.restorableUntil)}
            </span>
          ) : null}
        </div>
      ),
    }),
    col({
      id: "invitation",
      header: "Undangan",
      meta: { className: "whitespace-nowrap text-sm" },
      cell: ({ row }) => {
        const inv = row.original.invitation;
        if (row.original.account?.hasLoggedIn) return <span>Sudah login</span>;
        if (!inv) return <span className="text-muted-foreground">Belum dikirim</span>;
        if (inv.status === "QUEUED") return <span>Dalam antrean</span>;
        if (inv.status === "FAILED")
          return (
            <span className="text-destructive">
              Gagal{inv.errorCode ? ` (${INVITE_ERROR[inv.errorCode] ?? inv.errorCode})` : ""}
            </span>
          );
        return (
          <span className="text-muted-foreground">
            Terkirim {inv.sentAt ? formatDate(inv.sentAt) : ""}
          </span>
        );
      },
    }),
    col({
      id: "actions",
      header: () => <span className="sr-only">Aksi</span>,
      meta: { className: "text-right" },
      cell: ({ row }) => {
        const r = row.original;
        // D-045 c: review — data yang sudah/pernah diisi (Menunggu review, Perlu revisi, lengkapi data).
        const reviewable =
          canReview &&
          (["FILLING", "SUBMITTED", "REVISION_REQUESTED"].includes(r.onboardingStatus) ||
            (r.onboardingStatus === "APPROVED" && r.completionRequired));
        const reviewLink = reviewable ? (
          <Button
            size="sm"
            variant={r.onboardingStatus === "SUBMITTED" ? "default" : "outline"}
            asChild
          >
            <Link to={`/penerimaan/${r.id}`}>
              <ClipboardCheck /> {r.onboardingStatus === "SUBMITTED" ? "Periksa" : "Lihat data"}
            </Link>
          </Button>
        ) : null;
        const canInvite =
          !r.account?.hasLoggedIn &&
          r.invitation?.status !== "QUEUED" &&
          (r.onboardingStatus === "NOT_INVITED" ||
            r.onboardingStatus === "INVITED" ||
            (r.onboardingStatus === "APPROVED" && r.completionRequired));
        // D-045 d: pulihkan penerimaan yang dibatalkan (≤ 30 hari, SA / HR + grant review).
        if (r.cancellation && canReview && daysLeft(r.cancellation.restorableUntil) > 0) {
          return (
            <Button size="sm" variant="outline" onClick={() => setRestoreTarget(r)}>
              <RotateCcw /> Pulihkan
            </Button>
          );
        }
        if (!canInvite) return reviewLink;
        return (
          <div className="flex justify-end gap-2">
            {reviewLink}
            <Button
              size="sm"
              variant="outline"
              disabled={resend.isPending}
              onClick={() => onResend(r)}
            >
              <Send /> {r.onboardingStatus === "NOT_INVITED" ? "Undang" : "Kirim ulang"}
            </Button>
          </div>
        );
      },
    }),
  ];

  return (
    <div>
      <PageHeader
        title="Penerimaan Karyawan Baru"
        description="Impor calon dari portal, pilih yang lolos, kirim undangan aktivasi. Calon tampil di Data Karyawan setelah datanya disetujui."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              <UserPlus /> Undang Karyawan Terdaftar
            </Button>
            <Button variant="brand" asChild>
              <Link to="/penerimaan/impor">
                <FileUp /> Impor calon
              </Link>
            </Button>
          </div>
        }
      />
      <nav aria-label="Status onboarding" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((key) => {
          const count =
            key === "ALL"
              ? Object.values(counts ?? {}).reduce((sum, n) => sum + n, 0)
              : (counts?.[key] ?? 0);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => {
                setTab(key);
                setPage(1);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                tab === key
                  ? "border-foreground bg-foreground text-background"
                  : "hover:bg-muted text-muted-foreground",
              )}
            >
              {key === "ALL" ? "Semua" : ONBOARDING_STATUS_LABELS[key]}{" "}
              <span className="tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
      </nav>
      {queuedOnPage ? (
        <div className="bg-muted/60 mb-4 flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>Ada undangan dalam antrean. Antrean juga dikirim otomatis sekali sehari.</span>
          <Button size="sm" onClick={onProcess} disabled={process.isPending}>
            <MailPlus /> {process.isPending ? "Mengirim…" : "Kirim antrean sekarang"}
          </Button>
        </div>
      ) : null}
      <ListPanel
        toolbar={
          <SearchField
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Cari nama, NIP, email…"
            aria-label="Cari calon"
          />
        }
        footer={
          total > 0 ? (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          ) : null
        }
      >
        <DataTable
          label="Daftar calon karyawan"
          columns={columns}
          data={list.data?.data ?? []}
          loading={list.isPending}
          fetching={list.isFetching}
          skeletonAvatar={false}
          empty={
            list.isError
              ? { icon: SearchX, title: "Gagal memuat data", description: errorMessage(list.error) }
              : {
                  icon: UserPlus,
                  title: q ? "Tidak ada yang cocok" : "Belum ada calon",
                  description: "Mulai dengan Impor calon dari file portal (CSV/Excel).",
                }
          }
        />
      </ListPanel>
      <InviteExistingDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pulihkan penerimaan</DialogTitle>
            <DialogDescription>
              {restoreTarget?.fullName} kembali ke status sebelum dibatalkan dan akunnya aktif lagi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestoreTarget(null)}>
              Batal
            </Button>
            <Button variant="brand" disabled={restore.isPending} onClick={onRestore}>
              Pulihkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// D-045 d: calon batal dihapus permanen setelah 30 hari kecuali dipulihkan.
function daysLeft(untilIso: string): number {
  return Math.ceil((new Date(untilIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
function daysLeftLabel(untilIso: string): string {
  const days = daysLeft(untilIso);
  return days > 0 ? `Dihapus permanen dalam ${days} hari` : "Menunggu dihapus permanen";
}

// ── Undang karyawan terdaftar (D-045 poin 9) ──────────────────────────────────────────────────────

function InviteExistingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invite = useInviteExisting();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [items, setItems] = useState<{ employeeId: string; name: string; email: string }[]>([]);
  const selected = useEmployee(selectedId, "work", open && Boolean(selectedId));

  // Karyawan yang sudah punya akun login tidak perlu diundang (API juga melewatinya).
  const hasAccount = Boolean(selected.data?.account);
  const add = () => {
    const value = email.trim().toLowerCase();
    if (!selectedId || !selected.data || hasAccount) return;
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      toast.error("Email tidak valid.");
      return;
    }
    if (items.some((i) => i.employeeId === selectedId)) {
      toast.error("Karyawan ini sudah ada di daftar.");
      return;
    }
    setItems((list) => [
      ...list,
      { employeeId: selectedId, name: selected.data.fullName, email: value },
    ]);
    setSelectedId(null);
    setEmail("");
  };

  const submit = async () => {
    try {
      const result = await invite.mutateAsync(
        items.map(({ employeeId, email: e }) => ({ employeeId, email: e })),
      );
      toast.success(`${result.queued} undangan masuk antrean.`, {
        ...(result.skipped.length
          ? { description: result.skipped.map((s) => s.message).join(" ") }
          : {}),
      });
      setItems([]);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Footer selalu terlihat: hanya isi dialog yang bergulir. */}
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Undang Karyawan Terdaftar</DialogTitle>
          <DialogDescription>
            Untuk karyawan aktif yang belum punya akun login. Pilih karyawan, isi email pribadinya,
            lalu tambahkan ke daftar. Setelah aktivasi, mereka diminta melengkapi data yang masih
            kosong; data mereka tetap tampil sebagai karyawan aktif.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-6">
          <EmployeePicker
            active
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setEmail("");
            }}
            title="Pilih karyawan"
            className="max-h-72 min-h-0"
          />
          {selectedId && hasAccount ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
              {selected.data?.fullName} sudah punya akun login — tidak perlu diundang.
            </p>
          ) : null}
          {selectedId && !hasAccount ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="invite-existing-email">
                  Email pribadi {selected.data ? `— ${selected.data.fullName}` : ""}
                </Label>
                <Input
                  id="invite-existing-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@gmail.com"
                />
              </div>
              <Button type="button" variant="outline" onClick={add} disabled={!selected.data}>
                Tambah ke daftar
              </Button>
            </div>
          ) : null}
          {items.length > 0 ? (
            <ul className="divide-y rounded-lg border text-sm" aria-label="Akan diundang">
              {items.map((item) => (
                <li
                  key={item.employeeId}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span>
                    <span className="font-medium">{item.name}</span>{" "}
                    <span className="text-muted-foreground">{item.email}</span>
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Hapus ${item.name}`}
                    onClick={() =>
                      setItems((list) => list.filter((i) => i.employeeId !== item.employeeId))
                    }
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            variant="brand"
            onClick={submit}
            disabled={items.length === 0 || invite.isPending}
          >
            Undang {items.length > 0 ? `${items.length} karyawan` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
