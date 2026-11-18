import { ATTENDANCE_LABEL_TEXT } from "@hris/shared";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { FormSelect } from "@/components/form-select";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { type SelfReportCrew, useSelfReportCrews, useSetSelfReportCrew } from "../self-report-api";
import { useRosterCompany } from "./roster-page";

// ════════════════════════════════════════════════════════════════════════════════════════════
// TM-D29 — ABSEN MANDIRI (STAGING). HR/SA memilih crew yang anggotanya boleh absen mandiri dari HP.
// Hapus file ini + route/menu/flag `tmSelfReport` saat fitur dicabut
// (docs/features/time-management/tm-d29-absen-mandiri.md).
// ════════════════════════════════════════════════════════════════════════════════════════════

export function SelfReportPage() {
  const { companies, companyId, setCompanyId } = useRosterCompany();
  const crews = useSelfReportCrews(companyId || undefined);
  const setCrew = useSetSelfReportCrew();

  const toggle = (crew: SelfReportCrew) =>
    setCrew.mutate(
      { crewId: crew.crewId, enabled: !crew.enabled },
      {
        onSuccess: (saved) =>
          toast.success(
            saved.enabled
              ? `Absen mandiri diizinkan untuk crew ${saved.crewName}.`
              : `Izin absen mandiri crew ${saved.crewName} dicabut.`,
          ),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <div>
      <PageHeader
        title="Absen Mandiri"
        description="Anggota crew yang diizinkan dapat mengisi sendiri jam masuk & pulang dari HP untuk tanggal mana pun, dengan foto dari galeri dan lokasi GPS HP. Absen tetap menunggu persetujuan atasan & HR."
        actions={
          companies.length > 1 ? (
            <FormSelect
              aria-label="Perusahaan"
              className="h-9 w-56"
              value={companyId}
              onChange={setCompanyId}
              placeholder="Pilih perusahaan"
              options={companies.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
            />
          ) : null
        }
      />
      <Alert className="mb-4">
        <AlertTitle>Fitur sementara (staging)</AlertTitle>
        <AlertDescription>
          Setiap absen mandiri diberi label “{ATTENDANCE_LABEL_TEXT.SELF_REPORT}” dan “
          {ATTENDANCE_LABEL_TEXT.GALLERY_PHOTO}” di Data Absen Harian sehingga bisa dibedakan dari
          absen selfie & GPS langsung.
        </AlertDescription>
      </Alert>
      {!companyId ? (
        <EmptyState icon={Smartphone} title="Belum ada perusahaan dalam cakupan akun ini" />
      ) : crews.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : crews.isError ? (
        <EmptyState
          icon={Smartphone}
          title="Gagal memuat crew"
          description={errorMessage(crews.error)}
        />
      ) : (crews.data ?? []).length === 0 ? (
        <EmptyState icon={Smartphone} title="Belum ada crew di perusahaan ini" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Crew</TableHead>
              <TableHead>Anggota aktif</TableHead>
              <TableHead>Absen mandiri</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(crews.data ?? []).map((crew) => (
              <TableRow key={crew.crewId}>
                <TableCell className="font-medium">{crew.crewName}</TableCell>
                <TableCell>{crew.activeMembers}</TableCell>
                <TableCell>
                  {crew.enabled ? <Badge>Diizinkan</Badge> : <Badge variant="outline">Tidak</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={crew.enabled ? "outline" : "default"}
                    disabled={setCrew.isPending}
                    onClick={() => toggle(crew)}
                  >
                    {crew.enabled ? "Cabut izin" : "Izinkan"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
