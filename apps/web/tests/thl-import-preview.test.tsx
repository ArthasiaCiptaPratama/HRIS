import { IMPORT_ISSUE_MESSAGES } from "@hris/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { previewSchema } from "@/features/employee/import/api";
import { issueText } from "@/features/employee/import/labels";
import { PreviewSheet } from "@/features/employee/import/sheet/preview-sheet";
import type { SheetColumn, SheetRowData } from "@/features/employee/import/sheet/sheet-grid";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));
// Grid virtualization is covered separately; expose the supplied columns/cells here.
vi.mock("@/features/employee/import/sheet/sheet-grid", () => ({
  SheetGrid: ({ columns, rows }: { columns: SheetColumn[]; rows: SheetRowData[] }) => (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            {columns.map((c) => (
              <td key={c.key}>{r.cells[c.key]?.text}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

describe("K4 pratinjau import upah harian", () => {
  it.each(["SET", "KEEP"] as const)(
    "menampilkan rencana %s dan nominal dari respons API",
    (action) => {
      const preview = previewSchema.parse({
        counts: { total: 1, create: 0, update: 1, skip: 0, error: 0, blank: 0, attachments: 0 },
        rows: [
          {
            sourceRow: 2,
            action: "UPDATE",
            employeeNumber: "THL-1",
            fullName: "Contoh THL",
            companyCode: "ACP",
            newEmployee: false,
            employmentStatusId: null,
            changes: [],
            issues: [],
            attachments: 0,
            dailyWage: { action, amount: 150000, effectiveFrom: "2026-08-01" },
          },
        ],
        masterData: { departments: [], positions: [], grades: [], workLocations: [] },
        skippedFields: [],
        previewHash: "h",
      });
      render(
        <PreviewSheet
          preview={preview}
          rows={preview.rows}
          rawBySource={new Map([[2, { fullName: "Contoh THL", dailyWage: "150000" }]])}
          fields={["fullName", "dailyWage"]}
          edits={{}}
          pending={new Set()}
          onEdit={() => {}}
          fillEmpty={false}
          columnOf={() => undefined}
          companyOptions={[{ value: "co", label: "ACP" }]}
          companyOverrides={{}}
          onCompanyOverride={() => {}}
          statusOptions={[]}
          statusOverrides={{}}
          onStatusOverride={() => {}}
          holders={{ column: false, all: false }}
          holderOptions={() => []}
          onChartHolderChoice={() => {}}
          toolbar={(button) => button}
        />,
      );
      expect(screen.getByRole("columnheader", { name: "Upah harian" })).toBeVisible();
      expect(screen.getByRole("columnheader", { name: "Upah harian · rencana" })).toBeVisible();
      expect(screen.getByText(new RegExp(`${action}.*Rp 150\\.000`))).toBeVisible();
    },
  );
  it.each([
    "INVALID_DAILY_WAGE",
    "DAILY_WAGE_NO_PERMISSION",
    "DAILY_WAGE_IGNORED",
    "DAILY_WAGE_BEFORE_JOIN",
  ])("pesan %s memakai kamus bersama", (code) => {
    expect(issueText({ field: "dailyWage", code }, () => undefined)).toBe(
      `Upah harian: ${IMPORT_ISSUE_MESSAGES[code]}`,
    );
  });
});
