import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HrLevelChip } from "@/features/employee/components/hr-level-chip";

// ORG-D8: penanda kode level HR di detail & header profil — hanya bila kode ≠ level jabatan.
describe("HrLevelChip", () => {
  it("3A pada jabatan L3 → chip dengan penjelasan sub-level", () => {
    render(
      <TooltipProvider>
        <HrLevelChip code="3A" level="L3" />
      </TooltipProvider>,
    );
    const chip = screen.getByRole("button", { name: /Kode HR di file: 3A/ });
    expect(chip).toHaveTextContent("Kode HR 3A");
    expect(chip).toHaveAccessibleName(/dimasukkan ke L3 \(sub-level belum ada\)/);
  });

  it("kode sama persis dengan level jabatan atau kosong → tidak tampil", () => {
    const { container, rerender } = render(<HrLevelChip code="1A" level="L1A" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<HrLevelChip code={null} level="L3" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("1 tanpa A/B → chip ambigu", () => {
    render(
      <TooltipProvider>
        <HrLevelChip code="1" level="L1B" />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button")).toHaveAccessibleName(/tanpa A\/B/);
  });
});
