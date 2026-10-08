import { DATA_CHANGE_STATUS_LABELS, type DataChangeStatus } from "@hris/shared";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FIELD_LABELS, formatValue, memberLine } from "../labels";
import type { DataChangeDetail } from "../schemas";

// D-054 / OD-6: perbandingan data sekarang vs usulan (pemeriksa & pemilik).

const STATUS_VARIANT: Record<DataChangeStatus, "warning" | "success" | "destructive" | "muted"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "muted",
};

export function StatusBadge({ status }: { status: DataChangeStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{DATA_CHANGE_STATUS_LABELS[status]}</Badge>;
}

export function ChangeComparison({ detail }: { detail: DataChangeDetail }) {
  const proposed = detail.proposed ?? {};
  const current = detail.current ?? {};
  const currentLabel = detail.status === "PENDING" ? "Sekarang" : "Sebelumnya";
  if (detail.section === "FAMILY") {
    const lines = (value: unknown) =>
      Array.isArray(value) && value.length > 0
        ? (value as Record<string, unknown>[]).map(memberLine)
        : ["—"];
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          [currentLabel, lines(current.members)],
          ["Usulan", lines(proposed.members)],
        ].map(([title, items]) => (
          <div key={title as string} className="rounded-lg border p-3">
            <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">{title}</p>
            <ul className="space-y-1 text-sm">
              {(items as string[]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }
  if (detail.section === "DOCUMENT") {
    return (
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {["documentNumber", "issuedAt", "expiresAt", "note"].map((key) => (
          <div key={key}>
            <dt className="text-muted-foreground text-xs">{FIELD_LABELS[key]}</dt>
            <dd>{formatValue(key, proposed[key])}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <table className="w-full text-sm" aria-label="Perbandingan data">
      <thead>
        <tr className="text-muted-foreground text-left text-xs">
          <th className="py-1.5 pr-3 font-medium">Data</th>
          <th className="py-1.5 pr-3 font-medium">{currentLabel}</th>
          <th className="py-1.5 font-medium">Usulan</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {Object.keys(proposed).map((key) => (
          <tr key={key}>
            <td className="text-muted-foreground py-2 pr-3 align-top text-xs">
              {FIELD_LABELS[key] ?? key}
            </td>
            <td className="py-2 pr-3 align-top break-words">{formatValue(key, current[key])}</td>
            <td className="py-2 align-top font-medium break-words">
              {formatValue(key, proposed[key])}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AttachmentLink({ document }: { document: DataChangeDetail["document"] }) {
  if (!document) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
      <span>
        Lampiran: <span className="font-medium">{document.name}</span>
      </span>
      {document.url ? (
        <Button size="sm" variant="outline" asChild>
          <a href={document.url} target="_blank" rel="noopener noreferrer">
            <Eye /> Lihat
          </a>
        </Button>
      ) : (
        <span className="text-muted-foreground text-xs">File tidak tersedia</span>
      )}
    </div>
  );
}
