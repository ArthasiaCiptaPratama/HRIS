import { EMPLOYMENT_CATEGORY_LABELS } from "@hris/shared";
import { UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, NavLink, useParams } from "react-router";
import { CATEGORY_SLUGS } from "@/app/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { access } from "@/lib/access";
import { cn } from "@/lib/utils";
import { useEmployeeSummary, useMasterData } from "../api";
import { EmployeeDetailSheet, useEmployeeSheet } from "../components/employee-detail-sheet";
import { EmployeeFormDialog } from "../components/employee-form-dialog";
import { EmployeeListView, employeeColumns } from "../components/employee-list-view";
import type { EmployeeDetail } from "../schemas";

const DESCRIPTIONS: Record<string, string> = {
  tetap: "Pegawai dengan perjanjian kerja waktu tidak tertentu (PKWTT).",
  pkwt: "Pegawai kontrak dengan perjanjian kerja waktu tertentu.",
  internship: "Peserta magang yang sedang aktif.",
  "daily-worker": "Pekerja harian lepas.",
  outsourcing: "Tenaga alih daya dari penyedia jasa.",
  semua: "Seluruh pegawai aktif dari semua kategori.",
};

export function ActiveEmployeesPage() {
  const { category: slug = "semua" } = useParams();
  const me = useMe().data as Me;
  const canManage = access.manageEmployees(me);
  const summary = useEmployeeSummary();
  const master = useMasterData();
  const sheet = useEmployeeSheet();
  const [form, setForm] = useState<{ open: boolean; employee: EmployeeDetail | null }>({
    open: false,
    employee: null,
  });

  const columns = useMemo(() => employeeColumns("active"), []);
  if (!(slug in CATEGORY_SLUGS)) return <Navigate to="/personal/pegawai-aktif/semua" replace />;
  const category = CATEGORY_SLUGS[slug];
  const title = category ? EMPLOYMENT_CATEGORY_LABELS[category] : "Semua Pegawai";
  const defaultStatusId = category
    ? master.data?.employmentStatuses.find((s) => s.category === category)?.id
    : undefined;

  const chips = Object.entries(CATEGORY_SLUGS).map(([chipSlug, chipCategory]) => ({
    slug: chipSlug,
    label: chipCategory ? EMPLOYMENT_CATEGORY_LABELS[chipCategory] : "Semua",
    count: chipCategory
      ? summary.data?.active.byCategory[chipCategory]
      : summary.data?.active.total,
  }));

  return (
    <>
      <PageHeader
        title={title}
        description={DESCRIPTIONS[slug]}
        actions={
          canManage ? (
            <Button onClick={() => setForm({ open: true, employee: null })}>
              <UserPlus /> Tambah pegawai
            </Button>
          ) : null
        }
      />

      <nav
        aria-label="Kategori pegawai"
        className="animate-fade-up -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0"
      >
        {chips.map((chip) => (
          <NavLink
            key={chip.slug}
            to={`/personal/pegawai-aktif/${chip.slug}`}
            className={({ isActive }) =>
              cn(
                "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-sm transition-all active:scale-[0.98]",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )
            }
          >
            {chip.label}
            <span className="font-mono text-xs tabular-nums opacity-70">{chip.count ?? "·"}</span>
          </NavLink>
        ))}
      </nav>

      <EmployeeListView
        key={slug}
        variant="active"
        category={category}
        columns={columns}
        onRowClick={(row) => sheet.open(row.id)}
        emptyTitle={`Belum ada pegawai ${title}`}
        emptyDescription={
          canManage
            ? "Tambahkan pegawai baru atau ubah status pegawai yang sudah ada."
            : "Belum ada anggota tim pada kategori ini."
        }
        emptyAction={
          canManage ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setForm({ open: true, employee: null })}
            >
              <UserPlus /> Tambah pegawai
            </Button>
          ) : null
        }
      />

      <EmployeeDetailSheet
        {...(canManage
          ? { onEdit: (employee: EmployeeDetail) => setForm({ open: true, employee }) }
          : {})}
      />
      {canManage ? (
        <EmployeeFormDialog
          open={form.open}
          onOpenChange={(open) => setForm((prev) => ({ ...prev, open }))}
          employee={form.employee}
          defaultStatusId={defaultStatusId}
          onSaved={(id) => sheet.open(id)}
        />
      ) : null}
    </>
  );
}
