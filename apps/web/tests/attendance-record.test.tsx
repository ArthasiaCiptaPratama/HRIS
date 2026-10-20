import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  MonthlyHistory,
  monthsSinceStart,
  RecordList,
  RecordSummary,
  sinceRuleStart,
} from "@/features/time-management/components/attendance-record";
import type { AttendanceRecord } from "@/features/time-management/record-api";

// TM-D3 — rekam jejak Alpha & koreksi: sisa waktu koreksi, kedaluwarsa, tombol koreksi.
const record: AttendanceRecord = {
  employee: { id: "e1", fullName: "Rina Lestari", employeeNumber: "TMDEMO-EMP" },
  today: "2026-10-19",
  summary: {
    ALPHA_CORRECTABLE: 1,
    ALPHA_EXPIRED: 1,
    ALPHA_PERIOD: 0,
    CORRECTION_PENDING: 0,
    CORRECTED: 1,
    CORRECTION_REJECTED: 0,
  },
  items: [
    {
      workDate: "2026-10-17",
      shiftCode: "D",
      outcome: "ALPHA_CORRECTABLE",
      deadline: "2026-10-20",
      correction: null,
    },
    {
      workDate: "2026-10-16",
      shiftCode: "D",
      outcome: "CORRECTED",
      deadline: "2026-10-19",
      correction: { status: "APPROVED", reason: "HP mati", createdAt: "2026-10-17T01:00:00Z" },
    },
    {
      workDate: "2026-10-05",
      shiftCode: "N",
      outcome: "ALPHA_EXPIRED",
      deadline: "2026-10-08",
      correction: null,
    },
  ],
};

describe("rekam jejak absen (TM-D3)", () => {
  it("ringkasan menghitung per hasil", () => {
    render(<RecordSummary record={record} />);
    const expired = screen.getByText("Alpha permanen").closest("div") as HTMLElement;
    expect(within(expired).getByText("1")).toBeInTheDocument();
  });

  it("sisa hari koreksi, kedaluwarsa tanpa tombol, tombol koreksi memanggil tanggalnya", async () => {
    const onCorrect = vi.fn();
    render(<RecordList record={record} onCorrect={onCorrect} />);
    expect(screen.getByText(/Sisa 1 hari untuk koreksi/)).toBeInTheDocument();
    expect(screen.getByText(/Batas koreksi lewat/)).toBeInTheDocument();
    expect(screen.getByText(/HP mati/)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /Koreksi/ });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0] as HTMLElement);
    expect(onCorrect).toHaveBeenCalledWith("2026-10-17");
  });

  it("tanpa onCorrect (tampilan HR/atasan) tidak ada tombol koreksi", () => {
    render(<RecordList record={record} />);
    expect(screen.queryByRole("button", { name: /Koreksi/ })).not.toBeInTheDocument();
  });
});

describe("riwayat per bulan (TM-D3)", () => {
  it("bulan dimulai Oktober 2026, terbaru di atas; catatan sebelum Oktober tidak dihitung", () => {
    expect(monthsSinceStart("2026-12-05")).toEqual(["2026-12", "2026-11", "2026-10"]);
    expect(monthsSinceStart("2026-10-19")).toEqual(["2026-10"]);
    const withOld: AttendanceRecord = {
      ...record,
      items: [
        ...record.items,
        {
          workDate: "2026-09-20",
          shiftCode: "D",
          outcome: "ALPHA_PERIOD",
          deadline: "2026-09-23",
          correction: null,
        },
      ],
    };
    expect(sinceRuleStart(withOld).items.map((i) => i.workDate)).not.toContain("2026-09-20");
  });

  it("baris bulan menghitung per hasil; klik bulan memilih bulan itu", async () => {
    const onSelect = vi.fn();
    render(
      <MonthlyHistory
        record={{ ...record, today: "2026-11-02" }}
        month={null}
        onSelect={onSelect}
      />,
    );
    const october = screen
      .getByRole("button", { name: /oktober 2026/i })
      .closest("tr") as HTMLElement;
    const cells = within(october)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    // Bulan | Alpha permanen | Bisa dikoreksi | Menunggu | Dikoreksi | Ditolak | Total hari
    expect(cells.slice(1)).toEqual(["1", "1", "0", "1", "0", "3"]);
    const november = screen
      .getByRole("button", { name: /november 2026/i })
      .closest("tr") as HTMLElement;
    expect(within(november).getAllByRole("cell").at(-1)?.textContent).toBe("0");
    await userEvent.click(screen.getByRole("button", { name: /oktober 2026/i }));
    expect(onSelect).toHaveBeenCalledWith("2026-10");
  });
});
