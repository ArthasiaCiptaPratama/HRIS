import { DATA_CHANGE_SECTION_LABELS, type DataChangeSection } from "@hris/shared";
import {
  CircleUser,
  Clock,
  FileText,
  HeartHandshake,
  History,
  Landmark,
  Pencil,
  Phone,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCancelDataChange, useMyData, useMyDataChanges } from "@/features/data-changes/api";
import { StatusBadge } from "@/features/data-changes/components/change-comparison";
import { DataChangeDialog } from "@/features/data-changes/components/change-dialog";
import { FIELD_LABELS, formatValue, memberLine } from "@/features/data-changes/labels";
import type { MyData } from "@/features/data-changes/schemas";
import { useEmployeeDocuments } from "@/features/documents/api";
import { ExpiryBadge, openDocument } from "@/features/documents/components/documents-tab";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";

// D-045 c + D-054 / OD-6 (Arsip 1c): Layanan Mandiri — data diri & pengajuan perubahan (berlaku setelah
// disetujui HR), dokumen saya, riwayat pengajuan. Absensi, cuti, slip gaji menyusul (Fase 5–6).

const PERSONAL_SHOWN = [
  "ktpNumber",
  "kkNumber",
  "birthPlace",
  "birthDate",
  "religion",
  "maritalStatus",
  "ktpAddress",
  "domicileAddress",
  "originCity",
  "phoneNumber",
  "npwpNumber",
  "bpjsEmploymentNumber",
  "bpjsHealthNumber",
];

export function EssPage() {
  const mine = useMyData();
  const [section, setSection] = useState<DataChangeSection | null>(null);
  return (
    <div>
      <PageHeader
        title="Layanan Mandiri"
        description="Lihat data diri Anda dan ajukan perubahan — data baru berlaku setelah disetujui HR. Absensi, cuti, dan slip gaji menyusul."
      />
      {mine.isPending ? (
        <Skeleton className="h-64" />
      ) : mine.isError || !mine.data ? (
        <EmptyState
          icon={CircleUser}
          title="Data karyawan tidak tersedia"
          description={mine.isError ? errorMessage(mine.error) : undefined}
        />
      ) : (
        <Tabs defaultValue="data" className="gap-6">
          <TabsList>
            <TabsTrigger value="data">
              <CircleUser /> Data saya
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText /> Dokumen saya
            </TabsTrigger>
            <TabsTrigger value="requests">
              <History /> Riwayat pengajuan
            </TabsTrigger>
          </TabsList>
          <TabsContent value="data">
            <MyDataCards data={mine.data} onChange={setSection} />
          </TabsContent>
          <TabsContent value="documents">
            <MyDocuments data={mine.data} onUpload={() => setSection("DOCUMENT")} />
          </TabsContent>
          <TabsContent value="requests">
            <MyRequests />
          </TabsContent>
          <DataChangeDialog section={section} data={mine.data} onClose={() => setSection(null)} />
        </Tabs>
      )}
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  section,
  data,
  onChange,
  children,
}: {
  title: string;
  icon: typeof CircleUser;
  section: DataChangeSection;
  data: MyData;
  onChange: (section: DataChangeSection) => void;
  children: ReactNode;
}) {
  const pending = data.pendingSections.includes(section);
  return (
    <section className="bg-card rounded-xl border p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="text-muted-foreground size-4" aria-hidden /> {title}
        </h2>
        {pending ? (
          <Badge variant="warning">
            <Clock /> Menunggu persetujuan
          </Badge>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onChange(section)}>
            <Pencil /> Ajukan perubahan
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function Fields({ value, keys }: { value: Record<string, unknown>; keys: string[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {keys.map((key) => (
        <div key={key} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{FIELD_LABELS[key]}</dt>
          <dd className="text-sm break-words">{formatValue(key, value[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

function MyDataCards({
  data,
  onChange,
}: {
  data: MyData;
  onChange: (section: DataChangeSection) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <Card
          title="Data pribadi"
          icon={CircleUser}
          section="PERSONAL"
          data={data}
          onChange={onChange}
        >
          <Fields value={data.personal} keys={PERSONAL_SHOWN} />
        </Card>
      </div>
      <Card title="Kontak darurat" icon={Phone} section="EMERGENCY" data={data} onChange={onChange}>
        <Fields value={data.emergency} keys={["name", "relationship", "phone"]} />
      </Card>
      <Card title="Rekening bank" icon={Landmark} section="BANK" data={data} onChange={onChange}>
        <Fields value={data.bank} keys={["bankName", "accountNumber", "accountHolder"]} />
      </Card>
      <div className="lg:col-span-2">
        <Card
          title="Keluarga"
          icon={HeartHandshake}
          section="FAMILY"
          data={data}
          onChange={onChange}
        >
          {data.family.length === 0 ? (
            <p className="text-muted-foreground text-sm">Belum ada data keluarga.</p>
          ) : (
            <ul className="divide-y text-sm">
              {data.family.map((m) => (
                <li key={memberLine(m)} className="py-2">
                  {memberLine(m)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function MyDocuments({ data, onUpload }: { data: MyData; onUpload: () => void }) {
  const docs = useEmployeeDocuments(data.employeeId);
  const current = (docs.data?.documents ?? []).filter((d) => d.isCurrent);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Dokumen yang tersimpan di HR. Unggahan Anda diperiksa HR sebelum berlaku.
        </p>
        <Button size="sm" variant="outline" onClick={onUpload}>
          <FileText /> Ajukan unggah dokumen
        </Button>
      </div>
      {docs.isPending ? (
        <Skeleton className="h-24" />
      ) : current.length === 0 ? (
        <EmptyState icon={FileText} title="Belum ada dokumen" />
      ) : (
        <ul className="divide-y rounded-xl border">
          {current.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {doc.documentType.name}
                  <ExpiryBadge state={doc.expiryState} daysLeft={doc.daysLeft} />
                </p>
                <p className="text-muted-foreground text-xs">
                  {[
                    doc.documentNumber,
                    doc.expiresAt ? `berlaku s.d. ${formatDate(doc.expiresAt)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void openDocument(data.employeeId, doc.id)}
                aria-label={`Lihat ${doc.documentType.name}`}
              >
                Lihat
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyRequests() {
  const list = useMyDataChanges();
  const cancel = useCancelDataChange();
  if (list.isPending) return <Skeleton className="h-24" />;
  if (!list.data || list.data.length === 0)
    return <EmptyState icon={History} title="Belum ada pengajuan" />;
  return (
    <ul className="divide-y rounded-xl border">
      {list.data.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              {DATA_CHANGE_SECTION_LABELS[r.section]}
              {r.documentType ? ` · ${r.documentType.name}` : ""}
              <StatusBadge status={r.status} />
            </p>
            <p className="text-muted-foreground text-xs">
              Diajukan {formatDateTime(r.createdAt)}
              {r.section !== "DOCUMENT" && r.section !== "FAMILY"
                ? ` · ${r.fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}`
                : ""}
            </p>
            {r.reviewNote ? (
              <p className="bg-muted/60 mt-1 rounded-md px-2 py-1 text-xs">
                Catatan HR: {r.reviewNote}
              </p>
            ) : null}
          </div>
          {r.status === "PENDING" ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(r.id, {
                  onSuccess: () => toast.success("Pengajuan dibatalkan."),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              Batalkan
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
