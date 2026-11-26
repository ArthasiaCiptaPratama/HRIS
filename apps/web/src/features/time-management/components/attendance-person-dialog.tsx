import { useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { type AttendancePerson, useAttendanceHistory } from "../api";
import type { AttendanceDay } from "../schemas";
import { DayDetailBody } from "./attendance-day-detail";
import { scheduleLabel, workDateLabel } from "./display";
import { LoadMoreSentinel } from "./load-more-sentinel";

const daySubtitle = (d: AttendanceDay, tz: string) =>
  `${d.employee.employeeNumber ?? "—"} · ${
    d.shiftCode
      ? `Shift ${d.shiftCode} ${scheduleLabel(d.workDate, d.scheduledStart, d.scheduledEnd, tz)}`
      : "Tanpa jadwal"
  }${d.workLocation ? ` · ${d.workLocation.name}` : ""}`;

/**
 * TM-D33: riwayat absen satu karyawan, gaya sama dengan dialog detail hari. Mulai dari hari absen
 * terbaru; hari lebih lama dimuat otomatis saat digulir (jendela 14 hari) sampai absen pertamanya.
 */
export function AttendancePersonDialog({
  person,
  tz,
  canManual,
  onClose,
}: {
  person: AttendancePerson | null;
  tz: string;
  canManual: boolean;
  onClose: () => void;
}) {
  const history = useAttendanceHistory(person);
  const days = useMemo(() => history.data?.pages.flatMap((p) => p.days) ?? [], [history.data]);
  const newest = days[0];
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const forbidden = history.error instanceof ApiError && history.error.status === 403;
  return (
    <Dialog open={person !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {person
              ? `${person.fullName} · ${workDateLabel(newest?.workDate ?? person.lastWorkDate)}`
              : "Riwayat absen"}
          </DialogTitle>
          <DialogDescription>
            {newest ? daySubtitle(newest, tz) : person ? (person.employeeNumber ?? "—") : "Memuat…"}
          </DialogDescription>
        </DialogHeader>
        {history.isPending ? (
          <Skeleton className="h-80" />
        ) : history.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {forbidden
              ? "Riwayat absen karyawan ini tidak dapat dibuka dari cakupan Anda."
              : errorMessage(history.error)}
          </p>
        ) : days.length === 0 && !hasNextPage ? (
          <p className="text-muted-foreground text-sm">Belum ada absen yang tercatat.</p>
        ) : (
          <div className="space-y-6">
            {days.map((day, i) => (
              <section key={day.id} aria-label={`Absen ${workDateLabel(day.workDate)}`}>
                {i > 0 ? (
                  <div className="mb-3 border-t pt-4">
                    <h3 className="text-sm font-semibold">{workDateLabel(day.workDate)}</h3>
                    <p className="text-muted-foreground text-xs">{daySubtitle(day, tz)}</p>
                  </div>
                ) : null}
                <DayDetailBody day={day} tz={tz} canManual={canManual} />
              </section>
            ))}
            <LoadMoreSentinel
              hasMore={Boolean(hasNextPage)}
              loading={isFetchingNextPage}
              onLoad={loadMore}
              label="Muat hari lebih lama"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
