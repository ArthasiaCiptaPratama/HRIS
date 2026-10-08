import { Building2, Mail, MapPin, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { useOrgPersonCard } from "../api";
import { EmployeeAvatar } from "../components/employee-avatar";

// D-051: kartu profil kerja (kolom direktori PLAN §4.3) untuk role yang tidak membuka detail lengkap.

export function PersonCardDialog({
  personId,
  onClose,
}: {
  personId: string | null;
  onClose: () => void;
}) {
  const card = useOrgPersonCard(personId);
  return (
    <Dialog open={personId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {card.isPending ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
            <DialogTitle className="sr-only">Memuat profil</DialogTitle>
          </div>
        ) : card.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <TriangleAlert className="text-muted-foreground size-6" aria-hidden />
            <DialogTitle className="text-base">Profil tidak dapat ditampilkan</DialogTitle>
            <DialogDescription>{errorMessage(card.error)}</DialogDescription>
          </div>
        ) : (
          <>
            <DialogHeader className="items-center text-center">
              <EmployeeAvatar name={card.data.fullName} photoUrl={card.data.photoUrl} size="2xl" />
              <DialogTitle className="mt-3 text-lg">{card.data.fullName}</DialogTitle>
              <DialogDescription>
                {card.data.position}
                {card.data.department ? ` · ${card.data.department}` : ""}
              </DialogDescription>
            </DialogHeader>
            <dl className="divide-y rounded-xl border text-sm">
              <Row icon={Building2} label="Perusahaan">
                {card.data.company.code} · {card.data.company.name}
              </Row>
              <Row icon={MapPin} label="Lokasi kerja">
                {card.data.workLocation ?? "—"}
              </Row>
              <Row icon={Mail} label="Email kantor">
                {card.data.workEmail ? (
                  <a className="text-brand hover:underline" href={`mailto:${card.data.workEmail}`}>
                    {card.data.workEmail}
                  </a>
                ) : (
                  "—"
                )}
              </Row>
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Mail;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-2.5">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="truncate">{children}</dd>
      </div>
    </div>
  );
}
