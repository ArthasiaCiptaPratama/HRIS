import { ASSIGNMENT_OUTCOME_LABELS } from "@hris/shared";
import { CheckCheck, HardHat, Laptop, Loader2, PackageCheck, PackageX, Undo2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useAssetHoldings, useAssetMutations, useSelfAssets } from "../api";
import type { AssetAssignment, AssetHoldings, PpeIssue } from "../schemas";
import { BastButtons, LostAssetDialog, ReturnAssetDialog, ReturnPpeDialog } from "./asset-actions";
import { AckBadge, ConditionBadge, LoanBadge, ReplacementBadge } from "./display";

// ARS-D1–D6: daftar aset & APD yang dipegang satu karyawan — tab "Aset" di detail karyawan, Layanan
// Mandiri › Aset saya (konfirmasi terima), dan dialog nonaktifkan (openOnly). Tanpa harga.

type Mode = "manage" | "self" | "exit";

function Row({
  icon,
  title,
  meta,
  badges,
  actions,
}: {
  icon: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="bg-muted text-muted-foreground mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg">
          {icon}
        </span>
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium">{title}</p>
          <div className="text-muted-foreground text-xs">{meta}</div>
          {badges ? <div className="flex flex-wrap items-center gap-1.5">{badges}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
    </li>
  );
}

export function HoldingsList({ holdings, mode }: { holdings: AssetHoldings; mode: Mode }) {
  const { acknowledge, acknowledgePpe } = useAssetMutations();
  const [returning, setReturning] = useState<AssetAssignment | null>(null);
  const [losing, setLosing] = useState<AssetAssignment | null>(null);
  const [returningPpe, setReturningPpe] = useState<PpeIssue | null>(null);
  const manage = mode !== "self" && holdings.canManage;
  const employeeId = holdings.employee?.employeeId ?? "";
  const ack = async (run: () => Promise<unknown>) => {
    try {
      await run();
      toast.success("Terima kasih, penerimaan dikonfirmasi.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const open = holdings.assets.filter((a) => !a.closedAt);
  const closed = holdings.assets.filter((a) => a.closedAt);

  if (holdings.assets.length === 0 && holdings.ppe.length === 0) {
    return (
      <EmptyState
        icon={PackageCheck}
        title={mode === "exit" ? "Tidak ada aset yang belum kembali" : "Belum ada aset atau APD"}
        description={
          mode === "self" ? "Aset & APD yang diserahkan kepada Anda tampil di sini." : undefined
        }
      />
    );
  }

  const assetRow = (a: AssetAssignment) => (
    <Row
      key={a.id}
      icon={<Laptop className="size-4" />}
      title={a.asset ? `${a.asset.name} · ${a.asset.code}` : "Aset"}
      meta={
        <>
          {a.asset?.category.name} · diserahkan {formatDate(a.assignedAt)}
          {a.dueBackAt ? ` · kembali paling lambat ${formatDate(a.dueBackAt)}` : ""}
          {a.closedAt
            ? ` · ${ASSIGNMENT_OUTCOME_LABELS[a.outcome ?? "RETURNED"].toLowerCase()} ${formatDate(a.closedAt)}`
            : ""}
        </>
      }
      badges={
        <>
          <ConditionBadge
            condition={a.closedAt ? (a.conditionIn ?? a.conditionOut) : a.conditionOut}
          />
          <LoanBadge state={a.loanState} />
          {a.closedAt ? (
            <Badge variant={a.outcome === "LOST" ? "destructive" : "muted"}>
              {ASSIGNMENT_OUTCOME_LABELS[a.outcome ?? "RETURNED"]}
            </Badge>
          ) : (
            <AckBadge at={a.acknowledgedAt} />
          )}
        </>
      }
      actions={
        mode === "self" ? (
          !a.closedAt && !a.acknowledgedAt ? (
            <Button
              size="sm"
              onClick={() => ack(() => acknowledge.mutateAsync({ id: a.id, body: {} }))}
              disabled={acknowledge.isPending}
            >
              {acknowledge.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />} Sudah
              saya terima
            </Button>
          ) : null
        ) : (
          <>
            {!a.closedAt && manage ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setReturning(a)}>
                  <Undo2 /> Kembalikan
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setLosing(a)}
                >
                  <PackageX /> Hilang
                </Button>
              </>
            ) : null}
            {mode === "manage" ? (
              <BastButtons
                employeeId={employeeId}
                target={{ assignmentId: a.id, kind: a.closedAt ? "RETURN" : "HANDOVER" }}
                attachedId={a.closedAt ? a.returnDocumentId : a.handoverDocumentId}
                canManage={manage}
              />
            ) : null}
          </>
        )
      }
    />
  );

  const ppeRow = (p: PpeIssue) => (
    <Row
      key={p.id}
      icon={<HardHat className="size-4" />}
      title={`${p.ppeType.name} × ${p.quantity}${p.size ? ` · ukuran ${p.size}` : ""}`}
      meta={
        <>
          diterima {formatDate(p.issuedAt)}
          {p.replacementDue ? ` · ganti ${formatDate(p.replacementDue)}` : ""}
          {p.ppeType.mustReturn
            ? p.returnedAt
              ? ` · dikembalikan ${formatDate(p.returnedAt)}`
              : " · wajib dikembalikan saat keluar"
            : ""}
        </>
      }
      badges={
        <>
          {p.replacementState === "NONE" ? null : <ReplacementBadge issue={p} />}
          <AckBadge at={p.acknowledgedAt} />
        </>
      }
      actions={
        mode === "self" ? (
          !p.acknowledgedAt ? (
            <Button
              size="sm"
              onClick={() => ack(() => acknowledgePpe.mutateAsync({ id: p.id, body: {} }))}
              disabled={acknowledgePpe.isPending}
            >
              <CheckCheck /> Sudah saya terima
            </Button>
          ) : null
        ) : (
          <>
            {manage && p.ppeType.mustReturn && !p.returnedAt ? (
              <Button size="sm" variant="outline" onClick={() => setReturningPpe(p)}>
                <Undo2 /> Kembalikan
              </Button>
            ) : null}
            {mode === "manage" ? (
              <BastButtons
                employeeId={employeeId}
                target={{ ppeIssueId: p.id }}
                attachedId={p.handoverDocumentId}
                canManage={manage}
              />
            ) : null}
          </>
        )
      }
    />
  );

  return (
    <div className="space-y-6">
      {open.length > 0 || mode !== "exit" ? (
        <section>
          <h3 className="text-sm font-semibold">Aset dipegang ({open.length})</h3>
          {open.length ? (
            <ul className="divide-y">{open.map(assetRow)}</ul>
          ) : (
            <p className="text-muted-foreground py-3 text-sm">Tidak ada.</p>
          )}
        </section>
      ) : null}
      {holdings.ppe.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold">
            {mode === "exit" ? "APD wajib kembali" : "APD & seragam"} ({holdings.ppe.length})
          </h3>
          <ul className="divide-y">{holdings.ppe.map(ppeRow)}</ul>
        </section>
      ) : null}
      {closed.length > 0 && mode !== "exit" ? (
        <section>
          <h3 className="text-muted-foreground text-sm font-semibold">
            Riwayat aset ({closed.length})
          </h3>
          <ul className="divide-y">{closed.map(assetRow)}</ul>
        </section>
      ) : null}
      <ReturnAssetDialog assignment={returning} onClose={() => setReturning(null)} />
      <LostAssetDialog assignment={losing} onClose={() => setLosing(null)} />
      <ReturnPpeDialog issue={returningPpe} onClose={() => setReturningPpe(null)} />
    </div>
  );
}

