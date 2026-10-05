import { FileUp, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { access } from "@/lib/access";
import { cn } from "@/lib/utils";
import {
  ACTIVE_BASE,
  ALL_ACTIVE_VIEW,
  activeCount,
  findActiveView,
  LEGACY_SLUGS,
  siblingViews,
} from "../active-views";
import { useCompanyScope, useEmployeeSummary, useMasterData } from "../api";
import { EmployeeDetailSheet, useEmployeeSheet } from "../components/employee-detail-sheet";
import { EmployeeFormDialog } from "../components/employee-form-dialog";
import { EmployeeListView, employeeColumns } from "../components/employee-list-view";
import type { EmployeeDetail } from "../schemas";

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

  const { showCompany } = useCompanyScope();
  const columns = useMemo(
    () => employeeColumns("active", undefined, { showCompany }),
    [showCompany],
  );
  const view = findActiveView(slug);
  if (!view) {
    const legacy = LEGACY_SLUGS[slug];
    return <Navigate to={`${ACTIVE_BASE}/${legacy ?? ALL_ACTIVE_VIEW.slug}`} replace />;
  }
  const { category, group } = view.filter;
  const title = view.label;
  const defaultStatusId = category
    ? master.data?.employmentStatuses.find((s) => s.category === category)?.id
    : undefined;

  const chips = siblingViews(view).map((chip) => ({
    slug: chip.slug,
    label: chip.label,
    count: activeCount(summary.data, chip.filter),
  }));

  return (
    <>
      <PageHeader
        title={title}
        description={view.description}
        actions={
          canManage ? (
            <>
              <Button variant="outline" asChild>
                <Link to={`/personal/import?dari=${view.slug}`}>
                  <FileUp /> Import
                </Link>
              </Button>
              <Button onClick={() => setForm({ open: true, employee: null })}>
                <UserPlus /> Tambah karyawan
              </Button>
            </>
          ) : null
        }
      />

      <nav
        aria-label="Kategori karyawan"
        className="animate-fade-up -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0"
      >
        {chips.map((chip) => (
          <NavLink
            key={chip.slug}
            to={`${ACTIVE_BASE}/${chip.slug}`}
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
            <span className="font-mono text-xs tabular-nums">{chip.count ?? "·"}</span>
          </NavLink>
        ))}
      </nav>

      <EmployeeListView
        key={slug}
        variant="active"
        category={category}
        group={group}
        columns={columns}
        onRowClick={(row) => sheet.open(row.id)}
        emptyTitle={
          category ? `Belum ada data ${title}` : "Belum ada karyawan aktif di kelompok ini"
        }
        emptyDescription={
          canManage
            ? "Tambahkan karyawan baru atau ubah status karyawan yang sudah ada."
            : "Belum ada anggota tim pada kategori ini."
        }
        emptyAction={
          canManage ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setForm({ open: true, employee: null })}
            >
              <UserPlus /> Tambah karyawan
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
