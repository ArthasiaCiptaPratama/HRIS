import { POSITION_LEVEL_LABELS, POSITION_LEVELS, type PositionLevel } from "@hris/shared";
import { BriefcaseBusiness } from "lucide-react";
import { Link } from "react-router";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { useMasterDataAdmin } from "../api";
import { MASTER_DATA_BASE } from "../config";

// ORG-D8 (Grade = Level): Master Data › Level — hanya baca. Level karyawan = level jabatannya (ORG-D1);
// diatur di master Jabatan. Upah per level (bersama Time Management) menyusul di halaman ini.

interface LevelRow {
  key: PositionLevel | "NONE";
  label: string;
  positions: number;
  employees: number;
}

export function LevelsPage() {
  const positions = useMasterDataAdmin("positions", "active", "");
  const rows: LevelRow[] = [...POSITION_LEVELS, "NONE" as const].map((key) => {
    const items = (positions.data ?? []).filter((p) =>
      key === "NONE" ? !p.level : p.level === key,
    );
    return {
      key,
      label: key === "NONE" ? "Belum ber-level" : POSITION_LEVEL_LABELS[key],
      positions: items.length,
      employees: items.reduce((sum, p) => sum + p.employeeCount, 0),
    };
  });
  return (
    <div>
      <PageHeader
        title="Level"
        description="Level karyawan mengikuti level jabatannya. Level diatur di master Jabatan; kode level asli dari file HR (mis. 3A) tampil sebagai penanda di data karyawan."
        actions={
          <Button asChild variant="outline">
            <Link to={`${MASTER_DATA_BASE}/jabatan`}>
              <BriefcaseBusiness /> Atur level di Jabatan
            </Link>
          </Button>
        }
      />
      <ListPanel>
        {positions.isError ? (
          <p className="text-destructive p-4 text-sm">{errorMessage(positions.error)}</p>
        ) : (
          <table className="w-full text-sm" aria-label="Daftar level">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="px-4 py-2.5 font-medium">Level</th>
                <th className="px-4 py-2.5 text-right font-medium">Jabatan</th>
                <th className="px-4 py-2.5 text-right font-medium">Karyawan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={row.key === "NONE" ? "text-muted-foreground border-t" : "border-t"}
                >
                  <td className="px-4 py-2.5">{row.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {positions.isPending ? <Skeleton className="ml-auto h-4 w-6" /> : row.positions}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {positions.isPending ? <Skeleton className="ml-auto h-4 w-6" /> : row.employees}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListPanel>
    </div>
  );
}