/** Tab "Aset" di detail karyawan. */
export function EmployeeAssetsTab({ employeeId }: { employeeId: string }) {
  const query = useAssetHoldings(employeeId);
  if (query.isPending) return <Skeleton className="h-40" />;
  if (query.isError || !query.data) {
    return (
      <EmptyState
        icon={PackageX}
        title="Aset tidak dapat dimuat"
        description={errorMessage(query.error)}
      />
    );
  }
  return <HoldingsList holdings={query.data} mode="manage" />;
}

/** Layanan Mandiri › Aset saya (ARS-D2: konfirmasi terima). */
export function MyAssets() {
  const query = useSelfAssets();
  if (query.isPending) return <Skeleton className="h-40" />;
  if (query.isError || !query.data) {
    return (
      <EmptyState
        icon={PackageX}
        title="Aset tidak dapat dimuat"
        description={errorMessage(query.error)}
      />
    );
  }
  return <HoldingsList holdings={query.data} mode="self" />;
}

/** ARS-D6: daftar aset & APD wajib kembali di dialog/halaman nonaktifkan (peringatan, tidak memblokir). */
export function OpenHoldingsWarning({ employeeId }: { employeeId: string }) {
  const query = useAssetHoldings(employeeId, true);
  if (query.isPending || query.isError || !query.data) return null;
  const count = query.data.assets.length + query.data.ppe.length;
  if (count === 0) return null;
  return (
    <div className="border-warning bg-warning-soft/40 rounded-xl border p-4">
      <p className="text-sm font-medium">{count} aset/APD belum dikembalikan</p>
      <p className="text-muted-foreground mb-2 text-xs">
        Nonaktifkan tetap bisa dilanjutkan. Yang dibiarkan masuk daftar "Belum kembali dari karyawan
        keluar" dan pengelola aset mendapat pengingat.
      </p>
      <HoldingsList holdings={query.data} mode="exit" />
    </div>
  );
}
