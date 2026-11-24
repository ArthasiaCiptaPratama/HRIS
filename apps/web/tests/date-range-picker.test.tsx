import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DateRange, DateRangePicker } from "@/components/ui/date-range-picker";

// jsdom tidak punya API ini (dipakai Radix Popover).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(cleanup);

function Harness({
  initial,
  maxDays,
  onChange,
}: {
  initial: DateRange;
  maxDays?: number;
  onChange: (r: DateRange) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DateRangePicker
      value={value}
      maxDays={maxDays}
      onChange={(r) => {
        setValue(r);
        onChange(r);
      }}
    />
  );
}

// 2026-11-24 = Selasa.
const NOV = { from: "2026-11-10", to: "2026-11-24" };

describe("DateRangePicker", () => {
  it("tombol memuat tanggal beserta nama hari; kosong menampilkan placeholder", () => {
    render(<Harness initial={{ from: "2026-11-23", to: "" }} onChange={() => undefined} />);
    expect(screen.getByLabelText("Dari")).toHaveTextContent("Senin, 23 Nov 2026");
    expect(screen.getByLabelText("Sampai")).toHaveTextContent("Pilih tanggal");
  });

  it("header kalender Sen..Min mulai Senin dan nama bulan Indonesia", async () => {
    render(<Harness initial={NOV} onChange={() => undefined} />);
    await userEvent.click(screen.getByLabelText("Dari"));
    const grid = await screen.findByRole("grid");
    const headers = Array.from(grid.querySelectorAll("th")).map((h) => h.textContent);
    expect(headers).toEqual(["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]);
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Selasa, 24 November 2026/ })).toBeInTheDocument();
  });

  it("memilih dua tanggal memanggil onChange dengan string ISO tanpa pergeseran zona", async () => {
    const onChange = vi.fn();
    render(<Harness initial={NOV} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Dari"));
    await userEvent.click(screen.getByRole("button", { name: /^Senin, 2 November 2026/ }));
    // Sampai lama (24 Nov) masih sah, jadi dipertahankan sampai tanggal akhir dipilih.
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-11-02", to: "2026-11-24" });
    await userEvent.click(screen.getByRole("button", { name: /^Jumat, 6 November 2026/ }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-11-02", to: "2026-11-06" });
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByLabelText("Dari")).toHaveTextContent("Senin, 2 Nov 2026");
    expect(screen.getByLabelText("Sampai")).toHaveTextContent("Jumat, 6 Nov 2026");
  });

  it("tanggal yang melewati maxDays dinonaktifkan", async () => {
    render(
      <Harness
        initial={{ from: "2026-11-10", to: "2026-11-12" }}
        maxDays={7}
        onChange={() => undefined}
      />,
    );
    await userEvent.click(screen.getByLabelText("Sampai"));
    // 10 Nov + 6 hari = 16 Nov (7 hari) boleh; 17 Nov nonaktif.
    expect(screen.getByRole("button", { name: /^Senin, 16 November 2026/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Selasa, 17 November 2026/ })).toBeDisabled();
  });

  it("memilih Dari di luar batas menyamakan Sampai dengan Dari", async () => {
    const onChange = vi.fn();
    render(<Harness initial={NOV} maxDays={7} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Dari"));
    await userEvent.click(screen.getByRole("button", { name: /^Senin, 2 November 2026/ }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-11-02", to: "2026-11-02" });
  });
});
