import {
  Building2,
  ChevronDown,
  Network,
  Search,
  SearchX,
  TriangleAlert,
  Users,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/features/auth/api";
import type { Me } from "@/features/auth/schemas";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { access } from "@/lib/access";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useOrgStructure } from "../api";
import { EmployeeAvatar } from "../components/employee-avatar";
import { EmployeeDetailSheet, useEmployeeSheet } from "../components/employee-detail-sheet";
import type { OrgStructure } from "../schemas";

interface Person {
  id: string;
  fullName: string;
  employeeNumber: string;
  managerId: string | null;
  position: string;
  department: string;
}

const norm = (text: string) => text.toLocaleLowerCase("id-ID");

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const index = norm(text).indexOf(norm(query));
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-brand-soft text-brand-soft-foreground rounded-sm px-0.5">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

export function OrgStructurePage() {
  const me = useMe().data as Me;
  const structure = useOrgStructure();
  const sheet = useEmployeeSheet();
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), 200);

  // Panel detail hanya untuk pegawai yang boleh dilihat (API tetap menolak yang lain dengan 404).
  const canOpen = (person: { id: string; managerId: string | null }) =>
    access.manageEmployees(me) ||
    person.id === me.employeeId ||
    (me.employeeId !== null && person.managerId === me.employeeId);

  const people = useMemo(() => flatten(structure.data), [structure.data]);

  return (
    <>
      <PageHeader
        title="Struktur Organisasi"
        description="Departemen, jabatan, dan pemegangnya, serta bagan hubungan atasan–bawahan langsung."
      />
      {structure.isPending ? (
        <StructureSkeleton />
      ) : structure.isError ? (
        <div className="bg-card rounded-2xl border">
          <EmptyState
            icon={TriangleAlert}
            title="Gagal memuat struktur"
            description={errorMessage(structure.error)}
          />
        </div>
      ) : (
        <>
          <Stats data={structure.data} people={people} />
          <Tabs defaultValue="departments">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <TabsList className="w-auto border-b-0">
                <TabsTrigger value="departments">
                  <Building2 /> Per departemen
                </TabsTrigger>
                <TabsTrigger value="chart">
                  <Network /> Bagan atasan
                </TabsTrigger>
              </TabsList>
              <div className="relative sm:w-72">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari nama, jabatan, departemen…"
                  aria-label="Cari di struktur"
                  className="h-9 pl-9"
                />
              </div>
            </div>
            <TabsContent value="departments">
              <DepartmentView
                data={structure.data}
                query={query}
                onOpen={(person) => canOpen(person) && sheet.open(person.id)}
                canOpen={canOpen}
              />
            </TabsContent>
            <TabsContent value="chart">
              <ChartView
                people={people}
                query={query}
                onOpen={(person) => canOpen(person) && sheet.open(person.id)}
                canOpen={canOpen}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
      <EmployeeDetailSheet />
    </>
  );
}

function flatten(data: OrgStructure | undefined): Person[] {
  if (!data) return [];
  return data.departments.flatMap((department) =>
    department.positions.flatMap((position) =>
      position.employees.map((employee) => ({
        ...employee,
        position: position.name,
        department: department.name,
      })),
    ),
  );
}

function Stats({ data, people }: { data: OrgStructure; people: Person[] }) {
  const managers = new Set(people.map((p) => p.managerId).filter(Boolean)).size;
  const positions = data.departments.reduce((sum, d) => sum + d.positions.length, 0);
  const items = [
    { label: "Pegawai aktif", value: data.totalEmployees },
    { label: "Departemen", value: data.departments.length },
    { label: "Jabatan", value: positions },
    { label: "Atasan langsung", value: managers },
  ];
  return (
    <dl className="bg-card animate-fade-up mb-6 grid grid-cols-2 divide-y rounded-2xl border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      {items.map((item, index) => (
        <div key={item.label} className={cn("px-5 py-4", index === 1 && "border-l sm:border-l-0")}>
          <dt className="text-muted-foreground text-xs">{item.label}</dt>
          <dd className="mt-1 font-mono text-2xl font-medium tracking-tight tabular-nums">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StructureSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="columns-1 gap-4 md:columns-2 2xl:columns-3">
        {[180, 240, 160, 220, 200].map((height, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis
          <Skeleton key={i} className="mb-4 w-full rounded-2xl" style={{ height }} />
        ))}
      </div>
    </div>
  );
}

type OpenFn = (person: { id: string; managerId: string | null }) => void;
type CanOpenFn = (person: { id: string; managerId: string | null }) => boolean;

function DepartmentView({
  data,
  query,
  onOpen,
  canOpen,
}: {
  data: OrgStructure;
  query: string;
  onOpen: OpenFn;
  canOpen: CanOpenFn;
}) {
  const q = norm(query);
  const departments = data.departments
    .map((department) => {
      const deptHit = q !== "" && norm(department.name).includes(q);
      const positions = department.positions
        .map((position) => {
          const posHit = deptHit || (q !== "" && norm(position.name).includes(q));
          const employees =
            q === "" || posHit
              ? position.employees
              : position.employees.filter(
                  (e) => norm(e.fullName).includes(q) || norm(e.employeeNumber).includes(q),
                );
          return { ...position, employees, visible: q === "" || posHit || employees.length > 0 };
        })
        .filter((position) => position.visible);
      const headcount = department.positions.reduce((sum, p) => sum + p.employees.length, 0);
      return { ...department, positions, headcount, visible: q === "" || positions.length > 0 };
    })
    .filter((department) => department.visible);

  if (departments.length === 0)
    return (
      <EmptyState icon={SearchX} title="Tidak ada yang cocok" description="Coba kata kunci lain." />
    );

  return (
    <div className="columns-1 gap-4 md:columns-2 2xl:columns-3">
      {departments.map((department, index) => (
        <section
          key={department.id}
          style={{ "--i": index } as React.CSSProperties}
          className="bg-card animate-fade-up mb-4 break-inside-avoid overflow-hidden rounded-2xl border"
        >
          <header className="flex items-center gap-3 border-b px-5 py-4">
            <span className="bg-brand-soft text-brand-soft-foreground grid size-9 place-items-center rounded-xl">
              <Building2 className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">
                <Highlight text={department.name} query={query} />
              </h2>
              <p className="text-muted-foreground text-xs">{department.positions.length} jabatan</p>
            </div>
            <span className="text-muted-foreground inline-flex items-center gap-1 font-mono text-xs tabular-nums">
              <Users className="size-3.5" aria-hidden /> {department.headcount}
            </span>
          </header>
          <ul className="divide-y">
            {department.positions.map((position) => (
              <li key={position.id} className="px-5 py-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    <Highlight text={position.name} query={query} />
                  </p>
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {position.employees.length}
                  </span>
                </div>
                {position.employees.length === 0 ? (
                  <p className="text-muted-foreground text-xs italic">Belum ada pemegang</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {position.employees.map((employee) => {
                      const openable = canOpen(employee);
                      return (
                        <button
                          key={employee.id}
                          type="button"
                          disabled={!openable}
                          onClick={() => onOpen(employee)}
                          className={cn(
                            "bg-muted/50 inline-flex max-w-full items-center gap-2 rounded-full py-1 pr-3 pl-1 text-xs transition-colors",
                            openable ? "hover:bg-brand-soft cursor-pointer" : "cursor-default",
                          )}
                        >
                          <EmployeeAvatar
                            name={employee.fullName}
                            size="sm"
                            className="size-6 text-[10px]"
                          />
                          <span className="truncate">
                            <Highlight text={employee.fullName} query={query} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface TreeNode extends Person {
  children: TreeNode[];
  size: number;
}

function buildTree(people: Person[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>(
    people.map((p) => [p.id, { ...p, children: [], size: 0 }]),
  );
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.managerId ? nodes.get(node.managerId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const measure = (node: TreeNode): number => {
    node.children.sort(
      (a, b) => b.children.length - a.children.length || a.fullName.localeCompare(b.fullName),
    );
    node.size = node.children.reduce((sum, child) => sum + 1 + measure(child), 0);
    return node.size;
  };
  for (const root of roots) measure(root);
  // Atasan dengan tim terbesar di atas; pegawai tanpa atasan & tanpa bawahan dikumpulkan di akhir.
  return roots.sort((a, b) => b.size - a.size || a.fullName.localeCompare(b.fullName));
}

function matches(node: TreeNode, q: string): boolean {
  return (
    norm(node.fullName).includes(q) ||
    norm(node.position).includes(q) ||
    norm(node.department).includes(q) ||
    node.children.some((child) => matches(child, q))
  );
}

function ChartView({
  people,
  query,
  onOpen,
  canOpen,
}: {
  people: Person[];
  query: string;
  onOpen: OpenFn;
  canOpen: CanOpenFn;
}) {
  const roots = useMemo(() => buildTree(people), [people]);
  const q = norm(query);
  const visibleRoots = q ? roots.filter((root) => matches(root, q)) : roots;
  const leaders = visibleRoots.filter((root) => root.children.length > 0);
  const loose = visibleRoots.filter((root) => root.children.length === 0);

  if (visibleRoots.length === 0)
    return (
      <EmptyState icon={SearchX} title="Tidak ada yang cocok" description="Coba kata kunci lain." />
    );

  return (
    <div className="space-y-4">
      {leaders.map((root, index) => (
        <div
          key={root.id}
          style={{ "--i": index } as React.CSSProperties}
          className="bg-card animate-fade-up overflow-x-auto rounded-2xl border p-4 sm:p-5"
        >
          <ul>
            <TreeItem node={root} query={query} onOpen={onOpen} canOpen={canOpen} depth={0} />
          </ul>
        </div>
      ))}
      {loose.length > 0 ? (
        <div className="bg-card animate-fade-up rounded-2xl border p-4 sm:p-5">
          <p className="text-muted-foreground mb-3 text-xs">
            Tanpa atasan & tanpa bawahan langsung ({loose.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {loose.map((node) => (
              <PersonChip
                key={node.id}
                node={node}
                query={query}
                onOpen={onOpen}
                canOpen={canOpen}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PersonChip({
  node,
  query,
  onOpen,
  canOpen,
  trailing,
}: {
  node: TreeNode;
  query: string;
  onOpen: OpenFn;
  canOpen: CanOpenFn;
  trailing?: ReactNode;
}) {
  const openable = canOpen(node);
  const hit =
    query !== "" &&
    (norm(node.fullName).includes(norm(query)) || norm(node.position).includes(norm(query)));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onOpen(node)}
          disabled={!openable}
          className={cn(
            "bg-background relative z-10 inline-flex min-w-0 items-center gap-2.5 rounded-xl border py-2 pr-3 pl-2 text-left transition-all",
            openable &&
              "hover:border-brand/50 hover:shadow-[0_6px_16px_-8px_rgb(24_24_27/0.2)] active:scale-[0.99]",
            hit && "border-brand ring-brand/20 ring-2",
          )}
        >
          <EmployeeAvatar name={node.fullName} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              <Highlight text={node.fullName} query={query} />
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              <Highlight text={node.position} query={query} />
            </span>
          </span>
          {trailing}
        </button>
      </TooltipTrigger>
      <TooltipContent>{node.department}</TooltipContent>
    </Tooltip>
  );
}

function TreeItem({
  node,
  query,
  onOpen,
  canOpen,
  depth,
}: {
  node: TreeNode;
  query: string;
  onOpen: OpenFn;
  canOpen: CanOpenFn;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const q = norm(query);
  const children = q ? node.children.filter((child) => matches(child, q)) : node.children;
  const expanded = open || q !== "";

  return (
    <li
      className={cn(
        "relative",
        depth > 0 &&
          "before:bg-border before:absolute before:top-[26px] before:-left-5 before:h-px before:w-[50px]",
        // Anak terakhir: tutup sisa garis vertikal di bawah sambungannya.
        depth > 0 &&
          "last:after:bg-card last:after:absolute last:after:top-[27px] last:after:bottom-0 last:after:-left-[22px] last:after:w-[3px]",
      )}
    >
      <div className="flex items-center gap-1.5">
        {children.length > 0 ? (
          <button
            type="button"
            aria-label={expanded ? `Lipat tim ${node.fullName}` : `Buka tim ${node.fullName}`}
            aria-expanded={expanded}
            onClick={() => setOpen((value) => !value)}
            className="text-muted-foreground hover:text-foreground bg-card hover:bg-muted relative z-10 grid size-6 shrink-0 place-items-center rounded-md border transition-colors"
          >
            <ChevronDown className={cn("size-4 transition-transform", !expanded && "-rotate-90")} />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <PersonChip
          node={node}
          query={query}
          onOpen={onOpen}
          canOpen={canOpen}
          trailing={
            node.size > 0 ? (
              <span className="bg-muted text-muted-foreground ml-1 rounded-md px-1.5 font-mono text-[10px] tabular-nums">
                {node.size}
              </span>
            ) : null
          }
        />
      </div>
      {expanded && children.length > 0 ? (
        <ul className="border-border relative mt-2 ml-3 space-y-2 border-l pl-5">
          {children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              query={query}
              onOpen={onOpen}
              canOpen={canOpen}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
