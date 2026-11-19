import type { ColumnSuggestion, ImportFieldKey } from "@hris/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MappingStep } from "@/features/employee/import/mapping-step";

const confident: ColumnSuggestion[] = [
  { column: 0, letter: "A", header: "NIP", field: "employeeNumber", confidence: 1, derived: false },
  { column: 1, letter: "B", header: "NAMA", field: "fullName", confidence: 0.9, derived: false },
  { column: 2, letter: "C", header: "NO", field: null, confidence: 0, derived: true },
];

function Fixture({
  suggestions = confident,
  initialMapping = suggestions.map((s) => s.field),
  cells = ["EMP-1", "Ani", 1],
}: {
  suggestions?: ColumnSuggestion[];
  initialMapping?: (ImportFieldKey | null)[];
  cells?: (string | number | null)[];
}) {
  const [mapping, setMapping] = useState(initialMapping);
  return (
    <MappingStep
      fileName="karyawan.csv"
      sheets={["Karyawan"]}
      sheetIndex={0}
      onSheetChange={vi.fn()}
      headerRow={1}
      rows={[{ sourceRow: 2, cells }]}
      suggestions={suggestions}
      mapping={mapping}
      onMappingChange={setMapping}
      savedProfile={false}
      saveProfile={true}
      onSaveProfileChange={vi.fn()}
      onBack={vi.fn()}
      onNext={vi.fn()}
      busy={false}
    />
  );
}

describe("Ringkasan pemetaan kolom", () => {
  it("meringkas kolom yakin dan bisa membuka serta menutup rincian", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    expect(screen.getByText(/2 kolom dikenali otomatis/)).toBeInTheDocument();
    expect(screen.getByText("1 kolom tidak dipakai (NO) — tidak apa-apa")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Lihat / ubah rincian" });
    await user.click(toggle);
    expect(screen.getByRole("table", { name: "Pemetaan kolom" })).toBeInTheDocument();
    expect(screen.getByText("Judul kolom di file")).toBeInTheDocument();
    expect(screen.getByText("Yakin?")).toBeInTheDocument();
    expect(screen.getAllByText("Ya")).toHaveLength(2);
    await user.click(toggle);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each([0.5, 0.7])("membuka tabel dan mendahulukan kolom dengan keyakinan %s", (confidence) => {
    render(
      <Fixture suggestions={confident.map((s) => (s.column === 1 ? { ...s, confidence } : s))} />,
    );
    expect(screen.getByText("Periksa 1 kolom yang ditandai kuning")).toBeInTheDocument();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent("NAMA");
    expect(rows[1]).toHaveClass("bg-amber-50");
    expect(rows[1]).toHaveTextContent(confidence < 0.6 ? "Kurang yakin" : "Mungkin");
  });

  it("tetap membuka tabel dan menampilkan peringatan bila NIP/NIK belum dipetakan", () => {
    render(<Fixture initialMapping={[null, "fullName", null]} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pilih kolom mana yang berisi NIP atau No. KTP",
    );
    expect(screen.getByRole("button", { name: "Lanjut" })).toBeDisabled();
  });

  it("menandai kolom tak dikenal yang berisi data, termasuk angka nol", () => {
    render(
      <Fixture
        suggestions={[
          ...confident,
          { column: 3, letter: "D", header: "LAINNYA", field: null, confidence: 0, derived: false },
        ]}
        cells={["EMP-1", "Ani", 1, 0]}
      />,
    );
    expect(screen.getByText("Periksa 1 kolom yang ditandai kuning")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent("LAINNYA");
  });

  it("pilihan manual menyelesaikan pemeriksaan tanpa mengubah syarat Lanjut", () => {
    render(
      <Fixture
        suggestions={confident.map((s) => (s.column === 1 ? { ...s, confidence: 0.5 } : s))}
        initialMapping={["employeeNumber", "nickname", null]}
      />,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lanjut" })).toBeEnabled();
  });
  it("membatasi ringkasan kolom tidak dipakai ke empat judul dan mengabaikan sel kosong", () => {
    const unused = ["NO", "USIA", "LAMA KERJA", "CATATAN", "LAINNYA"].map((header, index) => ({
      column: index + 2,
      letter: String.fromCharCode(67 + index),
      header,
      field: null,
      confidence: 0,
      derived: index < 4,
    }));
    render(
      <Fixture
        suggestions={[...confident.slice(0, 2), ...unused]}
        cells={["EMP-1", "Ani", 1, 20, 2, "", "   "]}
      />,
    );
    expect(
      screen.getByText("5 kolom tidak dipakai (NO, USIA, LAMA KERJA, CATATAN, …) — tidak apa-apa"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("menggunakan NIK KTP sebagai pengenal dan tetap menampilkan badge manual serta diabaikan", async () => {
    const user = userEvent.setup();
    render(<Fixture initialMapping={["ktpNumber", null, null]} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lihat / ubah rincian" }));
    expect(screen.getByText("Dipilih manual")).toBeInTheDocument();
    expect(screen.getByText("Diabaikan")).toBeInTheDocument();
    expect(screen.getByText("Dihitung sistem")).toBeInTheDocument();
  });
});
