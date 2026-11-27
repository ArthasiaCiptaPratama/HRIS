import {
  isPermissionGrantableTo,
  PERMISSION_LABELS,
  PERMISSIONS,
  type Permission,
  type Role,
} from "@hris/shared";
import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { type GrantBatchBody, useCreateGrantBatch, useGrantBatchPreview } from "../api";
import type { GrantBatchResult } from "../schemas";

export interface GrantRecipient {
  id: string;
  email: string;
  role: Role;
  companyIds: string[];
}

const ROLE_LABEL: Partial<Record<Role, string>> = { HR_ADMIN: "HR Admin", MANAGER: "Manager" };
type Status = GrantBatchResult["items"][number]["status"];
export const GRANT_STATUS: Record<Status, { label: string; className: string }> = {
  created: {
    label: "Dibuat",
    className: "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200",
  },
  skipped_active: { label: "Dilewati · sudah aktif", className: "bg-muted text-muted-foreground" },
  skipped_not_grantable: {
    label: "Dilewati · tidak sesuai role",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  skipped_inactive: {
    label: "Dilewati · akun nonaktif",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
};
const chip = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

/**
 * IAM-D2 (kutipan pengguna 17:4x WIB "Setuju dialog ini"): beri grant banyak akun × banyak izin
 * sekaligus. Pratinjau dihitung server (dryRun, aturan sama dengan simpan); yang sudah aktif / tidak
 * sesuai role dilewati, bukan error; hasil per baris setelah simpan.
 */
export function GrantBatchDialog({
  open,
  onOpenChange,
  recipients,
  companies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: GrantRecipient[];
  companies: { id: string; code: string }[];
}) {
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<GrantBatchResult | null>(null);
  const create = useCreateGrantBatch();

  const reset = () => {
    setAccountIds([]);
    setPermissions([]);
    setSearch("");
    setCompanyId("");
    setExpiresOn("");
    setReason("");
    setResult(null);
  };
  const close = (next: boolean) => {
    if (!next && create.isPending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const visible = recipients.filter(
    (a) =>
      a.email.toLowerCase().includes(search.trim().toLowerCase()) &&
      (!companyId || a.companyIds.includes(companyId)),
  );
  const selectedRoles = new Set(
    recipients.filter((a) => accountIds.includes(a.id)).map((a) => a.role),
  );
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const selectAll = (role: Role) => {
    const ids = visible.filter((a) => a.role === role).map((a) => a.id);
    setAccountIds((prev) => [...new Set([...prev, ...ids])]);
  };
  const companyCode = companies.find((c) => c.id === companyId)?.code;
  const emailOf = (id: string) => recipients.find((a) => a.id === id)?.email ?? id.slice(0, 8);

  const body: GrantBatchBody = useMemo(
    () => ({
      accountIds,
      permissions,
      // Berakhir di akhir hari yang dipilih, zona Asia/Jakarta (UTC+7).
      ...(expiresOn ? { expiresAt: new Date(`${expiresOn}T23:59:59+07:00`).toISOString() } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    }),
    [accountIds, permissions, expiresOn, reason],
  );
  const previewBody = useDebouncedValue(body, 300);
  const ready = previewBody.accountIds.length > 0 && previewBody.permissions.length > 0;
  const preview = useGrantBatchPreview(previewBody, open && ready && !result);
  const counts = preview.data?.data;

  const submit = async () => {
    try {
      const res = await create.mutateAsync(body);
      setResult(res.data);
      toast.success(`${res.data.created} grant diberikan; ${res.data.skipped} dilewati.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{result ? "Hasil pemberian grant" : "Beri grant izin"}</DialogTitle>
          <DialogDescription>
            {result
              ? `${result.created} dibuat · ${result.skipped} dilewati. Penerima mendapat satu notifikasi berisi semua izin barunya.`
              : "HR Admin: berlaku atas karyawan di perusahaan yang ditugaskan. Manager: hanya timnya. Data gaji tidak pernah bisa di-grant (kecuali upah harian THL, KTR-D13)."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <ResultTable result={result} emailOf={emailOf} />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <section aria-label="Akun penerima" className="min-w-0 space-y-3">
              <p className={STEP}>
                1 · Akun penerima{" "}
                <span className="text-foreground tracking-normal normal-case">
                  ({accountIds.length} dipilih)
                </span>
              </p>
              <div className="flex gap-2">
                <Input
                  aria-label="Cari akun"
                  placeholder="Cari email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <FormSelect
                  aria-label="Filter PT"
                  className="w-36 shrink-0"
                  value={companyId}
                  onChange={setCompanyId}
                  placeholder="Semua PT"
                  noneLabel="Semua PT"
                  options={companies.map((c) => ({ value: c.id, label: c.code }))}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["HR_ADMIN", "MANAGER"] as const).map((role) => {
                  const n = visible.filter((a) => a.role === role).length;
                  return n ? (
                    <Button
                      key={role}
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => selectAll(role)}
                    >
                      Semua {ROLE_LABEL[role]}
                      {companyCode ? ` PT ${companyCode}` : ""} ({n})
                    </Button>
                  ) : null;
                })}
                {accountIds.length ? (
                  <Button type="button" size="xs" variant="ghost" onClick={() => setAccountIds([])}>
                    Kosongkan
                  </Button>
                ) : null}
              </div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border p-1">
                {(["HR_ADMIN", "MANAGER"] as const).map((role) => {
                  const rows = visible.filter((a) => a.role === role);
                  return rows.length ? (
                    <div key={role}>
                      <p className="text-muted-foreground px-2 pt-1 text-[11px] font-medium uppercase">
                        {ROLE_LABEL[role]}
                      </p>
                      {rows.map((a) => (
                        <CheckRow
                          key={a.id}
                          checked={accountIds.includes(a.id)}
                          onChange={() => setAccountIds((prev) => toggle(prev, a.id))}
                          title={a.email}
                          hint={
                            a.companyIds
                              .map((id) => companies.find((c) => c.id === id)?.code)
                              .filter(Boolean)
                              .join(" · ") || undefined
                          }
                        />
                      ))}
                    </div>
                  ) : null;
                })}
                {visible.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-sm">Tidak ada akun yang cocok.</p>
                ) : null}
              </div>
            </section>

            <section aria-label="Izin" className="min-w-0 space-y-3">
              <p className={STEP}>
                2 · Izin{" "}
                <span className="text-foreground tracking-normal normal-case">
                  ({permissions.length} dipilih)
                </span>
              </p>
              <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border p-1">
                {PERMISSIONS.map((p) => {
                  const notFor = [...selectedRoles].filter((r) => !isPermissionGrantableTo(p, r));
                  return (
                    <CheckRow
                      key={p}
                      checked={permissions.includes(p)}
                      onChange={() => setPermissions((prev) => toggle(prev, p))}
                      title={PERMISSION_LABELS[p]}
                      warning={
                        notFor.length
                          ? `Tidak untuk ${notFor.map((r) => ROLE_LABEL[r]).join(", ")} — dilewati`
                          : undefined
                      }
                    />
                  );
                })}
              </div>
              <p className={STEP}>3 · Berlaku untuk semua</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="batch-expires">Berlaku sampai</Label>
                  <Input
                    id="batch-expires"
                    type="date"
                    value={expiresOn}
                    onChange={(e) => setExpiresOn(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">Kosong = tanpa batas</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="batch-reason">Alasan</Label>
                  <Textarea
                    id="batch-reason"
                    rows={2}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section
              aria-label="Pratinjau"
              className="bg-muted/40 space-y-2 rounded-lg p-4 sm:col-span-2"
            >
              <p className={STEP}>4 · Pratinjau</p>
              {!ready ? (
                <p className="text-muted-foreground text-sm">
                  Pilih minimal satu akun dan satu izin.
                </p>
              ) : preview.isError ? (
                <p role="alert" className="text-destructive text-sm">
                  {errorMessage(preview.error)}
                </p>
              ) : counts ? (
                <>
                  <p className="flex flex-wrap items-center gap-1.5 text-sm">
                    <b>
                      {accountIds.length} akun × {permissions.length} izin ={" "}
                      {accountIds.length * permissions.length} kombinasi
                    </b>
                    →
                    {(Object.keys(GRANT_STATUS) as Status[]).map((status) => {
                      const n = counts.items.filter((i) => i.status === status).length;
                      return n ? (
                        <span key={status} className={cn(chip, GRANT_STATUS[status].className)}>
                          {n} {GRANT_STATUS[status].label.toLowerCase()}
                        </span>
                      ) : null;
                    })}
                  </p>
                  {counts.skipped ? (
                    <details className="text-muted-foreground text-xs">
                      <summary className="cursor-pointer">Rincian yang dilewati</summary>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {counts.items
                          .filter((i) => i.status !== "created")
                          .map((i) => (
                            <li key={`${i.accountId}:${i.permission}`}>
                              {emailOf(i.accountId)} · {PERMISSION_LABELS[i.permission]} —{" "}
                              {GRANT_STATUS[i.status].label.replace("Dilewati · ", "")}
                            </li>
                          ))}
                      </ul>
                    </details>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Menghitung…</p>
              )}
            </section>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button variant="brand" onClick={() => close(false)}>
              Selesai
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Batal
              </Button>
              <Button
                variant="brand"
                disabled={!counts?.created || create.isPending || preview.isFetching}
                onClick={() => void submit()}
              >
                {create.isPending ? "Menyimpan…" : `Beri ${counts?.created ?? 0} grant`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STEP = "text-muted-foreground text-[11px] font-medium tracking-wider uppercase";

function CheckRow({
  checked,
  onChange,
  title,
  hint,
  warning,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  hint?: string | undefined;
  warning?: string | undefined;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 text-sm",
        checked ? "bg-brand-soft/60" : "hover:bg-muted/60",
      )}
    >
      <input
        type="checkbox"
        className="accent-brand mt-0.5 size-4 shrink-0"
        checked={checked}
        onChange={onChange}
      />
      <span className="min-w-0">
        <span className="block break-words">{title}</span>
        {hint ? <span className="text-muted-foreground block text-xs">{hint}</span> : null}
        {warning ? (
          <span className="block text-[11px] text-amber-700 dark:text-amber-400">{warning}</span>
        ) : null}
      </span>
    </label>
  );
}

function ResultTable({
  result,
  emailOf,
}: {
  result: GrantBatchResult;
  emailOf: (id: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm" aria-label="Hasil per kombinasi">
        <thead className="bg-muted text-muted-foreground text-xs">
          <tr>
            <th className="p-2 font-medium">Akun</th>
            <th className="p-2 font-medium">Izin</th>
            <th className="p-2 font-medium">Hasil</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((i) => (
            <tr key={`${i.accountId}:${i.permission}`} className="border-t">
              <td className="p-2 break-all">{emailOf(i.accountId)}</td>
              <td className="p-2">{PERMISSION_LABELS[i.permission]}</td>
              <td className="p-2">
                <span className={cn(chip, GRANT_STATUS[i.status].className)}>
                  {GRANT_STATUS[i.status].label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
